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
    QueueConsumeOptions,
} from './queue-adapter.interface';
import { JsonObject } from '../../../types/index';
import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { CONTENT_TYPES } from '../../../constants/services';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { requirePositiveInteger } from './queue-message.utils';
import {
    closeAmqpResources,
    closeRabbitMqConnection,
    getRabbitMqConnection,
    getRabbitMqConnectionKey,
} from './rabbitmq-amqp.connection';
import { RabbitMqAdapterState } from './rabbitmq-amqp.state';
import {
    closeRabbitMqSubscription,
    closeRabbitMqSubscriptions,
    closeRabbitMqSubscriptionsForConnection,
    ensureRabbitMqSubscription,
} from './rabbitmq-amqp.consumer';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.RABBITMQ_ADAPTER);

export class RabbitMQAmqpAdapter implements QueueAdapter {
    readonly code = 'rabbitmq-amqp';
    readonly name = 'RabbitMQ (AMQP)';
    readonly description = 'RabbitMQ message broker using native AMQP 0-9-1 protocol';

    private readonly state = new RabbitMqAdapterState();
    private connectionCleanupHandle?: ReturnType<typeof setInterval>;

    /**
     * Start the periodic cleanup intervals for idle connections and stale pending messages.
     * Called automatically on first use; safe to call multiple times.
     */
    startCleanup(): void {
        if (!this.connectionCleanupHandle) {
            this.connectionCleanupHandle = setInterval(() => {
                const now = Date.now();
                for (const pending of this.state.takeExpiredPendingMessages(
                    now,
                    INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS,
                )) {
                    try {
                        pending.channel.nack(
                            { fields: { deliveryTag: pending.deliveryTag } },
                            false,
                            true,
                        );
                    } catch (error) {
                        logger.warn('RabbitMQ: Failed to requeue stale delivery', {
                            error: getErrorMessage(error),
                        });
                    }
                }
                for (const [key, entry] of this.state.connectionPool.entries()) {
                    if (
                        !this.state.hasPendingMessages(key) &&
                        !this.state.hasActiveSubscriptions(key) &&
                        now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS
                    ) {
                        this.state.connectionPool.delete(key);
                        this.state.trackCleanup(
                            closeAmqpResources(entry, 'idle cleanup'),
                        );
                    }
                }
            }, INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);

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
        await Promise.allSettled(this.state.connectingPromises.values());
        await closeRabbitMqSubscriptions(this.state);
        const pooledConnections = [...this.state.connectionPool.values()];
        this.state.connectionPool.clear();
        await Promise.all([
            ...this.state.cleanupOperations,
            ...pooledConnections.map(entry =>
                closeAmqpResources(entry, 'adapter shutdown'),
            ),
        ]);
        this.state.pendingMessages.clear();
        this.state.subscriptionCapacityReservations.clear();
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const { channel } = await getRabbitMqConnection(
            this.state,
            connectionConfig,
        );
        const results: PublishResult[] = [];

        await channel.assertQueue(queueName, {
            durable: true,
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
        options: QueueConsumeOptions,
    ): Promise<ConsumeResult[]> {
        this.startCleanup();
        const requestedCount = requirePositiveInteger(
            options.count,
            'RabbitMQ consume count',
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
        );
        const prefetch = requirePositiveInteger(
            options.prefetch ?? QUEUE.DEFAULT_MESSAGE_BATCH_SIZE,
            'RabbitMQ prefetch',
            QUEUE.MAX_MESSAGE_PREFETCH,
        );
        const connectionIdentity = getRabbitMqConnectionKey(connectionConfig);
        const consumerId = this.resolveConsumerId(
            options.consumerId,
            connectionIdentity,
            queueName,
        );
        const { connection } = await getRabbitMqConnection(
            this.state,
            connectionConfig,
        );
        const subscription = await ensureRabbitMqSubscription(
            this.state,
            connection,
            {
                consumerId,
                connectionIdentity,
                queueName,
                prefetch,
                ackMode: options.ackMode,
            },
        );
        const messages = subscription.deliveries.splice(0, requestedCount);
        const results: ConsumeResult[] = [];

        for (const message of messages) {
            let payload: JsonObject;
            try {
                payload = JSON.parse(message.content.toString('utf-8'));
            } catch {
                payload = { rawPayload: message.content.toString('utf-8') };
            }

            const messageId = message.properties.messageId || crypto.randomUUID();
            let deliveryTag: string | undefined;
            if (options.ackMode === AckMode.MANUAL) {
                deliveryTag = crypto.randomUUID();
                this.state.pendingMessages.set(deliveryTag, {
                    channel: subscription.channel,
                    deliveryTag: message.fields.deliveryTag,
                    connectionIdentity,
                    createdAt: Date.now(),
                });
            } else {
                subscription.channel.ack(message);
            }

            results.push({
                messageId,
                payload,
                headers: message.properties.headers as Record<string, string> | undefined,
                deliveryTag,
                redelivered: message.fields.redelivered,
            });
        }

        return results;
    }

    async stopConsumer(consumerId: string): Promise<void> {
        await closeRabbitMqSubscription(this.state, consumerId);
    }

    async ack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        const pending = this.state.pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }
        if (pending.connectionIdentity !== getRabbitMqConnectionKey(connectionConfig)) {
            throw new Error('RabbitMQ delivery tag belongs to a different connection');
        }

        pending.channel.ack({ fields: { deliveryTag: pending.deliveryTag } });
        this.state.pendingMessages.delete(deliveryTag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = this.state.pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }
        if (pending.connectionIdentity !== getRabbitMqConnectionKey(connectionConfig)) {
            throw new Error('RabbitMQ delivery tag belongs to a different connection');
        }

        pending.channel.nack(
            { fields: { deliveryTag: pending.deliveryTag } },
            false, // Don't affect other messages
            requeue,
        );
        this.state.pendingMessages.delete(deliveryTag);
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const { connection } = await getRabbitMqConnection(
                this.state,
                connectionConfig,
            );
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
        await closeRabbitMqSubscriptionsForConnection(
            this.state,
            getRabbitMqConnectionKey(connectionConfig),
        );
        await closeRabbitMqConnection(this.state, connectionConfig);
    }

    private resolveConsumerId(
        consumerId: string | undefined,
        connectionIdentity: string,
        queueName: string,
    ): string {
        if (consumerId === undefined) {
            return `direct:${connectionIdentity}:${queueName}`;
        }
        if (!consumerId || consumerId.trim() !== consumerId) {
            throw new Error(
                'RabbitMQ consumerId must be a non-empty string without surrounding whitespace',
            );
        }
        return consumerId;
    }
}

export const rabbitmqAmqpAdapter = new RabbitMQAmqpAdapter();
