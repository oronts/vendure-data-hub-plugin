import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import type { AckMode } from '../../../constants/enums';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { closeAmqpResources } from './rabbitmq-amqp.connection';
import {
    type AmqpConnection,
    type AmqpMessage,
    RabbitMqAdapterState,
    type RabbitMqSubscription,
} from './rabbitmq-amqp.state';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.RABBITMQ_ADAPTER);

interface SubscriptionConfig {
    consumerId: string;
    connectionIdentity: string;
    queueName: string;
    prefetch: number;
    ackMode: AckMode;
}

function matchesSubscription(
    subscription: RabbitMqSubscription,
    config: SubscriptionConfig,
): boolean {
    return !subscription.closed
        && subscription.connectionIdentity === config.connectionIdentity
        && subscription.queueName === config.queueName
        && subscription.prefetch === config.prefetch
        && subscription.ackMode === config.ackMode;
}

function invalidateSubscription(
    state: RabbitMqAdapterState,
    subscription: RabbitMqSubscription,
): void {
    subscription.closed = true;
    subscription.deliveries.length = 0;
    state.removePendingMessagesForChannel(subscription.channel);
    if (state.subscriptions.get(subscription.consumerId) === subscription) {
        state.subscriptions.delete(subscription.consumerId);
    }
}

function reserveSubscriptionCapacity(
    state: RabbitMqAdapterState,
    consumerId: string,
    prefetch: number,
): void {
    const reserved = state.getReservedSubscriptionCapacity(consumerId);
    if (reserved + prefetch > QUEUE.MAX_PENDING_MESSAGES) {
        throw new Error(
            `RabbitMQ subscription capacity exceeds ${QUEUE.MAX_PENDING_MESSAGES} unsettled deliveries`,
        );
    }
    state.subscriptionCapacityReservations.set(consumerId, prefetch);
}

async function createSubscription(
    state: RabbitMqAdapterState,
    connection: AmqpConnection,
    config: SubscriptionConfig,
): Promise<RabbitMqSubscription> {
    const channel = await connection.createChannel();
    const subscription: RabbitMqSubscription = {
        ...config,
        channel,
        deliveries: [],
        closed: false,
    };

    const invalidate = () => invalidateSubscription(state, subscription);
    channel.on('error', error => {
        logger.warn('RabbitMQ: Consumer channel failed', {
            consumerId: config.consumerId,
            error: getErrorMessage(error),
        });
        invalidate();
    });
    channel.on('close', invalidate);

    try {
        await channel.prefetch(config.prefetch);
        await channel.assertQueue(config.queueName, { durable: true });
        const reply = await channel.consume(
            config.queueName,
            (message: AmqpMessage | null) => {
                if (!message) {
                    invalidate();
                    state.trackCleanup(
                        closeAmqpResources(
                            { channel },
                            'broker consumer cancellation',
                        ),
                    );
                    return;
                }
                if (subscription.closed) {
                    try {
                        channel.nack(message, false, true);
                    } catch (error) {
                        logger.warn('RabbitMQ: Failed to requeue delivery after consumer shutdown', {
                            consumerId: config.consumerId,
                            error: getErrorMessage(error),
                        });
                    }
                    return;
                }
                subscription.deliveries.push(message);
            },
            { noAck: false },
        );
        subscription.consumerTag = reply.consumerTag;
        if (subscription.closed) {
            throw new Error('RabbitMQ consumer channel closed during subscription setup');
        }
        state.subscriptions.set(config.consumerId, subscription);
        return subscription;
    } catch (error) {
        invalidateSubscription(state, subscription);
        await closeAmqpResources({ channel }, 'consumer setup');
        throw error;
    }
}

async function disposeSubscription(
    state: RabbitMqAdapterState,
    subscription: RabbitMqSubscription,
): Promise<void> {
    const { consumerId } = subscription;
    invalidateSubscription(state, subscription);
    if (subscription.consumerTag) {
        try {
            await subscription.channel.cancel(subscription.consumerTag);
        } catch (error) {
            logger.warn('RabbitMQ: Failed to cancel consumer before channel shutdown', {
                consumerId,
                error: getErrorMessage(error),
            });
        }
    }

    try {
        await subscription.channel.close();
    } catch (error) {
        logger.warn('RabbitMQ: Failed to close consumer channel; recycling connection', {
            consumerId,
            error: getErrorMessage(error),
        });
        const entry = state.connectionPool.get(subscription.connectionIdentity);
        if (entry) {
            state.connectionPool.delete(subscription.connectionIdentity);
            state.removeConnectionState(subscription.connectionIdentity);
            await closeAmqpResources(entry, 'consumer channel recovery');
        }
    }
}

export async function ensureRabbitMqSubscription(
    state: RabbitMqAdapterState,
    connection: AmqpConnection,
    config: SubscriptionConfig,
): Promise<RabbitMqSubscription> {
    const existing = state.subscriptions.get(config.consumerId);
    if (existing && matchesSubscription(existing, config)) {
        return existing;
    }

    const pending = state.subscriptionPromises.get(config.consumerId);
    if (pending) {
        await pending;
        return ensureRabbitMqSubscription(state, connection, config);
    }

    const setup = (async () => {
        const current = state.subscriptions.get(config.consumerId);
        if (current && matchesSubscription(current, config)) {
            return current;
        }
        if (current) {
            await disposeSubscription(state, current);
        }

        reserveSubscriptionCapacity(state, config.consumerId, config.prefetch);
        try {
            return await createSubscription(state, connection, config);
        } finally {
            state.subscriptionCapacityReservations.delete(config.consumerId);
        }
    })();
    state.subscriptionPromises.set(config.consumerId, setup);
    try {
        return await setup;
    } finally {
        if (state.subscriptionPromises.get(config.consumerId) === setup) {
            state.subscriptionPromises.delete(config.consumerId);
        }
    }
}

export async function closeRabbitMqSubscription(
    state: RabbitMqAdapterState,
    consumerId: string,
): Promise<void> {
    const pending = state.subscriptionPromises.get(consumerId);
    if (pending) {
        await pending.catch(() => undefined);
    }

    const subscription = state.subscriptions.get(consumerId);
    if (!subscription) return;
    await disposeSubscription(state, subscription);
}

export async function closeRabbitMqSubscriptions(
    state: RabbitMqAdapterState,
): Promise<void> {
    const consumerIds = new Set([
        ...state.subscriptions.keys(),
        ...state.subscriptionPromises.keys(),
    ]);
    await Promise.all(
        [...consumerIds].map(consumerId =>
            closeRabbitMqSubscription(state, consumerId),
        ),
    );
}

export async function closeRabbitMqSubscriptionsForConnection(
    state: RabbitMqAdapterState,
    connectionIdentity: string,
): Promise<void> {
    await Promise.allSettled(state.subscriptionPromises.values());
    const consumerIds = [...state.subscriptions.values()]
        .filter(subscription =>
            subscription.connectionIdentity === connectionIdentity,
        )
        .map(subscription => subscription.consumerId);
    await Promise.all(
        consumerIds.map(consumerId =>
            closeRabbitMqSubscription(state, consumerId),
        ),
    );
}
