/**
 * Throughput Controller
 *
 * Rate limiting, batching, and throughput control
 * for pipeline load operations.
 */

import { RequestContext } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition } from '../../types/index';
import { RecordObject, OnRecordErrorCallback } from '../executor-types';
import { LoadExecutor } from '../executors';
import { chunk, sleep } from '../utils';
import { RATE_LIMIT, TIME, THROUGHPUT } from '../../constants/index';

export type DrainStrategy = 'BACKOFF' | 'SHED' | 'QUEUE';

/**
 * Throughput configuration
 */
export interface ThroughputConfig {
    rateLimitRps?: number;
    batchSize?: number;
    /** Concurrency level for parallel processing */
    concurrency?: number;
    pauseOnErrorRate?: {
        threshold: number;
        intervalSec?: number;
    };
    drainStrategy?: DrainStrategy;
}

/**
 * Queue for deferred batches when using 'queue' drain strategy.
 * Implements bounded queue with configurable max size to prevent unbounded memory usage.
 */
class DrainQueue {
    private queue: RecordObject[][] = [];
    private readonly maxSize: number;
    private droppedCount: number = 0;

    constructor(maxSize: number = THROUGHPUT.MAX_QUEUE_SIZE) {
        this.maxSize = maxSize;
    }

    enqueue(batch: RecordObject[]): boolean {
        if (this.queue.length >= this.maxSize) {
            this.droppedCount++;
            return false;
        }
        this.queue.push(batch);
        return true;
    }

    dequeue(): RecordObject[] | undefined {
        return this.queue.shift();
    }

    size(): number {
        return this.queue.length;
    }

    getDroppedCount(): number {
        return this.droppedCount;
    }

    clear(): void {
        this.queue = [];
        this.droppedCount = 0;
    }

    getAll(): RecordObject[][] {
        const all = this.queue;
        this.queue = [];
        return all;
    }
}

/**
 * Execute load with throughput control
 */
export async function executeLoadWithThroughput(params: {
    ctx: RequestContext;
    step: PipelineStepDefinition & { throughput?: ThroughputConfig };
    batch: RecordObject[];
    definition: PipelineDefinition;
    loadExecutor: LoadExecutor;
    onRecordError?: OnRecordErrorCallback;
}): Promise<{ ok: number; fail: number }> {
    const { ctx, step, batch, definition, loadExecutor, onRecordError } = params;

    // Get throughput configuration
    const stepThroughput = step.throughput ?? {};
    const contextThroughput = definition.context?.throughput ?? {};

    const rps = Number(stepThroughput.rateLimitRps ?? contextThroughput.rateLimitRps ?? 0) || 0;
    const batchSize = Math.max(
        1,
        Number(stepThroughput.batchSize ?? contextThroughput.batchSize ?? batch.length) || batch.length
    );
    const concurrency = Math.max(
        1,
        Number(stepThroughput.concurrency ?? contextThroughput.concurrency ?? 1) || 1
    );
    const pauseConfig = stepThroughput.pauseOnErrorRate;
    const drainStrategy = (stepThroughput.drainStrategy as DrainStrategy) ?? 'BACKOFF';

    // Split into batches
    const groups = chunk(batch, batchSize);
    const batchQueue = [...groups];
    const deferredQueue = new DrainQueue();

    let succeeded = 0;
    let failed = 0;
    let isPaused = false;

    // Get error handling config from pipeline context
    const errorHandling = definition.context?.errorHandling;

    /**
     * Process a single batch
     */
    const runNext = async (group: RecordObject[]) => {
        const { ok, fail } = await loadExecutor.execute(ctx, step, group, onRecordError, errorHandling);
        succeeded += ok;
        failed += fail;

        // Check error rate and apply drain strategy
        const ratio = group.length > 0 ? fail / group.length : 0;
        if (pauseConfig && ratio >= Number(pauseConfig.threshold ?? 1)) {
            switch (drainStrategy) {
                case 'SHED':
                    // Drop remaining batches
                    batchQueue.length = 0;
                    break;

                case 'QUEUE':
                    // Move remaining batches to deferred queue
                    isPaused = true;
                    while (batchQueue.length > 0) {
                        const remaining = batchQueue.shift();
                        if (remaining === undefined) break;
                        deferredQueue.enqueue(remaining);
                    }
                    break;

                case 'BACKOFF':
                default:
                    // Pause before continuing
                    await sleep(Math.max(RATE_LIMIT.PAUSE_CHECK_INTERVAL_MS, Number(pauseConfig.intervalSec ?? 1) * TIME.SECOND));
                    break;
            }
        }

        // Apply rate limiting
        if (rps > 0) {
            await sleep(Math.max(0, Math.floor(TIME.SECOND / rps)));
        }
    };

    // Process batches with controlled concurrency using a Set to track in-flight promises
    const inFlightSet = new Set<Promise<void>>();
    while (batchQueue.length || inFlightSet.size) {
        // Start new batches up to concurrency limit
        while (batchQueue.length && inFlightSet.size < concurrency) {
            const grp = batchQueue.shift();
            if (grp === undefined) break;
            const promise = runNext(grp).finally(() => {
                inFlightSet.delete(promise);
            });
            inFlightSet.add(promise);
        }

        // Wait for at least one to complete
        if (inFlightSet.size) {
            await Promise.race(inFlightSet);
        }
    }

    // Process deferred queue if we were paused (for 'queue' strategy)
    if (drainStrategy === 'QUEUE' && isPaused) {
        // Wait for error rate to potentially recover
        await sleep(Number(pauseConfig?.intervalSec ?? THROUGHPUT.DEFERRED_RETRY_DELAY_SEC) * TIME.SECOND);

        const deferred = deferredQueue.getAll();
        for (const group of deferred) {
            batchQueue.push(group);
        }

        // Retry deferred batches
        while (batchQueue.length) {
            const grp = batchQueue.shift();
            if (grp === undefined) break;
            const { ok, fail } = await loadExecutor.execute(ctx, step, grp, onRecordError, errorHandling);
            succeeded += ok;
            failed += fail;

            if (rps > 0) {
                await sleep(Math.max(0, Math.floor(TIME.SECOND / rps)));
            }
        }
    }

    return { ok: succeeded, fail: failed };
}
