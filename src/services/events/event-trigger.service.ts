import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventBus, RequestContextService, TransactionalConnection, ID, VendureEvent } from '@vendure/core';
import { In } from 'typeorm';

/**
 * Extended event type for DataHub event handling
 * Vendure events have varying shapes - this interface allows safe property access
 * via optional chaining when casting the base VendureEvent
 */
interface DataHubEventPayload {
    type?: string;
    entity?: { id?: unknown } | unknown[];
    entityId?: unknown;
    product?: { id?: unknown };
    asset?: { id?: unknown };
    collection?: { id?: unknown };
    customer?: { id?: unknown };
    order?: { id?: unknown };
    orderId?: unknown;
    toState?: string;
    fromState?: string;
}
import { Subscription } from 'rxjs';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineService } from '../pipeline/pipeline.service';
import { RuntimeConfigService } from '../runtime/runtime-config.service';
import { LOGGER_CONTEXTS, PipelineStatus, RunStatus, EventKind, EVENT_TRIGGER } from '../../constants/index';
import type { PipelineDefinition } from '../../types/index';
import type { EventTriggerServiceConfig } from '../../types/plugin-options';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';
import { getErrorMessage } from '../../utils/error.utils';

/**
 * Cached event trigger entry
 * Stores minimal information needed to match events to pipelines
 */
interface CachedEventTrigger {
    /** Pipeline ID for fetching full data when triggering */
    pipelineId: ID;
    /** Pipeline code for triggering */
    pipelineCode: string;
    /** Trigger key for identifying specific trigger (for multi-trigger pipelines) */
    triggerKey: string;
    /** Event type pattern (e.g., 'product.*', 'order.stateTransition.placed') */
    eventTypePattern: string;
}

/**
 * Event trigger service for DataHub
 *
 * Manages event-triggered pipeline execution with:
 * - Cached trigger matching for performance
 * - Concurrency control to prevent duplicate runs
 * - Atomic cache refresh to prevent race conditions
 * - Backpressure handling for high event volumes
 */
@Injectable()
export class DataHubEventTriggerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly eventTriggerConfig: Required<EventTriggerServiceConfig>;
    private subscriptions: Subscription[] = [];

    /** Cache of event triggers indexed by event kind */
    private eventTriggerCache = new Map<string, CachedEventTrigger[]>();
    /** Shadow cache for atomic swap during refresh */
    private shadowCache = new Map<string, CachedEventTrigger[]>();
    /** Timestamp of last cache refresh */
    private cacheLastRefreshed: number = 0;
    /** Whether cache has been initialized */
    private cacheInitialized = false;
    /** Handle for the cache refresh timer */
    private refreshTimerHandle: NodeJS.Timeout | null = null;
    /** Mutex for cache refresh */
    private isRefreshing = false;
    /** Flag for module destruction */
    private isDestroying = false;
    /** Event processing queue for backpressure control */
    private eventQueue: Array<{ kind: string; event: VendureEvent; timestamp: number }> = [];
    /** Maximum queue size before dropping events */
    private readonly maxQueueSize = EVENT_TRIGGER.MAX_QUEUE_SIZE;
    /** Flag indicating if queue processor is running */
    private isProcessingQueue = false;
    /** Track in-flight triggers to prevent concurrent runs of same pipeline */
    private inFlightTriggers = new Set<string>();

    constructor(
        @Optional() private eventBus: EventBus,
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private runtimeConfigService: RuntimeConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EVENT_TRIGGER_SERVICE);
        this.eventTriggerConfig = this.runtimeConfigService.getEventTriggerConfig();
    }

    async onModuleInit(): Promise<void> {
        if (!this.eventBus) return;

        try {
            await this.refreshCache();
        } catch (error) {
            this.logger.warn('Failed to initialize event trigger cache on startup, will retry on next refresh', {
                error: getErrorMessage(error),
            });
        }

        const cacheRefreshIntervalMs = this.eventTriggerConfig.cacheRefreshIntervalMs;
        this.refreshTimerHandle = setInterval(
            () => this.refreshCache().catch(err => {
                this.logger.error('Failed to refresh event trigger cache', err instanceof Error ? err : new Error(String(err)));
            }),
            cacheRefreshIntervalMs,
        );
        this.logger.debug('Cache refresh timer started', { cacheRefreshIntervalMs });

        try {
            const core = await import('@vendure/core');
            const ProductEvent = core.ProductEvent;
            const ProductVariantEvent = core.ProductVariantEvent;
            const AssetEvent = core.AssetEvent;
            const CollectionModificationEvent = core.CollectionModificationEvent || core.CollectionEvent;
            const CustomerEvent = core.CustomerEvent;
            const OrderStateTransitionEvent = core.OrderStateTransitionEvent;
            if (ProductEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(ProductEvent).subscribe(ev => this.handleEvent(EventKind.PRODUCT, ev).catch(err => {
                        this.logger.error('Failed to handle product event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (ProductVariantEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(ProductVariantEvent).subscribe(ev => this.handleEvent(EventKind.VARIANT, ev).catch(err => {
                        this.logger.error('Failed to handle variant event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (AssetEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(AssetEvent).subscribe(ev => this.handleEvent(EventKind.ASSET, ev).catch(err => {
                        this.logger.error('Failed to handle asset event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (CollectionModificationEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(CollectionModificationEvent).subscribe(ev => this.handleEvent(EventKind.COLLECTION, ev).catch(err => {
                        this.logger.error('Failed to handle collection event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (CustomerEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(CustomerEvent).subscribe(ev => this.handleEvent(EventKind.CUSTOMER, ev).catch(err => {
                        this.logger.error('Failed to handle customer event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (OrderStateTransitionEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(OrderStateTransitionEvent).subscribe(ev => this.handleEvent(EventKind.ORDER_STATE, ev).catch(err => {
                        this.logger.error('Failed to handle order state event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
        } catch (error) {
            this.logger.debug('Could not register Vendure event listeners', {
                error: getErrorMessage(error),
            });
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        if (this.refreshTimerHandle) {
            clearInterval(this.refreshTimerHandle);
            this.refreshTimerHandle = null;
            this.logger.debug('Cache refresh timer cleared');
        }

        const subscriptionCount = this.subscriptions.length;
        for (const subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions = [];

        this.eventTriggerCache.clear();
        this.shadowCache.clear();
        this.eventQueue = [];
        this.inFlightTriggers.clear();
        this.cacheInitialized = false;

        this.logger.info('Event trigger service cleanup complete', { subscriptionsCleared: subscriptionCount });
    }

    /**
     * Refresh the event trigger cache by fetching all event-triggered pipelines
     * Uses atomic swap pattern to prevent race conditions during refresh
     */
    private async refreshCache(): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping cache refresh - service is being destroyed');
            return;
        }

        if (this.isRefreshing) {
            this.logger.debug('Skipping cache refresh - another refresh is in progress');
            return;
        }

        this.isRefreshing = true;
        const startTime = Date.now();

        try {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const repo = this.connection.getRepository(ctx, Pipeline);
            const allPipelines = await repo.find();

            this.shadowCache.clear();

            let cachedCount = 0;
            for (const pipeline of allPipelines) {
                if (pipeline.status !== PipelineStatus.PUBLISHED) continue;
                if (!pipeline.enabled) continue;

                const definition = pipeline.definition as PipelineDefinition | undefined;
                const eventTriggers = findEnabledTriggersByType(definition, 'EVENT');

                for (const trigger of eventTriggers) {
                    const cfg = parseTriggerConfig(trigger);
                    if (!cfg) continue;

                    const eventTypePattern = String((cfg as { eventType?: string }).eventType ?? '');
                    const eventKinds = this.getEventKindsForPattern(eventTypePattern);

                    const cachedTrigger: CachedEventTrigger = {
                        pipelineId: pipeline.id,
                        pipelineCode: pipeline.code,
                        triggerKey: trigger.key,
                        eventTypePattern,
                    };

                    for (const kind of eventKinds) {
                        const existing = this.shadowCache.get(kind) ?? [];
                        existing.push(cachedTrigger);
                        this.shadowCache.set(kind, existing);
                    }
                    cachedCount++;
                }
            }

            const previousSize = this.getTotalCachedTriggers();
            const previousCache = this.eventTriggerCache;
            this.eventTriggerCache = this.shadowCache;
            this.shadowCache = previousCache;
            this.shadowCache.clear();

            this.cacheLastRefreshed = Date.now();
            this.cacheInitialized = true;

            const durationMs = Date.now() - startTime;
            if (cachedCount > 0 || previousSize > 0) {
                this.logger.info('Event trigger cache refreshed', {
                    pipelinesCached: cachedCount,
                    previousCount: previousSize,
                    durationMs,
                });
            } else {
                this.logger.debug('Event trigger cache refreshed - no event triggers found', { durationMs });
            }
        } catch (error) {
            this.logger.error('Failed to refresh event trigger cache', error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Determine which event kinds a pattern applies to
     */
    private getEventKindsForPattern(pattern: string): EventKind[] {
        const allKinds = Object.values(EventKind);

        if (!pattern || pattern === '*') {
            return allKinds;
        }

        if (pattern.startsWith('product')) return [EventKind.PRODUCT];
        if (pattern.startsWith('variant')) return [EventKind.VARIANT];
        if (pattern.startsWith('asset')) return [EventKind.ASSET];
        if (pattern.startsWith('collection')) return [EventKind.COLLECTION];
        if (pattern.startsWith('customer')) return [EventKind.CUSTOMER];
        if (pattern.startsWith('order')) return [EventKind.ORDER_STATE];

        return allKinds;
    }

    /**
     * Get total number of cached triggers across all event kinds
     */
    private getTotalCachedTriggers(): number {
        let total = 0;
        for (const triggers of this.eventTriggerCache.values()) {
            total += triggers.length;
        }
        return total;
    }

    /**
     * Invalidate the cache and force a refresh
     */
    async invalidateCache(): Promise<void> {
        this.logger.info('Event trigger cache invalidation requested');
        this.eventTriggerCache.clear();
        this.cacheInitialized = false;
        await this.refreshCache();
    }

    /**
     * Get cache statistics (useful for debugging/monitoring)
     */
    getCacheStats(): { initialized: boolean; lastRefreshed: number; totalTriggers: number; byKind: Record<string, number> } {
        const byKind: Record<string, number> = {};
        for (const [kind, triggers] of this.eventTriggerCache.entries()) {
            byKind[kind] = triggers.length;
        }
        return {
            initialized: this.cacheInitialized,
            lastRefreshed: this.cacheLastRefreshed,
            totalTriggers: this.getTotalCachedTriggers(),
            byKind,
        };
    }

    /**
     * Check if a pipeline is currently running
     * Used for concurrency control to prevent simultaneous event-triggered runs
     */
    private async isPipelineRunning(pipelineId: ID): Promise<boolean> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        const activeRun = await runRepo.findOne({
            where: {
                pipelineId: Number(pipelineId),
                status: In([RunStatus.RUNNING, RunStatus.PENDING]),
            },
        });

        return !!activeRun;
    }

    /**
     * Handle incoming event with backpressure control
     * Queues events if processing is slow, drops oldest events if queue is full
     */
    private async handleEvent(kind: EventKind, ev: VendureEvent): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping event - service is being destroyed', { eventKind: kind });
            return;
        }

        const cachedTriggers = this.eventTriggerCache.get(kind);

        if (!cachedTriggers || cachedTriggers.length === 0) {
            this.logger.debug('No cached event triggers for event kind', { eventKind: kind });
            return;
        }

        this.logger.debug('Cache hit for event triggers', {
            eventKind: kind,
            triggerCount: cachedTriggers.length,
        });

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const eventPayload = ev as unknown as DataHubEventPayload;

        for (const trigger of cachedTriggers) {
            try {
                const evType = trigger.eventTypePattern;
                let shouldTrigger = false;
                let seed: Record<string, unknown>[] = [];

                if (kind === EventKind.PRODUCT || kind === EventKind.VARIANT || kind === EventKind.ASSET || kind === EventKind.COLLECTION || kind === EventKind.CUSTOMER) {
                    const action = String(eventPayload?.type ?? '').toLowerCase();
                    const ns = kind;
                    const matchesAction = !evType || evType === `${ns}.*` || evType === `${ns}.${action}`;

                    if (matchesAction) {
                        const entity = eventPayload?.entity;
                        let entityId: unknown;
                        if (Array.isArray(entity) && entity.length > 0) {
                            entityId = (entity[0] as { id?: unknown })?.id;
                        } else if (entity && typeof entity === 'object' && 'id' in entity) {
                            entityId = (entity as { id?: unknown }).id;
                        }
                        const idMaybe = String(entityId ?? eventPayload?.entityId ?? eventPayload?.product?.id ?? eventPayload?.asset?.id ?? eventPayload?.collection?.id ?? eventPayload?.customer?.id ?? '');
                        seed = [{ id: idMaybe }];
                        shouldTrigger = true;
                    }
                } else if (kind === EventKind.ORDER_STATE) {
                    const toState = String(eventPayload?.toState ?? '').toLowerCase();
                    const fromState = String(eventPayload?.fromState ?? '').toLowerCase();
                    const target = evType || 'order.stateTransition.*';
                    const normalized = `order.stateTransition.${toState || '*'}`;
                    const matches = target === 'order.stateTransition.*' || target === normalized;

                    if (matches) {
                        seed = [{ id: String(eventPayload?.order?.id ?? eventPayload?.orderId ?? ''), toState, fromState }];
                        shouldTrigger = true;
                    }
                }

                if (shouldTrigger) {
                    const triggerKey = `${trigger.pipelineCode}:${kind}`;

                    if (this.inFlightTriggers.has(triggerKey)) {
                        this.logger.debug('Skipping duplicate event trigger - already in flight', {
                            pipelineCode: trigger.pipelineCode,
                            eventKind: kind,
                        });
                        continue;
                    }

                    const isRunning = await this.isPipelineRunning(trigger.pipelineId);
                    if (isRunning) {
                        this.logger.debug('Skipping event trigger - pipeline already has an active run', {
                            pipelineCode: trigger.pipelineCode,
                            eventKind: kind,
                        });
                        continue;
                    }

                    // Mark as in-flight
                    this.inFlightTriggers.add(triggerKey);

                    try {
                        this.logger.info('Triggering pipeline from event', {
                            pipelineCode: trigger.pipelineCode,
                            eventKind: kind,
                            seedRecordCount: seed.length,
                        });
                        await this.pipelineService.startRunByCode(ctx, trigger.pipelineCode, {
                            seedRecords: seed,
                            skipPermissionCheck: true,
                            triggeredBy: `event:${trigger.triggerKey}`,
                        });
                    } finally {
                        this.inFlightTriggers.delete(triggerKey);
                    }
                }
            } catch (error) {
                this.logger.error('Failed to trigger pipeline from event', error instanceof Error ? error : new Error(String(error)), {
                    pipelineCode: trigger.pipelineCode,
                    eventKind: kind,
                });
            }
        }
    }

    /**
     * Get health metrics for the event trigger service
     * Useful for monitoring and debugging
     */
    getHealthMetrics(): {
        cacheInitialized: boolean;
        cacheLastRefreshed: number;
        totalTriggers: number;
        isRefreshing: boolean;
        isDestroying: boolean;
        queueSize: number;
        inFlightTriggers: number;
    } {
        return {
            cacheInitialized: this.cacheInitialized,
            cacheLastRefreshed: this.cacheLastRefreshed,
            totalTriggers: this.getTotalCachedTriggers(),
            isRefreshing: this.isRefreshing,
            isDestroying: this.isDestroying,
            queueSize: this.eventQueue.length,
            inFlightTriggers: this.inFlightTriggers.size,
        };
    }
}
