/**
 * RabbitMQ AMQP Adapter
 *
 * Production-ready RabbitMQ adapter using AMQP 0-9-1 protocol via amqplib.
 * Features:
 * - Connection pooling with automatic reconnection
 * - Channel management with prefetch support
 * - Proper message acknowledgment (ack/nack)
 * - Publisher confirms for guaranteed delivery
 * - Automatic queue declaration
 */

import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
} from './queue-adapter.interface';
import { JsonObject } from '../../../types/index';
import { AckMode, INTERNAL_TIMINGS, LOGGER_CONTEXTS, CONTENT_TYPES } from '../../../constants';
import { DataHubLogger } from '../../../services/logger';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import { getErrorMessage } from '../../../utils/error.utils';

const logger = new DataHubLogger(LOGGER_CONTEXTS.RABBITMQ_ADAPTER);

// Types for amqplib - using any for flexibility since types may vary by version
type AmqpConnection = {
    createConfirmChannel(): Promise<AmqpChannel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
};

type AmqpChannel = {
    assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
    publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>, callback?: (err: Error | null) => void): boolean;
    get(queue: string, options?: { noAck?: boolean }): Promise<AmqpMessage | false>;
    ack(message: { fields: { deliveryTag: number } }): void;
    nack(message: { fields: { deliveryTag: number } }, allUpTo?: boolean, requeue?: boolean): void;
    prefetch(count: number): Promise<void>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
};

type AmqpMessage = {
    content: Buffer;
    fields: {
        deliveryTag: number;
        redelivered: boolean;
    };
    properties: {
        messageId?: string;
        headers?: Record<string, unknown>;
    };
};

/**
 * Connection pool entry
 */
interface ConnectionEntry {
    connection: AmqpConnection;
    channel: AmqpChannel;
    lastUsed: number;
}

/**
 * Connection pool for RabbitMQ connections
 */
const MAX_CONNECTIONS = 100;
const connectionPool = new Map<string, ConnectionEntry>();
const connectingPromises = new Map<string, Promise<{ connection: AmqpConnection; channel: AmqpChannel }>>();

/**
 * Generate a unique key for a connection configuration
 */
function getConnectionKey(config: QueueConnectionConfig): string {
    return `${config.host}:${config.port}:${config.username ?? 'guest'}:${config.vhost ?? '/'}`;
}

/**
 * Build AMQP URL from configuration
 */
function buildAmqpUrl(config: QueueConnectionConfig): string {
    const protocol = config.useTls ? 'amqps' : 'amqp';
    const username = encodeURIComponent(config.username ?? 'guest');
    const password = encodeURIComponent(config.password ?? 'guest');
    const host = config.host ?? 'localhost';
    if (isBlockedHostname(host)) {
        throw new Error(`SSRF protection: hostname '${host}' is blocked for security reasons`);
    }
    const port = config.port ?? 5672;
    const vhost = encodeURIComponent(config.vhost ?? '/');

    return `${protocol}://${username}:${password}@${host}:${port}/${vhost}`;
}

/**
 * Get or create a connection from the pool
 */
async function getConnection(config: QueueConnectionConfig): Promise<{
    connection: AmqpConnection;
    channel: AmqpChannel;
}> {
    const key = getConnectionKey(config);
    const existing = connectionPool.get(key);

    // Return existing valid connection
    if (existing) {
        existing.lastUsed = Date.now();
        return { connection: existing.connection, channel: existing.channel };
    }

    // If another caller is already connecting, await the same promise
    const pending = connectingPromises.get(key);
    if (pending) {
        return pending;
    }

    // Create connection promise that concurrent callers can share
    const connectPromise = (async () => {
        try {
            const amqplib = await import('amqplib');
            const url = buildAmqpUrl(config);
            const connection = await amqplib.connect(url) as unknown as AmqpConnection;

            connection.on('error', () => {
                connectionPool.delete(key);
            });

            connection.on('close', () => {
                connectionPool.delete(key);
            });

            const channel = await connection.createConfirmChannel();
            await channel.prefetch(10);

            channel.on('error', () => {
                connectionPool.delete(key);
            });

            const entry: ConnectionEntry = {
                connection,
                channel,
                lastUsed: Date.now(),
            };

            // Evict oldest connection if pool is at capacity
            if (connectionPool.size >= MAX_CONNECTIONS) {
                let oldestKey: string | null = null;
                let oldestTime = Infinity;
                for (const [k, e] of connectionPool.entries()) {
                    if (e.lastUsed < oldestTime) {
                        oldestTime = e.lastUsed;
                        oldestKey = k;
                    }
                }
                if (oldestKey) {
                    const stale = connectionPool.get(oldestKey);
                    if (stale) {
                        stale.channel.close().catch(() => { /* ignore */ });
                        stale.connection.close().catch(() => { /* ignore */ });
                    }
                    connectionPool.delete(oldestKey);
                }
            }

            connectionPool.set(key, entry);
            return { connection, channel };
        } finally {
            connectingPromises.delete(key);
        }
    })();

    connectingPromises.set(key, connectPromise);
    return connectPromise;
}

/**
 * Close a connection and remove from pool
 */
async function closeConnection(config: QueueConnectionConfig): Promise<void> {
    const key = getConnectionKey(config);
    const entry = connectionPool.get(key);

    if (entry) {
        try {
            await entry.channel.close();
            await entry.connection.close();
        } catch {
            // Ignore close errors
        }
        connectionPool.delete(key);
    }
}

/**
 * Pending acks/nacks storage (for manual acknowledgment)
 * Includes timestamp for cleanup of stale entries
 */
interface PendingMessage {
    channel: AmqpChannel;
    deliveryTag: number;
    createdAt: number;
}
const pendingMessages = new Map<string, PendingMessage>();

export class RabbitMQAmqpAdapter implements QueueAdapter {
    readonly code = 'rabbitmq-amqp';
    readonly name = 'RabbitMQ (AMQP)';
    readonly description = 'RabbitMQ message broker using native AMQP 0-9-1 protocol';

    private connectionCleanupHandle?: ReturnType<typeof setInterval>;
    private pendingMessagesCleanupHandle?: ReturnType<typeof setInterval>;

    /**
     * Start the periodic cleanup intervals for idle connections and stale pending messages.
     * Called automatically on first use; safe to call multiple times.
     */
    startCleanup(): void {
        if (!this.connectionCleanupHandle) {
            this.connectionCleanupHandle = setInterval(() => {
                const now = Date.now();
                for (const [key, entry] of connectionPool.entries()) {
                    if (now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS) {
                        entry.channel.close().catch((err) => {
                            logger.warn('RabbitMQ: Failed to close channel during cleanup', { error: err?.message ?? err });
                        });
                        entry.connection.close().catch((err) => {
                            logger.warn('RabbitMQ: Failed to close connection during cleanup', { error: err?.message ?? err });
                        });
                        connectionPool.delete(key);
                    }
                }
            }, 60_000);

            if (typeof this.connectionCleanupHandle.unref === 'function') {
                this.connectionCleanupHandle.unref();
            }
        }

        if (!this.pendingMessagesCleanupHandle) {
            const maxAgeMs = INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS;
            this.pendingMessagesCleanupHandle = setInterval(() => {
                const now = Date.now();
                let cleanedCount = 0;
                for (const [key, entry] of pendingMessages.entries()) {
                    if (now - entry.createdAt > maxAgeMs) {
                        pendingMessages.delete(key);
                        cleanedCount++;
                    }
                }
                if (cleanedCount > 0) {
                    logger.debug('RabbitMQ: Cleaned up stale pending messages', { cleanedCount });
                }
            }, INTERNAL_TIMINGS.PENDING_MESSAGES_CLEANUP_INTERVAL_MS ?? 60_000);

            if (typeof this.pendingMessagesCleanupHandle.unref === 'function') {
                this.pendingMessagesCleanupHandle.unref();
            }
        }
    }

    /**
     * Stop the periodic cleanup intervals and close all pooled connections.
     * Call during graceful shutdown to prevent intervals from keeping the process alive.
     */
    async destroy(): Promise<void> {
        if (this.connectionCleanupHandle) {
            clearInterval(this.connectionCleanupHandle);
            this.connectionCleanupHandle = undefined;
        }
        if (this.pendingMessagesCleanupHandle) {
            clearInterval(this.pendingMessagesCleanupHandle);
            this.pendingMessagesCleanupHandle = undefined;
        }

        for (const [key, entry] of connectionPool.entries()) {
            try {
                await entry.channel.close();
                await entry.connection.close();
            } catch {
                // Ignore close errors during shutdown
            }
            connectionPool.delete(key);
        }
        pendingMessages.clear();
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const { channel } = await getConnection(connectionConfig);
        const results: PublishResult[] = [];

        // Ensure queue exists
        await channel.assertQueue(queueName, {
            durable: true,
            arguments: {
                'x-queue-type': 'classic',
            },
        });

        for (const msg of messages) {
            try {
                const content = Buffer.from(JSON.stringify(msg.payload));
                const options: Record<string, unknown> = {
                    messageId: msg.id,
                    persistent: msg.persistent ?? true,
                    priority: msg.priority,
                    expiration: msg.ttlMs ? String(msg.ttlMs) : undefined,
                    headers: msg.headers ?? {},
                    contentType: CONTENT_TYPES.JSON,
                    contentEncoding: 'utf-8',
                };

                // Use routing key or queue name
                const routingKey = msg.routingKey ?? queueName;

                // Publish with confirm
                const published = await new Promise<boolean>((resolve, reject) => {
                    channel.publish(
                        '', // Default exchange
                        routingKey,
                        content,
                        options,
                        (err: Error | null) => {
                            if (err) reject(err);
                            else resolve(true);
                        },
                    );
                });

                results.push({
                    success: published,
                    messageId: msg.id,
                });
            } catch (error) {
                results.push({
                    success: false,
                    messageId: msg.id,
                    error: getErrorMessage(error),
                });
            }
        }

        return results;
    }

    async consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: {
            count: number;
            ackMode: AckMode;
            prefetch?: number;
        },
    ): Promise<ConsumeResult[]> {
        this.startCleanup();
        const { channel } = await getConnection(connectionConfig);
        const results: ConsumeResult[] = [];

        // Set prefetch if specified
        if (options.prefetch) {
            await channel.prefetch(options.prefetch);
        }

        // Ensure queue exists
        await channel.assertQueue(queueName, { durable: true });

        // Get messages one by one up to count
        for (let i = 0; i < options.count; i++) {
            const msg = await channel.get(queueName, {
                noAck: options.ackMode === AckMode.AUTO,
            });

            if (!msg) {
                break; // No more messages
            }

            let payload: JsonObject;
            try {
                payload = JSON.parse(msg.content.toString('utf-8'));
            } catch {
                // JSON parse failed - wrap raw payload
                payload = { rawPayload: msg.content.toString('utf-8') };
            }

            const messageId = msg.properties.messageId || crypto.randomUUID();
            const deliveryTag = `${getConnectionKey(connectionConfig)}:${msg.fields.deliveryTag}`;

            // Store for manual ack/nack with timestamp for cleanup
            if (options.ackMode === AckMode.MANUAL) {
                const maxPending = INTERNAL_TIMINGS.MAX_PENDING_MESSAGES ?? 10_000;
                if (pendingMessages.size >= maxPending) {
                    // Evict oldest pending message by createdAt and auto-nack it
                    let oldestKey: string | null = null;
                    let oldestTime = Infinity;
                    for (const [key, entry] of pendingMessages.entries()) {
                        if (entry.createdAt < oldestTime) {
                            oldestTime = entry.createdAt;
                            oldestKey = key;
                        }
                    }
                    if (oldestKey) {
                        const stale = pendingMessages.get(oldestKey);
                        if (stale) {
                            try {
                                stale.channel.nack(
                                    { fields: { deliveryTag: stale.deliveryTag } },
                                    false,
                                    true, // requeue
                                );
                            } catch {
                                // Channel may be closed; ignore nack error
                            }
                            pendingMessages.delete(oldestKey);
                        }
                        logger.warn('Pending messages map at capacity; evicted oldest entry', {
                            evictedKey: oldestKey,
                            maxPending,
                            currentSize: pendingMessages.size,
                        });
                    }
                }

                pendingMessages.set(deliveryTag, {
                    channel,
                    deliveryTag: msg.fields.deliveryTag,
                    createdAt: Date.now(),
                });
            }

            results.push({
                messageId,
                payload,
                headers: msg.properties.headers as Record<string, string> | undefined,
                deliveryTag,
                redelivered: msg.fields.redelivered,
            });
        }

        return results;
    }

    async ack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        pending.channel.ack({ fields: { deliveryTag: pending.deliveryTag } });
        pendingMessages.delete(deliveryTag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        pending.channel.nack(
            { fields: { deliveryTag: pending.deliveryTag } },
            false, // Don't affect other messages
            requeue,
        );
        pendingMessages.delete(deliveryTag);
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const { connection } = await getConnection(connectionConfig);
            return connection !== null;
        } catch {
            // Connection test failed - return false
            return false;
        }
    }

    /**
     * Close connection (useful for cleanup)
     */
    async close(connectionConfig: QueueConnectionConfig): Promise<void> {
        await closeConnection(connectionConfig);
    }
}

export const rabbitmqAmqpAdapter = new RabbitMQAmqpAdapter();
