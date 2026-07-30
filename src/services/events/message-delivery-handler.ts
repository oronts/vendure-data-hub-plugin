import type { ID } from '@vendure/core';
import { AckMode } from '../../constants';
import type { QueueAdapter, QueueConnectionConfig } from '../../sdk/adapters/queue';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import type { DataHubLogger } from '../logger';
import type { ActiveConsumer } from './consumer-lifecycle';
import {
    ConsumerLeaseLostError,
    type ConsumedMessage,
    assertConsumerLease,
} from './message-processing.types';
import type { MessageRunCoordinator } from './message-run-coordinator';
import { QueueRunWaitTimeoutError } from './message-run-waiter';

class DeliveryLeaseRenewalError extends Error {
    constructor() {
        super('Queue delivery lease renewal failed');
        this.name = 'DeliveryLeaseRenewalError';
    }
}

export class MessageDeliveryHandler {
    constructor(
        private readonly runCoordinator: MessageRunCoordinator,
        private readonly logger: DataHubLogger,
    ) {}

    async process(
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
            const enqueued = await this.runCoordinator.enqueueWithRetries(
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
            await this.runCoordinator.waitForTerminalRun(
                consumer,
                enqueued.ctx,
                runId,
                () => this.renewActiveDeliveryLease(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    runId,
                ),
            );
            assertConsumerLease(consumer, 'message acknowledgment');
        } catch (error) {
            if (!consumer.running) {
                const reason = error instanceof ConsumerLeaseLostError
                    ? error.message
                    : 'Consumer lease was lost while processing the delivery';
                await this.releaseAfterLeaseLoss(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    reason,
                );
                return;
            }
            if (error instanceof ConsumerLeaseLostError) {
                await this.releaseAfterLeaseLoss(
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
                await this.requeueActiveRun(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    runId,
                );
                return;
            }
            await this.handleTerminalFailure(
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

    async releaseAfterLeaseLoss(
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

    private async requeueActiveRun(
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

    private async handleTerminalFailure(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: ConsumedMessage,
        error: unknown,
    ): Promise<void> {
        const { config } = consumer;
        if (!consumer.running) {
            await this.releaseAfterLeaseLoss(
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
                await this.routeToDeadLetterQueue(
                    consumer,
                    adapter,
                    connectionConfig,
                    message,
                    error,
                );
                dlqPublished = true;
            } catch {
                dlqPublished = false;
            }
        }

        if (config.ackMode === AckMode.MANUAL && message.deliveryTag) {
            if (!consumer.running) {
                await this.releaseAfterLeaseLoss(
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

    private async routeToDeadLetterQueue(
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
            this.logger.info('Routed message to DLQ', {
                pipelineCode: config.pipelineCode,
                dlq: config.deadLetterQueue,
                messageId: message.messageId,
            });
        } catch (dlqError) {
            this.logger.error(
                'Failed to route message to DLQ',
                toErrorOrUndefined(dlqError),
                {
                    pipelineCode: config.pipelineCode,
                    dlq: config.deadLetterQueue,
                },
            );
            throw dlqError;
        }
    }
}
