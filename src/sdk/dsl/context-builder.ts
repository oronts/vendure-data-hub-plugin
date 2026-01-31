/**
 * Context, Throughput, and Capability Builders
 *
 * Provides fluent builder functions for creating pipeline context,
 * throughput settings, capability definitions, and hook actions.
 *
 * @module sdk/dsl/context-builder
 *
 * @example
 * ```typescript
 * import { context, throughput, capabilities, hooks } from '@vendure/data-hub/sdk';
 *
 * const pipeline = createPipeline()
 *   .context(context.batch(100, { channel: 'us-store' }))
 *   .capabilities(capabilities.catalog())
 *   .hooks({
 *     onComplete: [hooks.webhook('https://api.example.com/notify')],
 *   })
 *   .build();
 * ```
 */

import { PipelineContext, PipelineCapabilities, Throughput, HookAction } from '../../types/index';
import { HOOK_ACTION } from '../constants';

// HOOK BUILDERS

/**
 * Hook action builders for pipeline lifecycle events.
 */
export const hooks = {
    /**
     * Create a webhook hook action.
     *
     * @param url - Webhook endpoint URL
     * @param headers - Optional HTTP headers
     * @returns HookAction configuration
     *
     * @example
     * hooks.webhook('https://api.example.com/notify', { 'X-API-Key': 'secret' })
     */
    webhook(url: string, headers?: Record<string, string>): HookAction {
        return { type: HOOK_ACTION.WEBHOOK, url, headers };
    },

    /**
     * Create an emit hook action to publish an event.
     *
     * @param event - Event name to emit
     * @returns HookAction configuration
     *
     * @example
     * hooks.emit('product.imported')
     */
    emit(event: string): HookAction {
        return { type: HOOK_ACTION.EMIT, event };
    },

    /**
     * Create a hook action to trigger another pipeline.
     *
     * @param pipelineCode - Code of the pipeline to trigger
     * @returns HookAction configuration
     *
     * @example
     * hooks.triggerPipeline('index-products')
     */
    triggerPipeline(pipelineCode: string): HookAction {
        return { type: HOOK_ACTION.TRIGGER_PIPELINE, pipelineCode };
    },

    /**
     * Create a log hook action.
     *
     * @param level - Log level ('DEBUG' | 'INFO' | 'WARN' | 'ERROR')
     * @param message - Log message template (supports {{field}} placeholders)
     * @returns HookAction configuration
     *
     * @example
     * hooks.log('INFO', 'Pipeline completed with {{recordCount}} records')
     */
    log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string): HookAction {
        return { type: HOOK_ACTION.LOG, level, message };
    },
};

// CONTEXT BUILDERS

/**
 * Pipeline context builders for configuring execution environment.
 */
export const context = {
    /**
     * Create context for a specific channel.
     *
     * @param channel - Channel code to execute in
     * @param options - Additional context options
     * @returns PipelineContext configuration
     *
     * @example
     * context.forChannel('us-store', { contentLanguage: 'en' })
     */
    forChannel(channel: string, options?: Partial<Omit<PipelineContext, 'channel'>>): PipelineContext {
        return { channel, ...options };
    },

    /**
     * Create context with a specific content language.
     *
     * @param language - Language code for content
     * @param options - Additional context options
     * @returns PipelineContext configuration
     *
     * @example
     * context.withLanguage('de', { channel: 'eu-store' })
     */
    withLanguage(language: string, options?: Partial<Omit<PipelineContext, 'contentLanguage'>>): PipelineContext {
        return { contentLanguage: language, ...options };
    },

    /**
     * Create batch processing context.
     *
     * @param batchSize - Number of records per batch
     * @param options - Additional context options
     * @returns PipelineContext configuration
     *
     * @example
     * context.batch(100, { channel: 'default' })
     */
    batch(batchSize: number, options?: Partial<Omit<PipelineContext, 'throughput'>>): PipelineContext {
        return { throughput: { batchSize }, runMode: 'BATCH', ...options };
    },

    /**
     * Create streaming processing context.
     *
     * @param options - Additional context options
     * @returns PipelineContext configuration
     *
     * @example
     * context.stream({ channel: 'realtime' })
     */
    stream(options?: Partial<Omit<PipelineContext, 'runMode'>>): PipelineContext {
        return { runMode: 'STREAM', ...options };
    },
};

// THROUGHPUT BUILDERS

/**
 * Throughput configuration builders for controlling processing rate.
 */
export const throughput = {
    /**
     * Set a rate limit.
     *
     * @param rps - Requests per second limit
     * @returns Throughput configuration
     *
     * @example
     * throughput.rateLimit(100)
     */
    rateLimit(rps: number): Throughput {
        return { rateLimitRps: rps };
    },

    /**
     * Configure batch processing.
     *
     * @param size - Batch size
     * @param concurrency - Number of concurrent batches (default: 1)
     * @returns Throughput configuration
     *
     * @example
     * throughput.batch(50, 4)
     */
    batch(size: number, concurrency = 1): Throughput {
        return { batchSize: size, concurrency };
    },

    /**
     * Set concurrency level.
     *
     * @param concurrency - Number of concurrent operations
     * @returns Throughput configuration
     *
     * @example
     * throughput.concurrent(8)
     */
    concurrent(concurrency: number): Throughput {
        return { concurrency };
    },

    /**
     * Configure pause on error rate.
     *
     * @param threshold - Error rate threshold (0-1)
     * @param intervalSec - Interval in seconds
     * @param strategy - Drain strategy (default: 'backoff')
     * @returns Throughput configuration
     *
     * @example
     * throughput.withPause(0.1, 60, 'backoff')
     */
    withPause(threshold: number, intervalSec: number, strategy: 'backoff' | 'shed' | 'queue' = 'backoff'): Throughput {
        return { pauseOnErrorRate: { threshold, intervalSec }, drainStrategy: strategy };
    },
};

// CAPABILITIES BUILDERS

/**
 * Pipeline capability builders for defining access permissions.
 */
export const capabilities = {
    /**
     * Catalog write capabilities (products, variants, collections).
     *
     * @returns PipelineCapabilities configuration
     *
     * @example
     * capabilities.catalog()
     */
    catalog(): PipelineCapabilities {
        return { writes: ['CATALOG'], requires: ['UpdateCatalog'] };
    },

    /**
     * Customer write capabilities.
     *
     * @returns PipelineCapabilities configuration
     *
     * @example
     * capabilities.customers()
     */
    customers(): PipelineCapabilities {
        return { writes: ['CUSTOMERS'], requires: ['UpdateCustomer'] };
    },

    /**
     * Order write capabilities.
     *
     * @returns PipelineCapabilities configuration
     *
     * @example
     * capabilities.orders()
     */
    orders(): PipelineCapabilities {
        return { writes: ['ORDERS'], requires: ['UpdateOrder'] };
    },

    /**
     * Inventory write capabilities.
     *
     * @returns PipelineCapabilities configuration
     *
     * @example
     * capabilities.inventory()
     */
    inventory(): PipelineCapabilities {
        return { writes: ['INVENTORY'], requires: ['UpdateCatalog'] };
    },

    /**
     * Full write capabilities (SuperAdmin required).
     *
     * @returns PipelineCapabilities configuration
     *
     * @example
     * capabilities.full()
     */
    full(): PipelineCapabilities {
        return {
            writes: ['CATALOG', 'CUSTOMERS', 'ORDERS', 'PROMOTIONS', 'INVENTORY'],
            requires: ['SuperAdmin'],
        };
    },
};
