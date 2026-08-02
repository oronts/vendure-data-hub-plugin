import { RequestContextService, type RequestContext } from '@vendure/core';
import type { PipelineService } from '../pipeline/pipeline.service';
import type { ConnectionService } from '../config/connection.service';
import type { SecretService } from '../config/secret.service';
import { QUEUE } from '../../constants';
import type { DataHubLogger } from '../logger';
import { toErrorOrUndefined } from '../../utils/error.utils';
import {
    queueAdapterRegistry,
    type QueueAdapter,
    type QueueConnectionConfig,
} from '../../sdk/adapters/queue';
import type { ActiveConsumer } from './consumer-lifecycle';
import type { DomainEventsService } from './domain-events.service';
import { MessageDeliveryHandler } from './message-delivery-handler';
import { MessageRunCoordinator } from './message-run-coordinator';
import {
    type ConsumedMessage,
    type QueueRunWaiter,
} from './message-processing.types';
import { waitForSuccessfulQueueRun } from './message-run-waiter';

export { ConsumerLeaseLostError } from './message-processing.types';

const QUEUE_SECRET_FIELDS = [
    ['passwordSecretCode', 'password'],
    ['accessKeyIdSecretCode', 'accessKeyId'],
    ['secretAccessKeySecretCode', 'secretAccessKey'],
    ['privateKeySecretCode', 'privateKey'],
    ['apiKeySecretCode', 'apiKey'],
] as const;

/**
 * Polls queue adapters and delegates each delivery to the run and outcome handlers.
 */
export class MessageProcessing {
    private readonly deliveryHandler: MessageDeliveryHandler;

    constructor(
        private readonly requestContextService: RequestContextService,
        pipelineService: PipelineService,
        private readonly connectionService: ConnectionService,
        private readonly secretService: SecretService,
        private readonly logger: DataHubLogger,
        domainEvents: DomainEventsService,
        queueRunWaiter: QueueRunWaiter = waitForSuccessfulQueueRun,
    ) {
        const runCoordinator = new MessageRunCoordinator(
            requestContextService,
            pipelineService,
            logger,
            domainEvents,
            queueRunWaiter,
        );
        this.deliveryHandler = new MessageDeliveryHandler(runCoordinator, logger);
    }

    startPolling(
        key: string,
        consumer: ActiveConsumer,
        isDestroying: () => boolean,
    ): void {
        let polling = false;
        const poll = async () => {
            if (!consumer.running || isDestroying() || polling) return;
            polling = true;
            consumer.activePollCount = (consumer.activePollCount ?? 0) + 1;

            try {
                await this.pollMessages(consumer);
            } catch (error) {
                this.logger.error(
                    `Poll error for ${key}`,
                    toErrorOrUndefined(error),
                    { pipelineCode: key },
                );
            } finally {
                consumer.activePollCount = Math.max(
                    0,
                    (consumer.activePollCount ?? 1) - 1,
                );
                polling = false;
            }
        };

        void poll();
        consumer.pollTimer = setInterval(() => {
            void poll();
        }, consumer.config.pollIntervalMs);
        if (typeof consumer.pollTimer.unref === 'function') {
            consumer.pollTimer.unref();
        }
    }

    private async pollMessages(consumer: ActiveConsumer): Promise<void> {
        const { config } = consumer;
        const concurrency = Math.min(
            QUEUE.MAX_MESSAGE_CONCURRENCY,
            Math.max(QUEUE.MIN_MESSAGE_CONCURRENCY, config.concurrency),
        );
        const availableSlots = concurrency - consumer.inFlightCount;
        if (availableSlots <= 0) {
            this.logger.debug(`Skipping poll - at max concurrency (${config.concurrency})`, {
                pipelineCode: config.pipelineCode,
                inFlight: consumer.inFlightCount,
            });
            return;
        }

        const adapter = queueAdapterRegistry.get(config.queueType);
        if (!adapter) {
            this.logger.error(`Unknown queue type: ${config.queueType}`, undefined, {
                pipelineCode: config.pipelineCode,
            });
            return;
        }

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const connectionConfig = await this.getConnectionConfig(consumer, ctx);
        if (!connectionConfig) return;

        const batchSize = Math.min(
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
            Math.max(QUEUE.MIN_MESSAGE_BATCH_SIZE, config.batchSize),
        );
        const fetchCount = Math.min(batchSize, availableSlots);
        const prefetch = config.prefetch === undefined
            ? undefined
            : Math.min(
                QUEUE.MAX_MESSAGE_PREFETCH,
                Math.max(QUEUE.MIN_MESSAGE_PREFETCH, config.prefetch),
            );

        try {
            const messages = await adapter.consume(connectionConfig, config.queueName, {
                count: fetchCount,
                ackMode: config.ackMode,
                prefetch,
            });

            if (messages.length === 0) return;
            if (!consumer.running) {
                await Promise.all(messages.map(message => this.deliveryHandler.releaseAfterLeaseLoss(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    'Consumer lease was lost while polling',
                )));
                return;
            }

            this.logger.debug(`Received ${messages.length} messages`, {
                pipelineCode: config.pipelineCode,
                queueName: config.queueName,
                queueType: config.queueType,
            });

            await Promise.all(messages.map(async message => {
                consumer.inFlightCount++;
                try {
                    await this.processDelivery(
                        consumer,
                        adapter,
                        connectionConfig,
                        message,
                    );
                } finally {
                    consumer.inFlightCount--;
                }
            }));
        } catch (error) {
            this.logger.error(
                'Failed to poll queue',
                toErrorOrUndefined(error),
                {
                    pipelineCode: config.pipelineCode,
                    queueName: config.queueName,
                },
            );
        }
    }

    private async processDelivery(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
    ): Promise<void> {
        await this.deliveryHandler.process(
            consumer,
            adapter,
            connectionConfig,
            message,
        );
    }

    private async getConnectionConfig(
        consumer: ActiveConsumer,
        ctx: RequestContext,
    ): Promise<QueueConnectionConfig | null> {
        const { config } = consumer;
        if (config.queueType.toLowerCase() === 'internal') {
            return {} as QueueConnectionConfig;
        }

        const connection = await this.connectionService.getRuntimeByCode(
            ctx,
            config.connectionCode,
        );
        if (!connection) {
            this.logger.warn('Connection not found for consumer', {
                connectionCode: config.connectionCode,
                pipelineCode: config.pipelineCode,
            });
            return null;
        }

        const resolvedConfig = await this.resolveConnectionSecrets(
            ctx,
            connection.config as Record<string, unknown>,
        );
        return {
            ...resolvedConfig,
            ...(config.consumerGroup ? { consumerGroup: config.consumerGroup } : {}),
        } as QueueConnectionConfig;
    }

    private async resolveConnectionSecrets(
        ctx: RequestContext,
        raw: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const resolved = { ...raw };
        for (const [secretField, targetField] of QUEUE_SECRET_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(raw, secretField)) continue;
            delete resolved[secretField];
            const code = raw[secretField];
            if (typeof code !== 'string' || code.trim() === '') {
                throw new Error(
                    `Queue connection field "${secretField}" must reference a non-empty Secret Code`,
                );
            }
            const normalizedCode = code.trim();
            const value = await this.secretService.resolve(ctx, normalizedCode);
            if (typeof value !== 'string' || value.trim() === '') {
                throw new Error(
                    `Queue connection Secret Code "${normalizedCode}" configured by "${secretField}" could not be resolved`,
                );
            }
            resolved[targetField] = value;
        }
        const unsupportedSecretField = Object.keys(resolved)
            .find(field => field.endsWith('SecretCode'));
        if (unsupportedSecretField) {
            throw new Error(
                `Unsupported queue connection Secret Code field "${unsupportedSecretField}"`,
            );
        }
        if (raw.ssl !== undefined && resolved.useTls === undefined) {
            resolved.useTls = !!raw.ssl;
        }
        return resolved;
    }
}
