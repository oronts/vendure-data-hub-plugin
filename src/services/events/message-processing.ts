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
import {
    QueueRunWaitTimeoutError,
    waitForSuccessfulQueueRun,
} from './message-run-waiter';

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

type QueueRunWaiter = typeof waitForSuccessfulQueueRun;

export class ConsumerLeaseLostError extends Error {
    constructor(pipelineCode: string, phase: string) {
        super(`Message consumer lease for pipeline "${pipelineCode}" was lost before ${phase}`);
        this.name = 'ConsumerLeaseLostError';
    }
}

class DeliveryLeaseRenewalError extends Error {
    constructor() {
        super('Queue delivery lease renewal failed');
        this.name = 'DeliveryLeaseRenewalError';
    }
}

function assertConsumerLease(consumer: ActiveConsumer, phase: string): void {
    if (!consumer.running) {
        throw new ConsumerLeaseLostError(consumer.config.pipelineCode, phase);
    }
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
        private queueRunWaiter: QueueRunWaiter = waitForSuccessfulQueueRun,
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
            consumer.activePollCount = (consumer.activePollCount ?? 0) + 1;

            try {
                await this.pollMessages(consumer);
            } catch (error) {
                this.logger.error(`Poll error for ${key}`,
                    toErrorOrUndefined(error), { pipelineCode: key });
            } finally {
                consumer.activePollCount = Math.max(
                    0,
                    (consumer.activePollCount ?? 1) - 1,
                );
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
            if (!consumer.running) {
                await Promise.all(messages.map(message => this.releaseDeliveryAfterLeaseLoss(
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
        assertConsumerLease(consumer, 'pipeline enqueue');
        if (config.ackMode === AckMode.MANUAL && !message.deliveryTag) {
            throw new Error('Queue adapter returned a MANUAL delivery without a delivery tag');
        }

        let runId: ID | undefined;
        try {
            await this.renewActiveDeliveryLease(
                consumer,
                adapter,
                connectionConfig,
                message,
            );
            const enqueued = await this.enqueueConsumedMessageWithRetries(
                consumer,
                message,
            );
            runId = enqueued.runId;
            await this.renewActiveDeliveryLease(
                consumer,
                adapter,
                connectionConfig,
                message,
                runId,
            );
            await this.waitForTerminalRun(
                consumer,
                adapter,
                connectionConfig,
                message,
                enqueued.ctx,
                runId,
            );
            assertConsumerLease(consumer, 'message acknowledgment');
        } catch (error) {
            if (!consumer.running) {
                const reason = error instanceof ConsumerLeaseLostError
                    ? error.message
                    : 'Consumer lease was lost while processing the delivery';
                await this.releaseDeliveryAfterLeaseLoss(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    reason,
                );
                return;
            }
            if (error instanceof ConsumerLeaseLostError) {
                await this.releaseDeliveryAfterLeaseLoss(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    error.message,
                );
                return;
            }
            if (
                error instanceof QueueRunWaitTimeoutError ||
                error instanceof DeliveryLeaseRenewalError
            ) {
                await this.requeueActiveRunDelivery(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    runId,
                );
                return;
            }
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

    private async waitForTerminalRun(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        ctx: RequestContext,
        runId: ID,
    ): Promise<void> {
        for (;;) {
            try {
                await this.queueRunWaiter(
                    runId,
                    id => this.pipelineService.runById(ctx, id),
                    {
                        beforePoll: () => assertConsumerLease(
                            consumer,
                            'pipeline completion observation',
                        ),
                    },
                );
                return;
            } catch (error) {
                if (!(error instanceof QueueRunWaitTimeoutError)) {
                    throw error;
                }
                const renewed = await this.renewActiveDeliveryLease(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    runId,
                );
                if (!renewed) {
                    throw error;
                }
            }
        }
    }

    private async renewActiveDeliveryLease(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        runId?: ID,
    ): Promise<boolean> {
        const renewLease = adapter.renewLease?.bind(adapter);
        if (
            consumer.config.ackMode !== AckMode.MANUAL ||
            !message.deliveryTag ||
            !renewLease
        ) {
            return false;
        }

        assertConsumerLease(consumer, 'delivery lease renewal');
        try {
            await renewLease(connectionConfig, message.deliveryTag);
        } catch (error) {
            this.logger.error(
                'Failed to renew active queue delivery lease',
                toErrorOrUndefined(error),
                {
                    pipelineCode: consumer.config.pipelineCode,
                    messageId: message.messageId,
                    runId: runId === undefined ? undefined : String(runId),
                },
            );
            throw new DeliveryLeaseRenewalError();
        }
        this.logger.debug('Renewed active queue delivery lease', {
            pipelineCode: consumer.config.pipelineCode,
            messageId: message.messageId,
            runId: runId === undefined ? undefined : String(runId),
        });
        return true;
    }

    private async releaseDeliveryAfterLeaseLoss(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        reason: string,
    ): Promise<void> {
        this.logger.warn(reason, {
            pipelineCode: consumer.config.pipelineCode,
            messageId: message.messageId,
        });
        if (consumer.config.ackMode !== AckMode.MANUAL || !message.deliveryTag) {
            return;
        }
        try {
            await adapter.nack(connectionConfig, message.deliveryTag, true);
        } catch (error) {
            this.logger.error(
                'Failed to release queue delivery after consumer lease loss',
                toErrorOrUndefined(error),
                {
                    pipelineCode: consumer.config.pipelineCode,
                    messageId: message.messageId,
                },
            );
        }
    }

    private async requeueActiveRunDelivery(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        runId?: ID,
    ): Promise<void> {
        assertConsumerLease(consumer, 'active pipeline run requeue');
        if (consumer.config.ackMode === AckMode.MANUAL && message.deliveryTag) {
            await adapter.nack(connectionConfig, message.deliveryTag, true);
        }
        this.logger.warn('Queue-triggered pipeline run remains active; delivery was requeued', {
            pipelineCode: consumer.config.pipelineCode,
            messageId: message.messageId,
            runId: runId === undefined ? undefined : String(runId),
        });
    }

    private async handleTerminalProcessingFailure(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        error: unknown,
    ): Promise<void> {
        const { config } = consumer;
        if (!consumer.running) {
            await this.releaseDeliveryAfterLeaseLoss(
                consumer,
                adapter,
                connectionConfig,
                message,
                'Consumer lease was lost before terminal delivery handling',
            );
            return;
        }
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
            if (!consumer.running) {
                await this.releaseDeliveryAfterLeaseLoss(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    'Consumer lease was lost before negative acknowledgment',
                );
                return;
            }
            const requeue = Boolean(config.deadLetterQueue) && !dlqPublished;
            await adapter.nack(connectionConfig, message.deliveryTag, requeue);
        }

        if (consumer.running) {
            consumer.messagesFailed++;
        }
    }

    private async enqueueConsumedMessageWithRetries(
        consumer: ActiveConsumer,
        message: ConsumedMessage,
    ): Promise<EnqueuedMessageRun> {
        const { maxRetries, pipelineCode } = consumer.config;

        for (let retry = 0; retry <= maxRetries; retry++) {
            assertConsumerLease(consumer, 'pipeline enqueue');
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
        assertConsumerLease(consumer, 'dead-letter publication');
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

            assertConsumerLease(consumer, 'dead-letter delivery confirmation');

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
