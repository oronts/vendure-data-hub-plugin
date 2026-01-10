/**
 * Context, Throughput, and Capability Builders
 */

import { PipelineContext, PipelineCapabilities, Throughput, HookAction } from '../../types/index';

// HOOK BUILDERS

export const hooks = {
    webhook(url: string, headers?: Record<string, string>): HookAction {
        return { type: 'webhook', url, headers };
    },
    emit(event: string): HookAction {
        return { type: 'emit', event };
    },
    triggerPipeline(pipelineCode: string): HookAction {
        return { type: 'triggerPipeline', pipelineCode };
    },
};

// CONTEXT BUILDERS

export const context = {
    forChannel(channel: string, options?: Partial<Omit<PipelineContext, 'channel'>>): PipelineContext {
        return { channel, ...options };
    },
    withLanguage(language: string, options?: Partial<Omit<PipelineContext, 'contentLanguage'>>): PipelineContext {
        return { contentLanguage: language, ...options };
    },
    batch(batchSize: number, options?: Partial<Omit<PipelineContext, 'throughput'>>): PipelineContext {
        return { throughput: { batchSize }, runMode: 'batch', ...options };
    },
    stream(options?: Partial<Omit<PipelineContext, 'runMode'>>): PipelineContext {
        return { runMode: 'stream', ...options };
    },
};

// THROUGHPUT BUILDERS

export const throughput = {
    rateLimit(rps: number): Throughput {
        return { rateLimitRps: rps };
    },
    batch(size: number, concurrency = 1): Throughput {
        return { batchSize: size, concurrency };
    },
    concurrent(concurrency: number): Throughput {
        return { concurrency };
    },
    withPause(threshold: number, intervalSec: number, strategy: 'backoff' | 'shed' | 'queue' = 'backoff'): Throughput {
        return { pauseOnErrorRate: { threshold, intervalSec }, drainStrategy: strategy };
    },
};

// CAPABILITIES BUILDERS

export const capabilities = {
    catalog(): PipelineCapabilities {
        return { writes: ['catalog'], requires: ['UpdateCatalog'] };
    },
    customers(): PipelineCapabilities {
        return { writes: ['customers'], requires: ['UpdateCustomer'] };
    },
    orders(): PipelineCapabilities {
        return { writes: ['orders'], requires: ['UpdateOrder'] };
    },
    inventory(): PipelineCapabilities {
        return { writes: ['inventory'], requires: ['UpdateCatalog'] };
    },
    full(): PipelineCapabilities {
        return {
            writes: ['catalog', 'customers', 'orders', 'promotions', 'inventory'],
            requires: ['SuperAdmin'],
        };
    },
};
