/**
 * Throughput Controller
 *
 * Handles rate limiting, batching, and throughput control
 * for pipeline load operations.
 */

import { RequestContext } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition } from '../../types/index';
import { RecordObject, OnRecordErrorCallback } from '../executor-types';
import { LoadExecutor } from '../executors';
import { chunk, sleep } from '../utils';
import { RATE_LIMIT, TIME, THROUGHPUT } from '../../constants/index';

export type DrainStrategy = 'backoff' | 'shed' | 'queue';

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
    const pauseCfg = stepThroughput.pauseOnErrorRate;
    const drainStrategy = (stepThroughput.drainStrategy as DrainStrategy) ?? 'backoff';

    // Split into batches
    const groups = chunk(batch, batchSize);
    const queueArr = [...groups];
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
        if (pauseCfg && ratio >= Number(pauseCfg.threshold ?? 1)) {
            switch (drainStrategy) {
                case 'shed':
                    // Drop remaining batches
                    queueArr.length = 0;
                    break;

                case 'queue':
                    // Move remaining batches to deferred queue
                    isPaused = true;
                    while (queueArr.length > 0) {
                        const remaining = queueArr.shift()!;
                        deferredQueue.enqueue(remaining);
                    }
                    break;

                case 'backoff':
                default:
                    // Pause before continuing
                    await sleep(Math.max(RATE_LIMIT.PAUSE_CHECK_INTERVAL_MS, Number(pauseCfg.intervalSec ?? 1) * TIME.SECOND));
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
    while (queueArr.length || inFlightSet.size) {
        // Start new batches up to concurrency limit
        while (queueArr.length && inFlightSet.size < concurrency) {
            const grp = queueArr.shift()!;
            const p = runNext(grp).finally(() => {
                inFlightSet.delete(p);
            });
            inFlightSet.add(p);
        }

        // Wait for at least one to complete
        if (inFlightSet.size) {
            await Promise.race(inFlightSet);
        }
    }

    // Process deferred queue if we were paused (for 'queue' strategy)
    if (drainStrategy === 'queue' && isPaused) {
        // Wait for error rate to potentially recover
        await sleep(Number(pauseCfg?.intervalSec ?? THROUGHPUT.DEFERRED_RETRY_DELAY_SEC) * TIME.SECOND);

        const deferred = deferredQueue.getAll();
        for (const group of deferred) {
            queueArr.push(group);
        }

        // Retry deferred batches
        while (queueArr.length) {
            const grp = queueArr.shift()!;
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
