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
import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { CONTENT_TYPES } from '../../../constants/services';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { createQueueConnectionIdentity } from './connection-identity';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.RABBITMQ_ADAPTER);

// Minimal structural interfaces isolate the adapter from amqplib version-specific types.
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
    return createQueueConnectionIdentity('rabbitmq-amqp', config);
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
            const channel = await connection.createConfirmChannel();

            const cleanupConnection = () => {
                const current = connectionPool.get(key);
                if (current?.connection === connection) {
                    connectionPool.delete(key);
                }
                removePendingMessagesForChannel(channel);
            };

            connection.on('error', cleanupConnection);
            connection.on('close', cleanupConnection);

            await channel.prefetch(10);

            channel.on('error', () => {
                const current = connectionPool.get(key);
                if (current?.channel === channel) {
                    connectionPool.delete(key);
                }
                removePendingMessagesForChannel(channel);
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
                    if (
                        !hasPendingMessagesForConnection(k) &&
                        e.lastUsed < oldestTime
                    ) {
                        oldestTime = e.lastUsed;
                        oldestKey = k;
                    }
                }
                if (!oldestKey) {
                    await channel.close().catch(() => undefined);
                    await connection.close().catch(() => undefined);
                    throw new Error(
                        'RabbitMQ connection pool is at capacity with active deliveries',
                    );
                }
                const stale = connectionPool.get(oldestKey);
                if (stale) {
                    stale.channel.close().catch(() => undefined);
                    stale.connection.close().catch(() => undefined);
                    removePendingMessagesForChannel(stale.channel);
                }
                connectionPool.delete(oldestKey);
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
        removePendingMessagesForChannel(entry.channel);
        connectionPool.delete(key);
    }
}

/**
 * Pending acks/nacks storage for manual acknowledgment.
 */
interface PendingMessage {
    channel: AmqpChannel;
    deliveryTag: number;
    connectionIdentity: string;
}
const pendingMessages = new Map<string, PendingMessage>();

function hasPendingMessagesForConnection(connectionIdentity: string): boolean {
    return [...pendingMessages.values()].some(
        pending => pending.connectionIdentity === connectionIdentity,
    );
}

function removePendingMessagesForChannel(channel: AmqpChannel): void {
    for (const [deliveryTag, pending] of pendingMessages.entries()) {
        if (pending.channel === channel) {
            pendingMessages.delete(deliveryTag);
        }
    }
}

export class RabbitMQAmqpAdapter implements QueueAdapter {
    readonly code = 'rabbitmq-amqp';
    readonly name = 'RabbitMQ (AMQP)';
    readonly description = 'RabbitMQ message broker using native AMQP 0-9-1 protocol';

    private connectionCleanupHandle?: ReturnType<typeof setInterval>;

    /**
     * Start the periodic cleanup intervals for idle connections and stale pending messages.
     * Called automatically on first use; safe to call multiple times.
     */
    startCleanup(): void {
        if (!this.connectionCleanupHandle) {
            this.connectionCleanupHandle = setInterval(() => {
                const now = Date.now();
                const activeConnections = new Set(
                    [...pendingMessages.values()].map(entry => entry.connectionIdentity),
                );
                for (const [key, entry] of connectionPool.entries()) {
                    if (
                        !activeConnections.has(key) &&
                        now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS
                    ) {
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
                if (pendingMessages.size >= QUEUE.MAX_PENDING_MESSAGES) {
                    channel.nack(
                        { fields: { deliveryTag: msg.fields.deliveryTag } },
                        false,
                        true,
                    );
                    logger.warn('Pending message capacity reached; delivery was requeued', {
                        maxPending: QUEUE.MAX_PENDING_MESSAGES,
                        currentSize: pendingMessages.size,
                    });
                    continue;
                }

                pendingMessages.set(deliveryTag, {
                    channel,
                    deliveryTag: msg.fields.deliveryTag,
                    connectionIdentity: getConnectionKey(connectionConfig),
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
        if (pending.connectionIdentity !== getConnectionKey(connectionConfig)) {
            throw new Error('RabbitMQ delivery tag belongs to a different connection');
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
        if (pending.connectionIdentity !== getConnectionKey(connectionConfig)) {
            throw new Error('RabbitMQ delivery tag belongs to a different connection');
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
