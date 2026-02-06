import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { RuntimeConfigService } from '../runtime/runtime-config.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, SCHEDULER, PipelineStatus, AckMode, DISTRIBUTED_LOCK } from '../../constants/index';
import type { PipelineDefinition } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { queueAdapterRegistry, QueueConnectionConfig, QueueAdapter } from '../../sdk/adapters/queue';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';

/**
 * Message consumer configuration extracted from pipeline trigger
 */
interface MessageConsumerConfig {
    pipelineId: ID;
    pipelineCode: string;
    /** Trigger key for tracking multiple triggers per pipeline */
    triggerKey: string;
    queueType: string;
    connectionCode: string;
    queueName: string;
    consumerGroup?: string;
    batchSize: number;
    concurrency: number;
    ackMode: AckMode;
    maxRetries: number;
    deadLetterQueue?: string;
    pollIntervalMs: number;
    autoStart: boolean;
    prefetch?: number;
}

/**
 * Active consumer state
 */
interface ActiveConsumer {
    config: MessageConsumerConfig;
    running: boolean;
    pollTimer?: NodeJS.Timeout;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt?: Date;
    startedAt: Date;
    /** Number of messages currently being processed */
    inFlightCount: number;
    /** Lock token for distributed lock (if using distributed locks) */
    lockToken?: string;
    /** Timer for refreshing the lock */
    lockRefreshTimer?: NodeJS.Timeout;
}

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
 */
@Injectable()
export class MessageConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly consumers = new Map<string, ActiveConsumer>();
    private isDestroying = false;
    private refreshTimer?: NodeJS.Timeout;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private connectionService: ConnectionService,
        private runtimeConfigService: RuntimeConfigService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.MESSAGE_CONSUMER ?? 'DataHub:MessageConsumer');
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

        for (const key of this.consumers.keys()) {
            await this.stopConsumer(key);
        }
        this.consumers.clear();
        this.logger.info('Message consumer service cleanup complete');
    }

    /**
     * Discover pipelines with message triggers and start consumers
     */
    private async discoverAndStartConsumers(): Promise<void> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipelines = await repo.find();

        let startedCount = 0;
        for (const pipeline of pipelines) {
            if (pipeline.status !== PipelineStatus.PUBLISHED) continue;
            if (!pipeline.enabled) continue;

            const configs = this.extractMessageConfigs(pipeline);
            if (configs.length === 0) continue;

            for (const config of configs) {
                if (config.autoStart) {
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

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipelines = await repo.find();

        const activeConfigs = new Map<string, MessageConsumerConfig>();

        for (const pipeline of pipelines) {
            if (pipeline.status !== PipelineStatus.PUBLISHED) continue;
            if (!pipeline.enabled) continue;

            const configs = this.extractMessageConfigs(pipeline);
            for (const config of configs) {
                if (config.autoStart) {
                    const compositeKey = this.getConsumerKey(config.pipelineCode, config.triggerKey);
                    activeConfigs.set(compositeKey, config);
                }
            }
        }

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
     * Extract ALL message consumer configurations from pipeline
     * Finds all enabled message triggers and returns a config for each
     */
    private extractMessageConfigs(pipeline: Pipeline): MessageConsumerConfig[] {
        const definition = pipeline.definition as PipelineDefinition | undefined;
        const triggers = findEnabledTriggersByType(definition, 'message');
        if (triggers.length === 0) return [];

        const configs: MessageConsumerConfig[] = [];

        for (const trigger of triggers) {
            const cfg = parseTriggerConfig(trigger);
            if (!cfg) continue;

            const config = cfg as Record<string, unknown>;
            configs.push({
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                triggerKey: trigger.key,
                queueType: String(config.queueType ?? 'rabbitmq'),
                connectionCode: String(config.connectionCode ?? ''),
                queueName: String(config.queueName ?? ''),
                consumerGroup: config.consumerGroup as string | undefined,
                batchSize: Number(config.batchSize) || 10,
                concurrency: Number(config.concurrency) || 1,
                ackMode: (config.ackMode as AckMode) || AckMode.MANUAL,
                maxRetries: Number(config.maxRetries) || 3,
                deadLetterQueue: config.deadLetterQueue as string | undefined,
                pollIntervalMs: Number(config.pollIntervalMs) || SCHEDULER.MIN_INTERVAL_MS,
                autoStart: config.autoStart !== false,
            });
        }

        return configs;
    }

    /**
     * Get composite key for consumer tracking (supports multiple triggers per pipeline)
     */
    private getConsumerKey(pipelineCode: string, triggerKey: string): string {
        return `${pipelineCode}:${triggerKey}`;
    }

    /**
     * Start a consumer for a pipeline trigger
     * Uses distributed locks in multi-instance deployments to ensure only one instance
     * runs the consumer for a given pipeline+trigger combination
     */
    async startConsumer(config: MessageConsumerConfig): Promise<void> {
        const key = this.getConsumerKey(config.pipelineCode, config.triggerKey);

        if (this.consumers.has(key)) {
            this.logger.debug(`Consumer already running`, {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
            });
            return;
        }

        // Try to acquire distributed lock for this consumer
        const lockKey = `message-consumer:${key}`;
        let lockToken: string | undefined;

        if (this.distributedLock) {
            const lockResult = await this.distributedLock.acquire(lockKey, {
                ttlMs: DISTRIBUTED_LOCK.MESSAGE_CONSUMER_LOCK_TTL_MS,
                waitForLock: false,
            });

            if (!lockResult.acquired) {
                this.logger.debug(`Another instance is running consumer for ${key}`, {
                    pipelineCode: config.pipelineCode,
                    triggerKey: config.triggerKey,
                    currentOwner: lockResult.currentOwner,
                });
                return;
            }
            lockToken = lockResult.token;
            this.logger.debug(`Acquired distributed lock for consumer`, {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
                lockKey,
            });
        }

        // Validate connection exists
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const conn = await this.connectionService.getByCode(ctx, config.connectionCode);
        if (!conn) {
            // Release lock if we can't start
            if (lockToken && this.distributedLock) {
                await this.distributedLock.release(lockKey, lockToken);
            }
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        const consumer: ActiveConsumer = {
            config,
            running: true,
            messagesProcessed: 0,
            messagesFailed: 0,
            startedAt: new Date(),
            inFlightCount: 0,
            lockToken,
        };

        this.consumers.set(key, consumer);

        // Start lock refresh timer if using distributed locks
        if (lockToken && this.distributedLock) {
            this.startLockRefresh(key, consumer, lockKey);
        }

        this.startPolling(key, consumer);

        this.logger.info(`Started message consumer`, {
            pipelineCode: config.pipelineCode,
            triggerKey: config.triggerKey,
            queueType: config.queueType,
            queueName: config.queueName,
            pollIntervalMs: config.pollIntervalMs,
            hasDistributedLock: !!lockToken,
        });
    }

    /**
     * Start a timer to refresh the distributed lock before it expires
     */
    private startLockRefresh(consumerKey: string, consumer: ActiveConsumer, lockKey: string): void {
        if (!this.distributedLock || !consumer.lockToken) return;

        consumer.lockRefreshTimer = setInterval(async () => {
            if (!consumer.running || this.isDestroying || !consumer.lockToken || !this.distributedLock) {
                return;
            }

            try {
                const extended = await this.distributedLock.extend(
                    lockKey,
                    consumer.lockToken,
                    DISTRIBUTED_LOCK.MESSAGE_CONSUMER_LOCK_TTL_MS,
                );
                if (!extended) {
                    this.logger.warn(`Failed to extend lock for consumer ${consumerKey}, stopping`, {
                        pipelineCode: consumer.config.pipelineCode,
                    });
                    // Lock lost - stop this consumer
                    await this.stopConsumer(consumerKey);
                }
            } catch (error) {
                this.logger.error(`Error extending lock for consumer ${consumerKey}`,
                    error instanceof Error ? error : undefined, {
                    pipelineCode: consumer.config.pipelineCode,
                });
            }
        }, DISTRIBUTED_LOCK.MESSAGE_CONSUMER_LOCK_REFRESH_MS);

        if (typeof consumer.lockRefreshTimer.unref === 'function') {
            consumer.lockRefreshTimer.unref();
        }
    }

    /**
     * Stop a consumer and release its distributed lock
     */
    async stopConsumer(key: string): Promise<void> {
        const consumer = this.consumers.get(key);
        if (!consumer) return;

        consumer.running = false;

        // Stop lock refresh timer
        if (consumer.lockRefreshTimer) {
            clearInterval(consumer.lockRefreshTimer);
            consumer.lockRefreshTimer = undefined;
        }

        if (consumer.pollTimer) {
            clearInterval(consumer.pollTimer);
            consumer.pollTimer = undefined;
        }

        // Release distributed lock
        if (consumer.lockToken && this.distributedLock) {
            const lockKey = `message-consumer:${key}`;
            try {
                await this.distributedLock.release(lockKey, consumer.lockToken);
                this.logger.debug(`Released distributed lock for consumer`, {
                    pipelineCode: consumer.config.pipelineCode,
                    triggerKey: consumer.config.triggerKey,
                    lockKey,
                });
            } catch (error) {
                this.logger.warn(`Failed to release lock for consumer ${key}`,
                    { error: error instanceof Error ? error.message : String(error) });
            }
        }

        this.consumers.delete(key);

        this.logger.info(`Stopped message consumer`, {
            pipelineCode: consumer.config.pipelineCode,
            triggerKey: consumer.config.triggerKey,
            messagesProcessed: consumer.messagesProcessed,
            messagesFailed: consumer.messagesFailed,
        });
    }

    /**
     * Start polling for messages
     */
    private startPolling(key: string, consumer: ActiveConsumer): void {
        const poll = async () => {
            if (!consumer.running || this.isDestroying) return;

            try {
                await this.pollMessages(consumer);
            } catch (error) {
                this.logger.error(`Poll error for ${key}`,
                    error instanceof Error ? error : undefined, { pipelineCode: key });
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
                        error instanceof Error ? error : undefined, {
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
                error instanceof Error ? error : undefined, {
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

        await this.pipelineService.startRunByCode(ctx, config.pipelineCode, {
            seedRecords: [seedRecord],
            skipPermissionCheck: true,
            triggeredBy: `message:${config.triggerKey}`,
        });
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
                    _error: error instanceof Error ? error.message : String(error),
                    _failedAt: new Date().toISOString(),
                },
                headers: {
                    ...message.headers,
                    'x-original-queue': config.queueName,
                    'x-error': error instanceof Error ? error.message : String(error),
                },
            }]);

            this.logger.info(`Routed message to DLQ`, {
                pipelineCode: config.pipelineCode,
                dlq: config.deadLetterQueue,
                messageId: message.messageId,
            });
        } catch (dlqError) {
            this.logger.error(`Failed to route message to DLQ`,
                dlqError instanceof Error ? dlqError : undefined, {
                pipelineCode: config.pipelineCode,
                dlq: config.deadLetterQueue,
            });
        }
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
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await repo.findOne({ where: { code: pipelineCode } });

        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineCode}`);
        }

        const configs = this.extractMessageConfigs(pipeline);
        if (configs.length === 0) {
            throw new Error(`Pipeline ${pipelineCode} does not have any message triggers`);
        }

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
            const key = this.getConsumerKey(pipelineCode, triggerKey);
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
