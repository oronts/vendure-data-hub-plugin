import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, SCHEDULER } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { ConsumerDiscovery, MessageConsumerConfig, getConsumerKey } from './consumer-discovery';
import { ConsumerLifecycle, ActiveConsumer } from './consumer-lifecycle';
import { MessageProcessing } from './message-processing';

// Re-export types for backwards compatibility
export type { MessageConsumerConfig } from './consumer-discovery';
export type { ActiveConsumer } from './consumer-lifecycle';

/**
 * Message Consumer Service
 *
 * Manages message queue consumers for pipelines with message triggers.
 * Supports polling-based consumption for RabbitMQ via HTTP Management API.
 *
 * Architecture:
 * - Discovers pipelines with message triggers on startup
 * - Starts consumers based on autoStart configuration
 * - Polls queues at configured intervals
 * - Processes messages by triggering pipeline runs
 * - Manages acknowledgments, retries, and dead-letter routing
 *
 * This service orchestrates three modules:
 * - ConsumerDiscovery: Finds pipelines with message triggers
 * - ConsumerLifecycle: Manages consumer start/stop and distributed locks
 * - MessageProcessing: Handles message polling and pipeline triggering
 */
@Injectable()
export class MessageConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly consumers = new Map<string, ActiveConsumer>();
    private isDestroying = false;
    private refreshTimer?: NodeJS.Timeout;

    private readonly discovery: ConsumerDiscovery;
    private readonly lifecycle: ConsumerLifecycle;
    private readonly processing: MessageProcessing;

    constructor(
        connection: TransactionalConnection,
        requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.MESSAGE_CONSUMER ?? 'DataHub:MessageConsumer');

        // Initialize modules
        this.discovery = new ConsumerDiscovery(
            connection,
            requestContextService,
            this.logger,
        );

        this.lifecycle = new ConsumerLifecycle(
            requestContextService,
            connectionService,
            this.logger,
            distributedLock,
        );

        this.processing = new MessageProcessing(
            requestContextService,
            pipelineService,
            connectionService,
            this.logger,
        );
    }

    async onModuleInit(): Promise<void> {
        this.logger.info('Message consumer service initializing');

        // Discover and start consumers
        try {
            await this.discoverAndStartConsumers();
        } catch (error) {
            this.logger.warn('Failed to initialize message consumers on startup, will retry on refresh', {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        this.refreshTimer = setInterval(() => {
            this.refreshConsumers().catch(err => {
                this.logger.error('Failed to refresh message consumers', err instanceof Error ? err : new Error(String(err)));
            });
        }, SCHEDULER.REFRESH_INTERVAL_MS);

        if (typeof this.refreshTimer.unref === 'function') {
            this.refreshTimer.unref();
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }

        await this.lifecycle.stopAllConsumers(this.consumers);
        this.logger.info('Message consumer service cleanup complete');
    }

    /**
     * Discover pipelines with message triggers and start consumers
     */
    private async discoverAndStartConsumers(): Promise<void> {
        const activeConfigs = await this.discovery.discoverActiveConfigs();
        let startedCount = 0;

        for (const [, config] of activeConfigs) {
            try {
                await this.startConsumer(config);
                startedCount++;
            } catch (error) {
                this.logger.error(`Failed to start consumer for pipeline ${config.pipelineCode}`,
                    error instanceof Error ? error : undefined, {
                        pipelineCode: config.pipelineCode,
                        triggerKey: config.triggerKey,
                    });
            }
        }

        if (startedCount > 0) {
            this.logger.info(`Started ${startedCount} message consumers`);
        }
    }

    /**
     * Refresh consumers - stop removed, start new, update changed
     */
    private async refreshConsumers(): Promise<void> {
        if (this.isDestroying) return;

        const activeConfigs = await this.discovery.discoverActiveConfigs();

        // Stop consumers for removed/disabled pipelines
        for (const [key, consumer] of this.consumers.entries()) {
            if (!activeConfigs.has(key)) {
                this.logger.info(`Stopping consumer for removed/disabled pipeline`, {
                    compositeKey: key,
                    pipelineCode: consumer.config.pipelineCode,
                    triggerKey: consumer.config.triggerKey,
                });
                await this.stopConsumer(key);
            }
        }

        // Start consumers for new pipelines
        for (const [key, config] of activeConfigs.entries()) {
            if (!this.consumers.has(key)) {
                try {
                    await this.startConsumer(config);
                } catch (error) {
                    this.logger.error(`Failed to start consumer for pipeline ${config.pipelineCode}`,
                        error instanceof Error ? error : undefined, {
                            pipelineCode: config.pipelineCode,
                            triggerKey: config.triggerKey,
                        });
                }
            }
        }
    }

    /**
     * Start a consumer for a pipeline trigger
     * Uses distributed locks in multi-instance deployments to ensure only one instance
     * runs the consumer for a given pipeline+trigger combination
     */
    async startConsumer(config: MessageConsumerConfig): Promise<void> {
        const consumer = await this.lifecycle.createConsumer(
            config,
            this.consumers,
            () => this.isDestroying,
        );

        if (consumer) {
            const key = getConsumerKey(config.pipelineCode, config.triggerKey);
            this.processing.startPolling(key, consumer, () => this.isDestroying);
        }
    }

    /**
     * Stop a consumer
     */
    async stopConsumer(key: string): Promise<void> {
        await this.lifecycle.stopConsumer(key, this.consumers);
    }

    /**
     * Get status of all consumers
     */
    getConsumerStatus(): Array<{
        pipelineCode: string;
        triggerKey: string;
        queueType: string;
        queueName: string;
        running: boolean;
        messagesProcessed: number;
        messagesFailed: number;
        lastMessageAt?: Date;
        startedAt: Date;
        inFlightCount: number;
        concurrency: number;
    }> {
        return Array.from(this.consumers.values()).map(c => ({
            pipelineCode: c.config.pipelineCode,
            triggerKey: c.config.triggerKey,
            queueType: c.config.queueType,
            queueName: c.config.queueName,
            running: c.running,
            messagesProcessed: c.messagesProcessed,
            messagesFailed: c.messagesFailed,
            lastMessageAt: c.lastMessageAt,
            startedAt: c.startedAt,
            inFlightCount: c.inFlightCount,
            concurrency: c.config.concurrency,
        }));
    }

    /**
     * Manually start consumers for a pipeline (all message triggers)
     * @param pipelineCode Pipeline code
     * @param triggerKey Optional specific trigger key to start
     */
    async startConsumerByCode(pipelineCode: string, triggerKey?: string): Promise<void> {
        const configs = await this.discovery.getConfigsByPipelineCode(pipelineCode);

        // If specific trigger key provided, start only that one
        if (triggerKey) {
            const config = configs.find(c => c.triggerKey === triggerKey);
            if (!config) {
                throw new Error(`Pipeline ${pipelineCode} does not have message trigger with key: ${triggerKey}`);
            }
            await this.startConsumer(config);
            return;
        }

        for (const config of configs) {
            await this.startConsumer(config);
        }
    }

    /**
     * Manually stop consumers for a pipeline
     * @param pipelineCode Pipeline code
     * @param triggerKey Optional specific trigger key to stop (if not provided, stops all for pipeline)
     */
    async stopConsumerByCode(pipelineCode: string, triggerKey?: string): Promise<void> {
        if (triggerKey) {
            const key = getConsumerKey(pipelineCode, triggerKey);
            await this.stopConsumer(key);
            return;
        }

        const keysToStop: string[] = [];
        for (const [key, consumer] of this.consumers.entries()) {
            if (consumer.config.pipelineCode === pipelineCode) {
                keysToStop.push(key);
            }
        }

        for (const key of keysToStop) {
            await this.stopConsumer(key);
        }
    }
}
