import { HTTP } from '../../../constants/defaults/http-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage } from '../../../utils/error.utils';
import {
    createPinnedAddressLookup,
    resolveSafeRemoteAddresses,
} from '../../../utils/remote-host-security.utils';
import { createQueueConnectionIdentity } from './connection-identity';
import { QueueConnectionConfig } from './queue-adapter.interface';
import {
    resolveRabbitMqConnection,
    type ResolvedRabbitMqConnection,
} from './rabbitmq-connection';
import {
    type AmqpChannel,
    type AmqpConfirmChannel,
    type AmqpConnection,
    RabbitMqAdapterState,
    type RabbitMqConnectionEntry,
} from './rabbitmq-amqp.state';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.RABBITMQ_ADAPTER);

export function getRabbitMqConnectionKey(
    config: QueueConnectionConfig,
): string {
    return createQueueConnectionIdentity('rabbitmq-amqp', config);
}

function buildAmqpUrl(config: ResolvedRabbitMqConnection): string {
    const protocol = config.useTls ? 'amqps' : 'amqp';
    const username = encodeURIComponent(config.username);
    const password = encodeURIComponent(config.password);
    const vhost = encodeURIComponent(config.vhost);

    return `${protocol}://${username}:${password}@${config.host}:${config.port}/${vhost}`;
}

export async function closeAmqpResources(
    resources: {
        channel?: AmqpChannel;
        connection?: Pick<AmqpConnection, 'close'>;
    },
    phase: string,
): Promise<void> {
    const closeOperations = [
        resources.channel && {
            label: 'channel',
            close: () => resources.channel!.close(),
        },
        resources.connection && {
            label: 'connection',
            close: () => resources.connection!.close(),
        },
    ].filter((resource): resource is { label: string; close: () => Promise<void> } => Boolean(resource));
    for (const resource of closeOperations) {
        try {
            await resource.close();
        } catch (error) {
            logger.warn(
                `RabbitMQ: Failed to close ${resource.label} during ${phase}`,
                { error: getErrorMessage(error) },
            );
        }
    }
}

export async function getRabbitMqConnection(
    state: RabbitMqAdapterState,
    config: QueueConnectionConfig,
): Promise<{
    connection: AmqpConnection;
    channel: AmqpConfirmChannel;
}> {
    const key = getRabbitMqConnectionKey(config);
    const existing = state.connectionPool.get(key);
    if (existing) {
        existing.lastUsed = Date.now();
        return { connection: existing.connection, channel: existing.channel };
    }

    const pending = state.connectingPromises.get(key);
    if (pending) {
        return pending;
    }

    const connectPromise = (async () => {
        let connection: AmqpConnection | undefined;
        let channel: AmqpConfirmChannel | undefined;
        try {
            const amqplib = await import('amqplib');
            const resolvedConfig = resolveRabbitMqConnection(config, 'AMQP');
            const remotes = await resolveSafeRemoteAddresses(
                resolvedConfig.host,
            );
            connection = await amqplib.connect(
                buildAmqpUrl(resolvedConfig),
                {
                    timeout: HTTP.TIMEOUT_MS,
                    lookup: createPinnedAddressLookup(remotes),
                },
            ) as unknown as AmqpConnection;
            channel = await connection.createConfirmChannel();
            const activeConnection = connection;
            const activeChannel = channel;

            const cleanupConnection = () => {
                const current = state.connectionPool.get(key);
                if (current?.connection !== activeConnection) return;
                state.connectionPool.delete(key);
                state.removeConnectionState(key);
            };
            const invalidateConnection = (phase: string) => {
                const current = state.connectionPool.get(key);
                if (current?.connection !== activeConnection) return;
                state.connectionPool.delete(key);
                state.removeConnectionState(key);
                state.trackCleanup(closeAmqpResources(current, phase));
            };

            activeConnection.on('error', error => {
                logger.warn('RabbitMQ: Connection failed', {
                    error: getErrorMessage(error),
                });
                invalidateConnection('connection failure');
            });
            activeConnection.on('close', cleanupConnection);

            activeChannel.on('error', error => {
                logger.warn('RabbitMQ: Channel failed', {
                    error: getErrorMessage(error),
                });
                invalidateConnection('channel failure');
            });
            activeChannel.on('close', () => {
                invalidateConnection('channel close');
            });

            const entry: RabbitMqConnectionEntry = {
                connection: activeConnection,
                channel: activeChannel,
                lastUsed: Date.now(),
            };

            if (state.connectionPool.size >= QUEUE.RABBITMQ_MAX_CONNECTIONS) {
                let oldestKey: string | null = null;
                let oldestTime = Infinity;
                for (const [connectionKey, pooled] of state.connectionPool.entries()) {
                    if (
                        !state.hasPendingMessages(connectionKey) &&
                        !state.hasActiveSubscriptions(connectionKey) &&
                        pooled.lastUsed < oldestTime
                    ) {
                        oldestTime = pooled.lastUsed;
                        oldestKey = connectionKey;
                    }
                }
                if (!oldestKey) {
                    throw new Error(
                        'RabbitMQ connection pool is at capacity with active deliveries',
                    );
                }
                const stale = state.connectionPool.get(oldestKey);
                if (stale) {
                    state.connectionPool.delete(oldestKey);
                    state.removeConnectionState(oldestKey);
                    await closeAmqpResources(stale, 'pool eviction');
                }
            }

            state.connectionPool.set(key, entry);
            return { connection: activeConnection, channel: activeChannel };
        } catch (error) {
            await closeAmqpResources({ connection, channel }, 'connection setup');
            throw error;
        } finally {
            state.connectingPromises.delete(key);
        }
    })();

    state.connectingPromises.set(key, connectPromise);
    return connectPromise;
}

export async function closeRabbitMqConnection(
    state: RabbitMqAdapterState,
    config: QueueConnectionConfig,
): Promise<void> {
    const key = getRabbitMqConnectionKey(config);
    const entry = state.connectionPool.get(key);
    if (!entry) return;

    state.connectionPool.delete(key);
    state.removeConnectionState(key);
    await closeAmqpResources(entry, 'explicit close');
}
