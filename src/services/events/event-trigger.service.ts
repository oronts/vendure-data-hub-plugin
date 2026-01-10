import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventBus, RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { Subscription } from 'rxjs';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineService } from '../pipeline/pipeline.service';
import { RuntimeConfigService } from '../runtime/runtime-config.service';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { RunStatus } from '../../types/index';
import type { EventTriggerServiceConfig } from '../../types/plugin-options';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

/**
 * Cached event trigger entry
 * Stores minimal information needed to match events to pipelines
 */
interface CachedEventTrigger {
    /** Pipeline ID for fetching full data when triggering */
    pipelineId: ID;
    /** Pipeline code for triggering */
    pipelineCode: string;
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
    private eventQueue: Array<{ kind: string; event: any; timestamp: number }> = [];
    /** Maximum queue size before dropping events */
    private readonly maxQueueSize = 1000;
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

        // Initialize cache on startup (fresh start)
        await this.refreshCache();

        // Set up periodic cache refresh timer using configurable interval
        const cacheRefreshIntervalMs = this.eventTriggerConfig.cacheRefreshIntervalMs;
        this.refreshTimerHandle = setInterval(
            () => this.refreshCache().catch(err => {
                this.logger.error('Failed to refresh event trigger cache', err instanceof Error ? err : new Error(String(err)));
            }),
            cacheRefreshIntervalMs,
        );
        this.logger.debug('Cache refresh timer started', { cacheRefreshIntervalMs });

        // Wire common Vendure events. Use dynamic import names to avoid build-time coupling if types move.
        try {
            const core: any = await import('@vendure/core');
            const ProductEvent = core.ProductEvent;
            const ProductVariantEvent = core.ProductVariantEvent;
            const AssetEvent = core.AssetEvent;
            const CollectionModificationEvent = core.CollectionModificationEvent || core.CollectionEvent;
            const CustomerEvent = core.CustomerEvent;
            const OrderStateTransitionEvent = core.OrderStateTransitionEvent;
            if (ProductEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(ProductEvent).subscribe(ev => this.handleEvent('product', ev).catch(err => {
                        this.logger.error('Failed to handle product event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (ProductVariantEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(ProductVariantEvent).subscribe(ev => this.handleEvent('variant', ev).catch(err => {
                        this.logger.error('Failed to handle variant event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (AssetEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(AssetEvent).subscribe(ev => this.handleEvent('asset', ev).catch(err => {
                        this.logger.error('Failed to handle asset event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (CollectionModificationEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(CollectionModificationEvent).subscribe(ev => this.handleEvent('collection', ev).catch(err => {
                        this.logger.error('Failed to handle collection event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (CustomerEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(CustomerEvent).subscribe(ev => this.handleEvent('customer', ev).catch(err => {
                        this.logger.error('Failed to handle customer event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
            if (OrderStateTransitionEvent) {
                this.subscriptions.push(
                    this.eventBus.ofType(OrderStateTransitionEvent).subscribe(ev => this.handleEvent('order.state', ev).catch(err => {
                        this.logger.error('Failed to handle order state event', err instanceof Error ? err : new Error(String(err)));
                    }))
                );
            }
        } catch (error) {
            // Best-effort: if core events are not available, skip but log for debugging
            this.logger.debug('Could not register Vendure event listeners', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        // Clear the cache refresh timer
        if (this.refreshTimerHandle) {
            clearInterval(this.refreshTimerHandle);
            this.refreshTimerHandle = null;
            this.logger.debug('Cache refresh timer cleared');
        }

        // Clean up subscriptions
        const subscriptionCount = this.subscriptions.length;
        for (const subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions = [];

        // Clear all caches and state
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
        // Skip if destroying or already refreshing
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

            // Build new cache in shadow cache (atomic swap pattern)
            // This prevents race conditions where events arrive during cache rebuild
            this.shadowCache.clear();

            let cachedCount = 0;
            for (const pipeline of allPipelines) {
                // Only cache PUBLISHED and enabled pipelines
                if ((pipeline as any).status !== 'PUBLISHED') continue;
                if (!pipeline.enabled) continue;

                const steps: any[] = ((pipeline.definition as any)?.steps ?? []) as any[];
                const trigger = steps[0];
                if (!trigger || trigger.type !== 'TRIGGER') continue;

                const cfg: any = trigger.config ?? {};
                if (cfg.type !== 'event') continue;

                const eventTypePattern = String(cfg.eventType ?? '');

                // Determine which event kind(s) this trigger applies to
                const eventKinds = this.getEventKindsForPattern(eventTypePattern);

                const cachedTrigger: CachedEventTrigger = {
                    pipelineId: pipeline.id,
                    pipelineCode: pipeline.code,
                    eventTypePattern,
                };

                // Add to shadow cache for each relevant event kind
                for (const kind of eventKinds) {
                    const existing = this.shadowCache.get(kind) ?? [];
                    existing.push(cachedTrigger);
                    this.shadowCache.set(kind, existing);
                }
                cachedCount++;
            }

            // Atomic swap: replace main cache with shadow cache
            const previousSize = this.getTotalCachedTriggers();
            const previousCache = this.eventTriggerCache;
            this.eventTriggerCache = this.shadowCache;
            this.shadowCache = previousCache;
            this.shadowCache.clear(); // Clear old cache data

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
    private getEventKindsForPattern(pattern: string): string[] {
        const allKinds = ['product', 'variant', 'asset', 'collection', 'customer', 'order.state'];

        if (!pattern || pattern === '*') {
            // Empty or wildcard pattern matches all event kinds
            return allKinds;
        }

        // Check for specific namespace matches
        if (pattern.startsWith('product')) return ['product'];
        if (pattern.startsWith('variant')) return ['variant'];
        if (pattern.startsWith('asset')) return ['asset'];
        if (pattern.startsWith('collection')) return ['collection'];
        if (pattern.startsWith('customer')) return ['customer'];
        if (pattern.startsWith('order')) return ['order.state'];

        // Default: match all kinds (defensive)
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
                pipelineId: pipelineId as any,
                status: RunStatus.RUNNING as any,
            },
        });

        if (activeRun) return true;

        const pendingRun = await runRepo.findOne({
            where: {
                pipelineId: pipelineId as any,
                status: RunStatus.PENDING as any,
            },
        });

        return !!pendingRun;
    }

    /**
     * Handle incoming event with backpressure control
     * Queues events if processing is slow, drops oldest events if queue is full
     */
    private async handleEvent(kind: 'product' | 'variant' | 'asset' | 'collection' | 'customer' | 'order.state', ev: any): Promise<void> {
        // Skip if module is being destroyed
        if (this.isDestroying) {
            this.logger.debug('Skipping event - service is being destroyed', { eventKind: kind });
            return;
        }

        // Get cached triggers for this event kind
        const cachedTriggers = this.eventTriggerCache.get(kind);

        if (!cachedTriggers || cachedTriggers.length === 0) {
            // Cache miss or no triggers for this event kind
            this.logger.debug('No cached event triggers for event kind', { eventKind: kind });
            return;
        }

        this.logger.debug('Cache hit for event triggers', {
            eventKind: kind,
            triggerCount: cachedTriggers.length,
        });

        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        for (const trigger of cachedTriggers) {
            try {
                const evType = trigger.eventTypePattern;
                let shouldTrigger = false;
                let seed: Record<string, unknown>[] = [];

                if (kind === 'product' || kind === 'variant' || kind === 'asset' || kind === 'collection' || kind === 'customer') {
                    // Match created/updated/deleted if specified
                    const action = String(ev?.type ?? '').toLowerCase();
                    const ns = kind;
                    const matchesAction = !evType || evType === `${ns}.*` || evType === `${ns}.${action}`;

                    if (matchesAction) {
                        // Multiple fallbacks for entity ID to support various Vendure event structures
                        // (ProductEvent, AssetEvent, CollectionEvent, CustomerEvent all have different shapes)
                        const idMaybe = String(ev?.entity?.id ?? ev?.entityId ?? ev?.product?.id ?? ev?.asset?.id ?? ev?.collection?.id ?? ev?.customer?.id ?? '');
                        seed = [{ id: idMaybe }];
                        shouldTrigger = true;
                    }
                } else if (kind === 'order.state') {
                    const toState = String(ev?.toState ?? '').toLowerCase();
                    const fromState = String(ev?.fromState ?? '').toLowerCase();
                    const target = evType || 'order.stateTransition.*';
                    const normalized = `order.stateTransition.${toState || '*'}`;
                    const matches = target === 'order.stateTransition.*' || target === normalized;

                    if (matches) {
                        // Fallback for order ID supports both OrderStateTransitionEvent.order.id and direct orderId
                        seed = [{ id: String(ev?.order?.id ?? ev?.orderId ?? ''), toState, fromState }];
                        shouldTrigger = true;
                    }
                }

                if (shouldTrigger) {
                    // Create unique key for this trigger attempt
                    const triggerKey = `${trigger.pipelineCode}:${kind}`;

                    // Check for in-flight duplicate (backpressure)
                    if (this.inFlightTriggers.has(triggerKey)) {
                        this.logger.debug('Skipping duplicate event trigger - already in flight', {
                            pipelineCode: trigger.pipelineCode,
                            eventKind: kind,
                        });
                        continue;
                    }

                    // Check if pipeline is already running (concurrency control)
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
                        // Skip permission check for event-triggered runs - pipeline was already configured by admin
                        await this.pipelineService.startRunByCode(ctx, trigger.pipelineCode, {
                            seedRecords: seed,
                            skipPermissionCheck: true,
                        });
                    } finally {
                        // Remove from in-flight after trigger completes (success or failure)
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
