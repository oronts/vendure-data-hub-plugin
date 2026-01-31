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
    isConnecting: boolean;
}

/**
 * Connection pool for RabbitMQ connections
 */
const connectionPool = new Map<string, ConnectionEntry>();

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
    const port = config.port ?? 5672;
    const vhost = encodeURIComponent(config.vhost ?? '/');

    return `${protocol}://${username}:${password}@${host}:${port}/${vhost}`;
}

/**
 * Get or create a connection from the pool
 * @param config Connection configuration
 * @param retryCount Current retry attempt (used to prevent infinite recursion)
 */
async function getConnection(config: QueueConnectionConfig, retryCount = 0): Promise<{
    connection: AmqpConnection;
    channel: AmqpChannel;
}> {
    const key = getConnectionKey(config);
    const existing = connectionPool.get(key);
    const maxRetries = INTERNAL_TIMINGS.CONNECTION_RETRY_MAX ?? 10;

    // Return existing valid connection
    if (existing && !existing.isConnecting) {
        existing.lastUsed = Date.now();
        return { connection: existing.connection, channel: existing.channel };
    }

    // Wait if another request is already connecting, but with retry limit to prevent infinite recursion
    if (existing?.isConnecting) {
        if (retryCount >= maxRetries) {
            throw new Error(`Connection timeout: exceeded ${maxRetries} retries waiting for connection to ${key}`);
        }
        await new Promise(resolve => setTimeout(resolve, INTERNAL_TIMINGS.CONNECTION_WAIT_MS));
        return getConnection(config, retryCount + 1);
    }

    // Mark as connecting
    connectionPool.set(key, {
        connection: null as unknown as AmqpConnection,
        channel: null as unknown as AmqpChannel,
        lastUsed: Date.now(),
        isConnecting: true,
    });

    try {
        const amqplib = await import('amqplib');
        const url = buildAmqpUrl(config);
        const connection = await amqplib.connect(url) as unknown as AmqpConnection;

        // Handle connection errors - errors are handled by cleanup, no logging in adapter layer
        connection.on('error', () => {
            connectionPool.delete(key);
        });

        connection.on('close', () => {
            connectionPool.delete(key);
        });

        // Create channel with publisher confirms
        const channel = await connection.createConfirmChannel();

        // Set prefetch for fair dispatch
        await channel.prefetch(10);

        // Handle channel errors - errors are handled by cleanup, no logging in adapter layer
        channel.on('error', () => {
            connectionPool.delete(key);
        });

        const entry: ConnectionEntry = {
            connection,
            channel,
            lastUsed: Date.now(),
            isConnecting: false,
        };

        connectionPool.set(key, entry);
        return { connection, channel };
    } catch (error) {
        connectionPool.delete(key);
        throw error;
    }
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

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
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
                    error: error instanceof Error ? error.message : 'Unknown error',
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

/**
 * Cleanup old connections periodically
 * Uses configurable value from INTERNAL_TIMINGS for consistency
 */
const CONNECTION_MAX_IDLE_MS = INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS ?? 5 * 60 * 1000; // 5 minutes default

const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of connectionPool.entries()) {
        if (now - entry.lastUsed > CONNECTION_MAX_IDLE_MS && !entry.isConnecting) {
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

// Allow process to exit
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

/**
 * Cleanup stale pending messages to prevent memory leaks
 * Messages that have been pending for too long are likely from closed connections
 */
const PENDING_MESSAGES_MAX_AGE_MS = INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS ?? 10 * 60 * 1000; // 10 minutes default

const pendingMessagesCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, entry] of pendingMessages.entries()) {
        if (now - entry.createdAt > PENDING_MESSAGES_MAX_AGE_MS) {
            pendingMessages.delete(key);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        logger.debug('RabbitMQ: Cleaned up stale pending messages', { cleanedCount });
    }
}, INTERNAL_TIMINGS.PENDING_MESSAGES_CLEANUP_INTERVAL_MS ?? 60_000);

// Allow process to exit
if (typeof pendingMessagesCleanupInterval.unref === 'function') {
    pendingMessagesCleanupInterval.unref();
}

export const rabbitmqAmqpAdapter = new RabbitMQAmqpAdapter();
