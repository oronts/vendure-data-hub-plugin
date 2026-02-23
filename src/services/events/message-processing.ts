import { RequestContextService } from '@vendure/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { AckMode } from '../../constants/index';
import { DataHubLogger } from '../logger';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { queueAdapterRegistry, QueueConnectionConfig, QueueAdapter } from '../../sdk/adapters/queue';
import { ActiveConsumer } from './consumer-lifecycle';
import { DomainEventsService } from './domain-events.service';

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
        const poll = async () => {
            if (!consumer.running || isDestroying()) return;

            try {
                await this.pollMessages(consumer);
            } catch (error) {
                this.logger.error(`Poll error for ${key}`,
                    toErrorOrUndefined(error), { pipelineCode: key });
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
        const availableSlots = config.concurrency - consumer.inFlightCount;
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

        const conn = await this.connectionService.getByCode(ctx, config.connectionCode);
        if (!conn) {
            this.logger.warn(`Connection not found for consumer`, {
                connectionCode: config.connectionCode,
                pipelineCode: config.pipelineCode,
            });
            return;
        }

        const connectionConfig = conn.config as QueueConnectionConfig;
        const fetchCount = Math.min(config.batchSize, availableSlots);

        try {
            const messages = await adapter.consume(connectionConfig, config.queueName, {
                count: fetchCount,
                ackMode: config.ackMode,
                prefetch: config.prefetch,
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
                    await this.processConsumedMessage(consumer, msg);
                    consumer.messagesProcessed++;
                    consumer.lastMessageAt = new Date();

                    // Acknowledge if manual mode
                    if (config.ackMode === AckMode.MANUAL && msg.deliveryTag) {
                        await adapter.ack(connectionConfig, msg.deliveryTag);
                    }
                } catch (error) {
                    consumer.messagesFailed++;
                    this.logger.error(`Failed to process message`,
                        toErrorOrUndefined(error), {
                        pipelineCode: config.pipelineCode,
                        messageId: msg.messageId,
                    });

                    // Route to DLQ if configured
                    if (config.deadLetterQueue && msg.deliveryTag) {
                        await this.routeMessageToDLQ(consumer, adapter, connectionConfig, msg, error);
                    }
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

    /**
     * Process a consumed message by triggering the pipeline
     */
    private async processConsumedMessage(
        consumer: ActiveConsumer,
        message: { messageId: string; payload: Record<string, unknown>; headers?: Record<string, string> },
    ): Promise<void> {
        const { config } = consumer;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        const seedRecord = {
            ...message.payload,
            _messageId: message.messageId,
            _queue: config.queueName,
            _receivedAt: new Date().toISOString(),
            _headers: message.headers ?? {},
        };

        this.logger.info(`Processing message from queue`, {
            pipelineCode: config.pipelineCode,
            messageId: message.messageId,
        });

        const run = await this.pipelineService.startRunByCode(ctx, config.pipelineCode, {
            seedRecords: [seedRecord],
            skipPermissionCheck: true,
            triggeredBy: `message:${config.triggerKey}`,
        });

        if (run) {
            const pipelineId = run.pipeline?.id?.toString() ?? run.pipelineId?.toString();
            this.domainEvents.publishTriggerFired(pipelineId, 'MESSAGE_QUEUE', {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
                queueName: config.queueName,
                messageId: message.messageId,
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
        message: { messageId: string; payload: Record<string, unknown>; headers?: Record<string, string> },
        error: unknown,
    ): Promise<void> {
        const { config } = consumer;
        if (!config.deadLetterQueue) return;

        try {
            await adapter.publish(connectionConfig, config.deadLetterQueue, [{
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
        }
    }
}
