import { RequestContextService, type ID, type RequestContext } from '@vendure/core';
import {
    PipelineService,
    type IdempotentSeededRunResult,
} from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { SecretService } from '../config/secret.service';
import { AckMode, QUEUE } from '../../constants/index';
import { DataHubLogger } from '../logger';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { queueAdapterRegistry, QueueConnectionConfig, QueueAdapter } from '../../sdk/adapters/queue';
import { ActiveConsumer } from './consumer-lifecycle';
import { DomainEventsService } from './domain-events.service';
import { waitForSuccessfulQueueRun } from './message-run-waiter';

type ConsumedMessage = {
    messageId: string;
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
    deliveryTag?: string;
};

interface EnqueuedMessageRun {
    ctx: RequestContext;
    runId: ID;
}

const QUEUE_SECRET_FIELDS = [
    ['passwordSecretCode', 'password'],
    ['accessKeyIdSecretCode', 'accessKeyId'],
    ['secretAccessKeySecretCode', 'secretAccessKey'],
    ['privateKeySecretCode', 'privateKey'],
    ['apiKeySecretCode', 'apiKey'],
] as const;

/**
 * Message Processing Module
 *
 * Handles polling messages from queues and processing them through pipelines,
 * including acknowledgment, retry logic, and dead-letter queue routing.
 */
export class MessageProcessing {
    constructor(
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private connectionService: ConnectionService,
        private secretService: SecretService,
        private logger: DataHubLogger,
        private domainEvents: DomainEventsService,
    ) {}

    /**
     * Start polling for messages
     */
    startPolling(
        key: string,
        consumer: ActiveConsumer,
        isDestroying: () => boolean,
    ): void {
        let polling = false;
        const poll = async () => {
            if (!consumer.running || isDestroying() || polling) return;
            polling = true;

            try {
                await this.pollMessages(consumer);
            } catch (error) {
                this.logger.error(`Poll error for ${key}`,
                    toErrorOrUndefined(error), { pipelineCode: key });
            } finally {
                polling = false;
            }
        };

        // Initial poll
        poll();

        consumer.pollTimer = setInterval(poll, consumer.config.pollIntervalMs);

        // Allow process to exit
        if (typeof consumer.pollTimer.unref === 'function') {
            consumer.pollTimer.unref();
        }
    }

    /**
     * Poll for messages from the queue using the registered adapter
     */
    private async pollMessages(consumer: ActiveConsumer): Promise<void> {
        const { config } = consumer;

        // Respect concurrency limit - skip if already at max
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

        // Internal queue adapter uses in-process buffer, no external connection needed
        const isInternal = config.queueType.toLowerCase() === 'internal';
        let connectionConfig: QueueConnectionConfig = {} as QueueConnectionConfig;

        if (!isInternal) {
            const conn = await this.connectionService.getRuntimeByCode(ctx, config.connectionCode);
            if (!conn) {
                this.logger.warn(`Connection not found for consumer`, {
                    connectionCode: config.connectionCode,
                    pipelineCode: config.pipelineCode,
                });
                return;
            }
            const rawConfig = conn.config as Record<string, unknown>;
            const resolvedConfig = await this.resolveConnectionSecrets(ctx, rawConfig);
            connectionConfig = {
                ...resolvedConfig,
                ...(config.consumerGroup ? { consumerGroup: config.consumerGroup } : {}),
            } as QueueConnectionConfig;
        }

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

            if (messages.length === 0) {
                return;
            }

            this.logger.debug(`Received ${messages.length} messages`, {
                pipelineCode: config.pipelineCode,
                queueName: config.queueName,
                queueType: config.queueType,
            });

            const processingPromises = messages.map(async (msg) => {
                consumer.inFlightCount++;

                try {
                    await this.processDelivery(consumer, adapter, connectionConfig, msg);
                } finally {
                    consumer.inFlightCount--;
                }
            });

            await Promise.all(processingPromises);

        } catch (error) {
            this.logger.error(`Failed to poll queue`,
                toErrorOrUndefined(error), {
                pipelineCode: config.pipelineCode,
                queueName: config.queueName,
            });
        }
    }

    private async processDelivery(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
    ): Promise<void> {
        const { config } = consumer;
        if (config.ackMode === AckMode.MANUAL && !message.deliveryTag) {
            throw new Error('Queue adapter returned a MANUAL delivery without a delivery tag');
        }

        try {
            const { ctx, runId } = await this.enqueueConsumedMessageWithRetries(
                consumer,
                message,
            );
            await waitForSuccessfulQueueRun(
                runId,
                id => this.pipelineService.runById(ctx, id),
            );
        } catch (error) {
            await this.handleTerminalProcessingFailure(
                consumer,
                adapter,
                connectionConfig,
                message,
                error,
            );
            return;
        }

        if (config.ackMode === AckMode.MANUAL && message.deliveryTag) {
            try {
                await adapter.ack(connectionConfig, message.deliveryTag);
            } catch (error) {
                consumer.messagesFailed++;
                this.logger.error(
                    'Failed to acknowledge successfully enqueued message',
                    toErrorOrUndefined(error),
                    {
                        pipelineCode: config.pipelineCode,
                        messageId: message.messageId,
                    },
                );
                throw error;
            }
        }

        consumer.messagesProcessed++;
        consumer.lastMessageAt = new Date();
    }

    private async handleTerminalProcessingFailure(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        error: unknown,
    ): Promise<void> {
        const { config } = consumer;
        consumer.messagesFailed++;
        this.logger.error('Failed to process message', toErrorOrUndefined(error), {
            pipelineCode: config.pipelineCode,
            messageId: message.messageId,
        });

        let dlqPublished = false;
        if (config.deadLetterQueue) {
            try {
                await this.routeMessageToDLQ(consumer, adapter, connectionConfig, message, error);
                dlqPublished = true;
            } catch {
                dlqPublished = false;
            }
        }

        if (config.ackMode === AckMode.MANUAL && message.deliveryTag) {
            const requeue = Boolean(config.deadLetterQueue) && !dlqPublished;
            await adapter.nack(connectionConfig, message.deliveryTag, requeue);
        }
    }

    private async enqueueConsumedMessageWithRetries(
        consumer: ActiveConsumer,
        message: ConsumedMessage,
    ): Promise<EnqueuedMessageRun> {
        const { maxRetries, pipelineCode } = consumer.config;

        for (let retry = 0; retry <= maxRetries; retry++) {
            try {
                return await this.enqueueConsumedMessage(consumer, message);
            } catch (error) {
                if (retry === maxRetries) {
                    throw error;
                }
                this.logger.warn('Retrying message after pipeline enqueue failure', {
                    pipelineCode,
                    messageId: message.messageId,
                    retry: retry + 1,
                    maxRetries,
                    error: getErrorMessage(error),
                });
            }
        }
        throw new Error('Queue message enqueue retry loop ended unexpectedly');
    }

    /**
     * Process a consumed message by triggering the pipeline
     */
    private async enqueueConsumedMessage(
        consumer: ActiveConsumer,
        message: ConsumedMessage,
    ): Promise<EnqueuedMessageRun> {
        const { config } = consumer;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        this.logger.info(`Processing message from queue`, {
            pipelineCode: config.pipelineCode,
            messageId: message.messageId,
        });
        const result = await this.pipelineService.startIdempotentRunWithSeed(
            ctx,
            config.pipelineId,
            [createQueueSeedRecord(config.queueName, message)],
            {
                idempotencyKey: message.messageId,
                idempotencyTtlSeconds: QUEUE.RUN_IDEMPOTENCY_TTL_SECONDS,
                requestFingerprint: createQueueRunIdentity(config, message),
                triggerKey: config.triggerKey,
                skipPermissionCheck: true,
                triggeredBy: `message:${config.triggerKey}`,
            },
        );
        this.publishMessageTriggerEvent(result, config, message);
        return { ctx, runId: result.run.id };
    }

    private publishMessageTriggerEvent(
        result: IdempotentSeededRunResult,
        config: ActiveConsumer['config'],
        message: ConsumedMessage,
    ): void {
        const { run } = result;
        const pipelineId = run.pipeline?.id?.toString() ?? run.pipelineId?.toString();
        if (result.duplicate) {
            this.logger.info('Reusing correlated pipeline run for queue redelivery', {
                pipelineCode: config.pipelineCode,
                messageId: message.messageId,
                runId: String(run.id),
            });
            return;
        }
        try {
            this.domainEvents.publishTriggerFired(pipelineId, 'MESSAGE_QUEUE', {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
                queueName: config.queueName,
                messageId: message.messageId,
            });
        } catch (error) {
            this.logger.warn('Pipeline run was enqueued but trigger event publication failed', {
                pipelineCode: config.pipelineCode,
                messageId: message.messageId,
                error: getErrorMessage(error),
            });
        }
    }

    /**
     * Route a failed message to the dead letter queue
     */
    private async routeMessageToDLQ(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        error: unknown,
    ): Promise<void> {
        const { config } = consumer;
        if (!config.deadLetterQueue) return;

        try {
            const results = await adapter.publish(connectionConfig, config.deadLetterQueue, [{
                id: message.messageId,
                payload: {
                    ...message.payload,
                    _originalQueue: config.queueName,
                    _error: getErrorMessage(error),
                    _failedAt: new Date().toISOString(),
                },
                headers: {
                    ...message.headers,
                    'x-original-queue': config.queueName,
                    'x-error': getErrorMessage(error),
                },
            }]);

            const [result] = results;
            if (
                results.length !== 1 ||
                !result ||
                result.messageId !== message.messageId ||
                !result.success
            ) {
                throw new Error(result?.error ?? 'Queue adapter did not confirm dead-letter delivery');
            }

            this.logger.info(`Routed message to DLQ`, {
                pipelineCode: config.pipelineCode,
                dlq: config.deadLetterQueue,
                messageId: message.messageId,
            });
        } catch (dlqError) {
            this.logger.error(`Failed to route message to DLQ`,
                toErrorOrUndefined(dlqError), {
                pipelineCode: config.pipelineCode,
                dlq: config.deadLetterQueue,
            });
            throw dlqError;
        }
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
                throw new Error(`Queue connection field "${secretField}" must reference a non-empty Secret Code`);
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
            throw new Error(`Unsupported queue connection Secret Code field "${unsupportedSecretField}"`);
        }
        if (raw.ssl !== undefined && resolved.useTls === undefined) {
            resolved.useTls = !!raw.ssl;
        }
        return resolved;
    }
}

function createQueueSeedRecord(
    queueName: string,
    message: ConsumedMessage,
): Record<string, unknown> {
    return {
        ...message.payload,
        _messageId: message.messageId,
        _queue: queueName,
        _receivedAt: new Date().toISOString(),
        _headers: message.headers ?? {},
    };
}

function createQueueRunIdentity(
    config: ActiveConsumer['config'],
    message: ConsumedMessage,
): string {
    return JSON.stringify({
        queueType: config.queueType,
        queueName: config.queueName,
        messageId: message.messageId,
        payload: message.payload,
        headers: message.headers ?? {},
    });
}
