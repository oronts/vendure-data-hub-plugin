import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { SecretService } from '../config/secret.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, QUEUE, SCHEDULER } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, toErrorOrUndefined, ensureError } from '../../utils/error.utils';
import {
    ConsumerDiscovery,
    getConsumerConfigFingerprint,
    MessageConsumerConfig,
    getConsumerKey,
    shouldRunConsumer,
} from './consumer-discovery';
import { ConsumerLifecycle, ActiveConsumer } from './consumer-lifecycle';
import { MessageProcessing } from './message-processing';
import { DomainEventsService } from './domain-events.service';
import { queueAdapterRegistry } from '../../sdk/adapters/queue';
import { ConfigSyncService } from '../../bootstrap/seed-data';
import { DataHubSettingsService } from '../config/settings.service';

/**
 * Message Consumer Service
 *
 * Manages message queue consumers for pipelines with message triggers.
 *
 * Architecture:
 * - Discovers pipelines with message triggers on startup
 * - Starts consumers based on autoStart configuration
 * - Drains queue adapters at configured intervals while native AMQP subscriptions stay active
 * - Processes messages by triggering pipeline runs
 * - Manages acknowledgments, retries, and dead-letter routing
 *
 * This service orchestrates three modules:
 * - ConsumerDiscovery: Finds pipelines with message triggers
 * - ConsumerLifecycle: Manages consumer start/stop and distributed locks
 * - MessageProcessing: Handles message polling and pipeline triggering
 */
/** Maximum number of concurrent consumers to prevent unbounded growth */
@Injectable()
export class MessageConsumerService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly consumers = new Map<string, ActiveConsumer>();
    private readonly configuredConsumers = new Map<string, MessageConsumerConfig>();
    private readonly consumerOperations = new Map<string, Promise<void>>();
    private reconciliationTail: Promise<void> = Promise.resolve();
    private isDestroying = false;
    private refreshTimer?: NodeJS.Timeout;
    private refreshInProgress = false;
    private refreshCompletion?: Promise<void>;

    private readonly discovery: ConsumerDiscovery;
    private readonly lifecycle: ConsumerLifecycle;
    private readonly processing: MessageProcessing;

    constructor(
        connection: TransactionalConnection,
        requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private connectionService: ConnectionService,
        private secretService: SecretService,
        private configSync: ConfigSyncService,
        private settings: DataHubSettingsService,
        loggerFactory: DataHubLoggerFactory,
        private domainEvents: DomainEventsService,
        @Optional() distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.MESSAGE_CONSUMER ?? 'DataHub:MessageConsumer');

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
            secretService,
            this.logger,
            domainEvents,
        );
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.configSync.ensureSynchronized();
        if (this.isDestroying) return;
        this.logger.info('Message consumer service initializing');

        // Discover and start consumers
        try {
            await this.serializeReconciliation(() => (
                this.discoverAndStartConsumers()
            ));
        } catch (error) {
            this.logger.warn('Failed to initialize message consumers on startup, will retry on refresh', {
                error: getErrorMessage(error),
            });
        }
        if (this.isDestroying) return;

        this.refreshTimer = setInterval(() => {
            this.refreshConsumers().catch(err => {
                this.logger.error('Failed to refresh message consumers', ensureError(err));
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

        await this.refreshCompletion;
        await this.reconciliationTail;
        await Promise.allSettled(this.consumerOperations.values());

        try {
            await this.lifecycle.stopAllConsumers(this.consumers);
        } finally {
            await this.destroyQueueAdapters();
        }
        this.logger.info('Message consumer service cleanup complete');
    }

    private async destroyQueueAdapters(): Promise<void> {
        const adapters = queueAdapterRegistry.getAll();
        const results = await Promise.allSettled(
            adapters.map(adapter => adapter.destroy()),
        );
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                this.logger.error(
                    'Failed to destroy queue adapter',
                    toErrorOrUndefined(result.reason),
                    { adapterCode: adapters[index].code },
                );
            }
        });
    }
    private async serializeReconciliation<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.reconciliationTail
            .catch(() => undefined)
            .then(operation);
        this.reconciliationTail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private async discoverDesiredConfigs(): Promise<Map<string, MessageConsumerConfig>> {
        const configuredConsumers = await this.discovery.discoverConfigs();
        const overrides = await this.settings.getConsumerControlOverrides();
        const desiredConsumers = new Map<string, MessageConsumerConfig>();

        this.configuredConsumers.clear();
        for (const [key, config] of configuredConsumers) {
            this.configuredConsumers.set(key, config);
            if (shouldRunConsumer(config, overrides[key])) {
                desiredConsumers.set(key, config);
            }
        }

        return desiredConsumers;
    }

    /**
     * Discover pipelines with message triggers and start consumers
     */
    private async discoverAndStartConsumers(): Promise<void> {
        const desiredConfigs = await this.discoverDesiredConfigs();
        if (this.isDestroying) return;
        let startedCount = 0;

        for (const [key, config] of desiredConfigs) {
            try {
                await this.startConsumer(config);
                if (this.consumers.has(key)) {
                    startedCount++;
                }
            } catch (error) {
                this.logger.error(`Failed to start consumer for pipeline ${config.pipelineCode}`,
                    toErrorOrUndefined(error), {
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
        if (this.isDestroying || this.refreshInProgress) return;
        this.refreshInProgress = true;
        let finishRefresh: (() => void) | undefined;
        const completion = new Promise<void>(resolve => {
            finishRefresh = resolve;
        });
        this.refreshCompletion = completion;

        try {
            await this.serializeReconciliation(async () => {
                const desiredConfigs = await this.discoverDesiredConfigs();
                if (this.isDestroying) return;

                // Stop consumers for removed, disabled, or reconfigured triggers.
                for (const [key, consumer] of this.consumers.entries()) {
                    const nextConfig = desiredConfigs.get(key);
                    const configChanged = nextConfig !== undefined
                        && getConsumerConfigFingerprint(nextConfig)
                            !== getConsumerConfigFingerprint(consumer.config);
                    if (!nextConfig || configChanged) {
                        this.logger.info(
                            configChanged
                                ? 'Restarting reconfigured message consumer'
                                : 'Stopping consumer for removed/disabled pipeline',
                            {
                                compositeKey: key,
                                pipelineCode: consumer.config.pipelineCode,
                                triggerKey: consumer.config.triggerKey,
                            },
                        );
                        await this.stopConsumer(key);
                        if (this.isDestroying) return;
                    }
                }

                // Start consumers for new or reconfigured pipelines.
                for (const [key, config] of desiredConfigs.entries()) {
                    if (!this.consumers.has(key)) {
                        try {
                            await this.startConsumer(config);
                        } catch (error) {
                            this.logger.error(`Failed to start consumer for pipeline ${config.pipelineCode}`,
                                toErrorOrUndefined(error), {
                                    pipelineCode: config.pipelineCode,
                                    triggerKey: config.triggerKey,
                                });
                        }
                    }
                }
            });
        } finally {
            this.refreshInProgress = false;
            finishRefresh?.();
            if (this.refreshCompletion === completion) {
                this.refreshCompletion = undefined;
            }
        }
    }

    private async serializeConsumerOperation(
        key: string,
        operation: () => Promise<void>,
    ): Promise<void> {
        const previous = this.consumerOperations.get(key) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        this.consumerOperations.set(key, current);
        try {
            await current;
        } finally {
            if (this.consumerOperations.get(key) === current) {
                this.consumerOperations.delete(key);
            }
        }
    }

    /**
     * Start a consumer for a pipeline trigger
     * Uses distributed locks in multi-instance deployments to ensure only one instance
     * runs the consumer for a given pipeline+trigger combination
     */
    async startConsumer(config: MessageConsumerConfig): Promise<void> {
        const key = getConsumerKey(config.pipelineCode, config.triggerKey);
        await this.serializeConsumerOperation(key, async () => {
            if (this.isDestroying) return;
            if (this.consumers.size >= QUEUE.MAX_CONSUMERS) {
                this.logger.warn(`Consumer limit reached (max ${QUEUE.MAX_CONSUMERS}), cannot start consumer for ${config.pipelineCode}`);
                return;
            }
            const consumer = await this.lifecycle.createConsumer(
                config,
                this.consumers,
                () => this.isDestroying,
            );

            if (!consumer) return;
            if (this.isDestroying) {
                await this.lifecycle.stopConsumer(key, this.consumers);
            } else {
                this.processing.startPolling(key, consumer, () => this.isDestroying);
            }
        });
    }

    /**
     * Stop a consumer
     */
    async stopConsumer(key: string): Promise<void> {
        await this.serializeConsumerOperation(key, () => (
            this.lifecycle.stopConsumer(key, this.consumers)
        ));
    }

    /**
     * Get status of all consumers
     */
    async getConsumerStatus(): Promise<Array<{
        pipelineCode: string;
        triggerKey: string;
        queueType: string;
        queueName: string;
        running: boolean;
        autoStart: boolean;
        desiredEnabled: boolean;
        messagesProcessed: number;
        messagesFailed: number;
        lastMessageAt?: Date;
        startedAt?: Date;
        inFlightCount: number;
        concurrency: number;
    }>> {
        const overrides = await this.settings.getConsumerControlOverrides();
        return Array.from(this.configuredConsumers.entries()).map(([key, config]) => {
            const activeConsumer = this.consumers.get(key);
            return {
                pipelineCode: config.pipelineCode,
                triggerKey: config.triggerKey,
                queueType: config.queueType,
                queueName: config.queueName,
                running: activeConsumer?.running === true,
                autoStart: config.autoStart,
                desiredEnabled: shouldRunConsumer(config, overrides[key]),
                messagesProcessed: activeConsumer?.messagesProcessed ?? 0,
                messagesFailed: activeConsumer?.messagesFailed ?? 0,
                lastMessageAt: activeConsumer?.lastMessageAt,
                startedAt: activeConsumer?.startedAt,
                inFlightCount: activeConsumer?.inFlightCount ?? 0,
                concurrency: config.concurrency,
            };
        });
    }

    private selectConfigs(
        pipelineCode: string,
        configs: MessageConsumerConfig[],
        triggerKey?: string,
    ): MessageConsumerConfig[] {
        if (!triggerKey) {
            if (configs.length === 0) {
                throw new Error(`Pipeline ${pipelineCode} has no enabled message triggers`);
            }
            return configs;
        }
        const selected = configs.find(config => config.triggerKey === triggerKey);
        if (!selected) {
            throw new Error(
                `Pipeline ${pipelineCode} does not have message trigger with key: ${triggerKey}`,
            );
        }
        return [selected];
    }

    private getCachedConfigs(
        pipelineCode: string,
        triggerKey?: string,
    ): MessageConsumerConfig[] {
        const cached = new Map<string, MessageConsumerConfig>();
        const addMatching = (config: MessageConsumerConfig) => {
            if (
                config.pipelineCode === pipelineCode
                && (!triggerKey || config.triggerKey === triggerKey)
            ) {
                cached.set(getConsumerKey(config.pipelineCode, config.triggerKey), config);
            }
        };
        this.configuredConsumers.forEach(addMatching);
        this.consumers.forEach(consumer => addMatching(consumer.config));
        return Array.from(cached.values());
    }

    private async resolveStopConfigs(
        pipelineCode: string,
        triggerKey?: string,
    ): Promise<MessageConsumerConfig[]> {
        const candidates = new Map<string, MessageConsumerConfig>();
        for (const config of this.getCachedConfigs(pipelineCode, triggerKey)) {
            candidates.set(getConsumerKey(config.pipelineCode, config.triggerKey), config);
        }

        try {
            for (const config of await this.discovery.getConfigsByPipelineCode(pipelineCode)) {
                if (!triggerKey || config.triggerKey === triggerKey) {
                    candidates.set(getConsumerKey(config.pipelineCode, config.triggerKey), config);
                }
            }
        } catch (error) {
            this.logger.warn('Current message trigger configuration unavailable during stop', {
                pipelineCode,
                triggerKey,
                error: getErrorMessage(error),
            });
        }

        return this.selectConfigs(pipelineCode, Array.from(candidates.values()), triggerKey);
    }

    private async persistConsumerIntent(
        configs: MessageConsumerConfig[],
        enabled: boolean,
        ctx?: RequestContext,
    ): Promise<void> {
        const updates: Record<string, boolean> = {};
        for (const config of configs) {
            updates[getConsumerKey(config.pipelineCode, config.triggerKey)] = enabled;
        }
        await this.settings.updateConsumerControlOverrides(updates, ctx);
        for (const config of configs) {
            const key = getConsumerKey(config.pipelineCode, config.triggerKey);
            this.configuredConsumers.set(key, config);
        }
    }

    async startConsumerByCode(
        pipelineCode: string,
        triggerKey?: string,
        ctx?: RequestContext,
    ): Promise<void> {
        await this.serializeReconciliation(async () => {
            const configs = await this.discovery.getConfigsByPipelineCode(pipelineCode);
            const selected = this.selectConfigs(pipelineCode, configs, triggerKey);
            await this.persistConsumerIntent(selected, true, ctx);
            for (const config of selected) {
                await this.startConsumer(config);
            }
        });
    }

    async stopConsumerByCode(
        pipelineCode: string,
        triggerKey?: string,
        ctx?: RequestContext,
    ): Promise<void> {
        await this.serializeReconciliation(async () => {
            const selected = await this.resolveStopConfigs(pipelineCode, triggerKey);
            await this.persistConsumerIntent(selected, false, ctx);
            for (const config of selected) {
                await this.stopConsumer(getConsumerKey(config.pipelineCode, config.triggerKey));
            }
        });
    }
}
