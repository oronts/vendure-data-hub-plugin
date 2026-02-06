import { RequestContextService } from '@vendure/core';
import { ConnectionService } from '../config/connection.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { DISTRIBUTED_LOCK } from '../../constants/index';
import { DataHubLogger } from '../logger';
import { MessageConsumerConfig, getConsumerKey } from './consumer-discovery';

/**
 * Active consumer state
 */
export interface ActiveConsumer {
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
 * Consumer Lifecycle Module
 *
 * Handles starting, stopping, and managing the lifecycle of message consumers,
 * including distributed lock acquisition and release.
 */
export class ConsumerLifecycle {
    constructor(
        private requestContextService: RequestContextService,
        private connectionService: ConnectionService,
        private logger: DataHubLogger,
        private distributedLock?: DistributedLockService,
    ) {}

    /**
     * Create and initialize a new consumer
     * Acquires distributed lock if available
     */
    async createConsumer(
        config: MessageConsumerConfig,
        consumers: Map<string, ActiveConsumer>,
        isDestroying: () => boolean,
    ): Promise<ActiveConsumer | null> {
        const key = getConsumerKey(config.pipelineCode, config.triggerKey);

        if (consumers.has(key)) {
            this.logger.debug(`Consumer already running`, {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
            });
            return null;
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
                return null;
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

        consumers.set(key, consumer);

        // Start lock refresh timer if using distributed locks
        if (lockToken && this.distributedLock) {
            this.startLockRefresh(key, consumer, lockKey, consumers, isDestroying);
        }

        this.logger.info(`Started message consumer`, {
            pipelineCode: config.pipelineCode,
            triggerKey: config.triggerKey,
            queueType: config.queueType,
            queueName: config.queueName,
            pollIntervalMs: config.pollIntervalMs,
            hasDistributedLock: !!lockToken,
        });

        return consumer;
    }

    /**
     * Start a timer to refresh the distributed lock before it expires
     */
    private startLockRefresh(
        consumerKey: string,
        consumer: ActiveConsumer,
        lockKey: string,
        consumers: Map<string, ActiveConsumer>,
        isDestroying: () => boolean,
    ): void {
        if (!this.distributedLock || !consumer.lockToken) return;

        consumer.lockRefreshTimer = setInterval(async () => {
            if (!consumer.running || isDestroying() || !consumer.lockToken || !this.distributedLock) {
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
                    await this.stopConsumer(consumerKey, consumers);
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
    async stopConsumer(key: string, consumers: Map<string, ActiveConsumer>): Promise<void> {
        const consumer = consumers.get(key);
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

        consumers.delete(key);

        this.logger.info(`Stopped message consumer`, {
            pipelineCode: consumer.config.pipelineCode,
            triggerKey: consumer.config.triggerKey,
            messagesProcessed: consumer.messagesProcessed,
            messagesFailed: consumer.messagesFailed,
        });
    }

    /**
     * Stop all consumers
     */
    async stopAllConsumers(consumers: Map<string, ActiveConsumer>): Promise<void> {
        for (const key of consumers.keys()) {
            await this.stopConsumer(key, consumers);
        }
        consumers.clear();
    }
}
