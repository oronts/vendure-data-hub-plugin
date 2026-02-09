import { PipelineContext, PipelineCapabilities, Throughput, HookAction } from '../../types/index';
import { HOOK_ACTION } from '../constants';

// HOOK BUILDERS

export const hooks = {
    /** `hooks.webhook('https://api.example.com/notify', { 'X-API-Key': 'secret' })` */
    webhook(url: string, headers?: Record<string, string>): HookAction {
        return { type: HOOK_ACTION.WEBHOOK, url, headers };
    },

    /** `hooks.emit('product.imported')` */
    emit(event: string): HookAction {
        return { type: HOOK_ACTION.EMIT, event };
    },

    /** `hooks.triggerPipeline('index-products')` */
    triggerPipeline(pipelineCode: string): HookAction {
        return { type: HOOK_ACTION.TRIGGER_PIPELINE, pipelineCode };
    },

    /** `hooks.log('INFO', 'Pipeline completed with {{recordCount}} records')` */
    log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string): HookAction {
        return { type: HOOK_ACTION.LOG, level, message };
    },
};

// CONTEXT BUILDERS

export const context = {
    /** `context.forChannel('us-store', { contentLanguage: 'en' })` */
    forChannel(channel: string, options?: Partial<Omit<PipelineContext, 'channel'>>): PipelineContext {
        return { channel, ...options };
    },

    /** `context.withLanguage('de', { channel: 'eu-store' })` */
    withLanguage(language: string, options?: Partial<Omit<PipelineContext, 'contentLanguage'>>): PipelineContext {
        return { contentLanguage: language, ...options };
    },

    /** `context.batch(100, { channel: 'default' })` */
    batch(batchSize: number, options?: Partial<Omit<PipelineContext, 'throughput'>>): PipelineContext {
        return { throughput: { batchSize }, runMode: 'BATCH', ...options };
    },

    /** `context.stream({ channel: 'realtime' })` */
    stream(options?: Partial<Omit<PipelineContext, 'runMode'>>): PipelineContext {
        return { runMode: 'STREAM', ...options };
    },
};

// THROUGHPUT BUILDERS

export const throughput = {
    /** `throughput.rateLimit(100)` */
    rateLimit(rps: number): Throughput {
        return { rateLimitRps: rps };
    },

    /** `throughput.batch(50, 4)` */
    batch(size: number, concurrency = 1): Throughput {
        return { batchSize: size, concurrency };
    },

    /** `throughput.concurrent(8)` */
    concurrent(concurrency: number): Throughput {
        return { concurrency };
    },

    /** `throughput.withPause(0.1, 60, 'backoff')` */
    withPause(threshold: number, intervalSec: number, strategy: 'BACKOFF' | 'SHED' | 'QUEUE' = 'BACKOFF'): Throughput {
        return { pauseOnErrorRate: { threshold, intervalSec }, drainStrategy: strategy };
    },
};

// CAPABILITIES BUILDERS

export const capabilities = {
    /** `capabilities.catalog()` - products, variants, collections */
    catalog(): PipelineCapabilities {
        return { writes: ['CATALOG'], requires: ['UpdateCatalog'] };
    },

    /** `capabilities.customers()` */
    customers(): PipelineCapabilities {
        return { writes: ['CUSTOMERS'], requires: ['UpdateCustomer'] };
    },

    /** `capabilities.orders()` */
    orders(): PipelineCapabilities {
        return { writes: ['ORDERS'], requires: ['UpdateOrder'] };
    },

    /** `capabilities.inventory()` */
    inventory(): PipelineCapabilities {
        return { writes: ['INVENTORY'], requires: ['UpdateCatalog'] };
    },

    /** `capabilities.full()` - SuperAdmin required */
    full(): PipelineCapabilities {
        return {
            writes: ['CATALOG', 'CUSTOMERS', 'ORDERS', 'PROMOTIONS', 'INVENTORY'],
            requires: ['SuperAdmin'],
        };
    },
};
