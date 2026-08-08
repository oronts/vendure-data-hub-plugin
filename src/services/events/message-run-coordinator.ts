import { RequestContextService, type ID, type RequestContext } from '@vendure/core';
import {
    PipelineService,
    type IdempotentSeededRunResult,
} from '../pipeline/pipeline.service';
import { PipelineRevisionMismatchError } from '../pipeline/pipeline-policy';
import { QUEUE } from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import type { DataHubLogger } from '../logger';
import type { ActiveConsumer } from './consumer-lifecycle';
import {
    ConsumerLeaseLostError,
    type ConsumedMessage,
    type EnqueuedMessageRun,
    type QueueRunWaiter,
    assertConsumerLease,
} from './message-processing.types';
import { QueueRunWaitTimeoutError } from './message-run-waiter';
import type { DomainEventsService } from './domain-events.service';

export class MessageRunCoordinator {
    constructor(
        private readonly requestContextService: RequestContextService,
        private readonly pipelineService: PipelineService,
        private readonly logger: DataHubLogger,
        private readonly domainEvents: DomainEventsService,
        private readonly queueRunWaiter: QueueRunWaiter,
    ) {}

    async enqueueWithRetries(
        consumer: ActiveConsumer,
        message: ConsumedMessage,
    ): Promise<EnqueuedMessageRun> {
        const { maxRetries, pipelineCode } = consumer.config;

        for (let retry = 0; retry <= maxRetries; retry++) {
            assertConsumerLease(consumer, 'pipeline enqueue');
            try {
                return await this.enqueue(consumer, message);
            } catch (error) {
                if (error instanceof PipelineRevisionMismatchError) {
                    consumer.running = false;
                    throw new ConsumerLeaseLostError(
                        pipelineCode,
                        'published revision refresh',
                    );
                }
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

    async waitForTerminalRun(
        consumer: ActiveConsumer,
        ctx: RequestContext,
        runId: ID,
        renewDeliveryLease: () => Promise<boolean>,
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
                if (!await renewDeliveryLease()) {
                    throw error;
                }
            }
        }
    }

    private async enqueue(
        consumer: ActiveConsumer,
        message: ConsumedMessage,
    ): Promise<EnqueuedMessageRun> {
        const { config } = consumer;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        this.logger.info('Processing message from queue', {
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
                expectedRevisionId: config.revisionId,
            },
        );
        this.publishTriggerEvent(result, config, message);
        return { ctx, runId: result.run.id };
    }

    private publishTriggerEvent(
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
