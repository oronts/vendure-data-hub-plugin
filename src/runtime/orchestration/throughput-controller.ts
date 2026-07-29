/**
 * Throughput Controller
 *
 * Rate limiting, batching, and throughput control
 * for pipeline load operations.
 */

import { RequestContext } from '@vendure/core';
import {
    PipelineContext,
    PipelineDefinition,
    PipelineStepDefinition,
} from '../../types/index';
import type { DrainStrategy } from '../../../shared/types';
import { LoaderExecutionResult, RecordObject, OnRecordErrorCallback } from '../executor-types';
import { LoadExecutor } from '../executors';
import { chunk, sleep } from '../utils';
import { PARALLEL_EXECUTION, RATE_LIMIT, TIME, THROUGHPUT } from '../../constants/index';
import { FIELD_LIMITS } from '../../constants/validation';

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

    constructor(maxSize: number = THROUGHPUT.MAX_QUEUE_SIZE) {
        this.maxSize = maxSize;
    }

    enqueue(batch: RecordObject[]): boolean {
        if (this.queue.length >= this.maxSize) {
            return false;
        }
        this.queue.push(batch);
        return true;
    }

    getAll(): RecordObject[][] {
        const all = this.queue;
        this.queue = [];
        return all;
    }

    get length(): number {
        return this.queue.length;
    }
}

interface EffectiveThroughputConfig {
    readonly rps: number;
    readonly batchSize: number;
    readonly concurrency: number;
    readonly pauseConfig?: {
        readonly threshold: number;
        readonly intervalMs: number;
    };
    readonly drainStrategy: DrainStrategy;
}

interface ErrorRateSample {
    readonly timestamp: number;
    readonly failed: number;
    readonly total: number;
}

class ErrorRateWindow {
    private readonly samples: ErrorRateSample[] = [];

    constructor(private readonly intervalMs: number) {}

    add(failed: number, total: number, timestamp: number = Date.now()): number {
        this.samples.push({ timestamp, failed, total });
        const earliestTimestamp = timestamp - this.intervalMs;
        while (
            this.samples.length > 0
            && this.samples[0].timestamp < earliestTimestamp
        ) {
            this.samples.shift();
        }

        const totals = this.samples.reduce(
            (result, sample) => ({
                failed: result.failed + sample.failed,
                total: result.total + sample.total,
            }),
            { failed: 0, total: 0 },
        );
        return totals.total > 0 ? totals.failed / totals.total : 0;
    }
}

class LoadStartGate {
    private nextStartAt = 0;
    private gate = Promise.resolve();

    constructor(private readonly intervalMs: number) {}

    acquire(options: {
        getPausedUntil: () => number;
        shouldStop: () => boolean;
    }): Promise<boolean> {
        const turn = this.gate.then(async () => {
            while (!options.shouldStop()) {
                const allowedAt = Math.max(
                    this.nextStartAt,
                    options.getPausedUntil(),
                );
                const delayMs = Math.max(0, allowedAt - Date.now());
                if (delayMs === 0) {
                    this.nextStartAt = Date.now() + this.intervalMs;
                    return true;
                }
                await sleep(delayMs);
            }
            return false;
        });
        this.gate = turn.then(() => undefined, () => undefined);
        return turn;
    }
}

const SUPPORTED_DRAIN_STRATEGIES = new Set<DrainStrategy>([
    'BACKOFF',
    'SHED',
    'QUEUE',
]);

function resolveBoundedInteger(
    value: unknown,
    fallback: number,
    field: string,
    maximum: number,
): number {
    const resolved = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
        throw new Error(`${field} must be an integer from 1 to ${maximum}`);
    }
    return resolved;
}

function resolveThroughputConfig(
    step: PipelineStepDefinition & { throughput?: ThroughputConfig },
    definition: PipelineDefinition,
    recordCount: number,
): EffectiveThroughputConfig {
    const contextThroughput = definition.context?.throughput ?? {};
    const stepThroughput = {
        ...step.throughput,
        ...step.context?.throughput,
    };
    const rps = Number(
        stepThroughput.rateLimitRps ?? contextThroughput.rateLimitRps ?? 0,
    );
    if (!Number.isFinite(rps) || rps < 0) {
        throw new Error('rateLimitRps must be a finite number greater than or equal to zero');
    }

    const batchSize = resolveBoundedInteger(
        stepThroughput.batchSize ?? contextThroughput.batchSize,
        Math.min(Math.max(recordCount, 1), FIELD_LIMITS.BATCH_SIZE_MAX),
        'batchSize',
        FIELD_LIMITS.BATCH_SIZE_MAX,
    );
    const concurrency = resolveBoundedInteger(
        stepThroughput.concurrency ?? contextThroughput.concurrency,
        1,
        'concurrency',
        PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS,
    );
    const rawPauseConfig = stepThroughput.pauseOnErrorRate
        ?? contextThroughput.pauseOnErrorRate;
    const drainStrategy = stepThroughput.drainStrategy
        ?? contextThroughput.drainStrategy
        ?? 'BACKOFF';
    if (!SUPPORTED_DRAIN_STRATEGIES.has(drainStrategy)) {
        throw new Error('drainStrategy must be BACKOFF, SHED, or QUEUE');
    }
    if (!rawPauseConfig) {
        return { rps, batchSize, concurrency, drainStrategy };
    }

    const threshold = Number(rawPauseConfig.threshold);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
        throw new Error('pauseOnErrorRate.threshold must be greater than zero and at most one');
    }
    const defaultIntervalSec = drainStrategy === 'QUEUE'
        ? THROUGHPUT.DEFERRED_RETRY_DELAY_SEC
        : 1;
    const intervalSec = Number(rawPauseConfig.intervalSec ?? defaultIntervalSec);
    if (!Number.isFinite(intervalSec) || intervalSec <= 0) {
        throw new Error('pauseOnErrorRate.intervalSec must be a finite number greater than zero');
    }

    return {
        rps,
        batchSize,
        concurrency,
        drainStrategy,
        pauseConfig: {
            threshold,
            intervalMs: Math.max(
                RATE_LIMIT.PAUSE_CHECK_INTERVAL_MS,
                intervalSec * TIME.SECOND,
            ),
        },
    };
}

interface ThroughputExecutionParams {
    ctx: RequestContext;
    step: PipelineStepDefinition & { throughput?: ThroughputConfig };
    batch: RecordObject[];
    definition: PipelineDefinition;
    loadExecutor: LoadExecutor;
    onRecordError?: OnRecordErrorCallback;
    pipelineContext?: PipelineContext;
}

class ThroughputExecution {
    private readonly batchQueue: RecordObject[][];
    private readonly deferredQueue = new DrainQueue();
    private readonly inFlight = new Set<Promise<void>>();
    private readonly startGate: LoadStartGate;
    private readonly errorRateWindow?: ErrorRateWindow;
    private succeeded = 0;
    private failed = 0;
    private skipped = 0;
    private pausedUntil = 0;
    private isShedding = false;
    private firstExecutionError: unknown;

    constructor(
        private readonly params: ThroughputExecutionParams,
        private readonly config: EffectiveThroughputConfig,
    ) {
        this.batchQueue = chunk(params.batch, config.batchSize);
        this.startGate = new LoadStartGate(
            config.rps > 0 ? Math.ceil(TIME.SECOND / config.rps) : 0,
        );
        this.errorRateWindow = config.pauseConfig
            ? new ErrorRateWindow(config.pauseConfig.intervalMs)
            : undefined;
    }

    async execute(): Promise<LoaderExecutionResult> {
        while (this.shouldContinue()) {
            this.restoreDeferredBatches();
            this.startAvailableBatches();
            await this.waitForProgress();
        }
        if (this.firstExecutionError !== undefined) {
            throw this.firstExecutionError;
        }
        return { ok: this.succeeded, fail: this.failed, skipped: this.skipped };
    }

    private shouldContinue(): boolean {
        if (this.inFlight.size > 0) return true;
        return this.firstExecutionError === undefined
            && !this.isShedding
            && (this.batchQueue.length > 0 || this.deferredQueue.length > 0);
    }

    private restoreDeferredBatches(): void {
        if (
            this.firstExecutionError === undefined
            && !this.isShedding
            && this.batchQueue.length === 0
            && this.deferredQueue.length > 0
            && Date.now() >= this.pausedUntil
        ) {
            this.batchQueue.push(...this.deferredQueue.getAll());
        }
    }

    private startAvailableBatches(): void {
        while (
            this.firstExecutionError === undefined
            && !this.isShedding
            && Date.now() >= this.pausedUntil
            && this.batchQueue.length > 0
            && this.inFlight.size < this.config.concurrency
        ) {
            const group = this.batchQueue.shift();
            if (group === undefined) return;
            this.track(this.runNext(group));
        }
    }

    private track(execution: Promise<void>): void {
        const tracked = execution
            .catch(error => {
                this.firstExecutionError ??= error;
                this.batchQueue.length = 0;
            })
            .finally(() => {
                this.inFlight.delete(tracked);
            });
        this.inFlight.add(tracked);
    }

    private async waitForProgress(): Promise<void> {
        const waits: Array<Promise<unknown>> = [...this.inFlight];
        const pauseDelayMs = Math.max(0, this.pausedUntil - Date.now());
        if (pauseDelayMs > 0) {
            waits.push(sleep(pauseDelayMs));
        }
        if (waits.length > 0) {
            await Promise.race(waits);
        }
    }

    private async runNext(group: RecordObject[]): Promise<void> {
        const canStart = await this.startGate.acquire({
            getPausedUntil: () => this.pausedUntil,
            shouldStop: () => (
                this.firstExecutionError !== undefined || this.isShedding
            ),
        });
        if (!canStart) {
            if (this.isShedding && this.firstExecutionError === undefined) {
                this.skipped += group.length;
            }
            return;
        }

        const {
            ctx,
            step,
            loadExecutor,
            onRecordError,
            definition,
            pipelineContext,
        } = this.params;
        const result = await loadExecutor.execute(
            ctx,
            step,
            group,
            onRecordError,
            definition.context?.errorHandling,
            pipelineContext,
        );
        this.recordResult(group, result);
    }

    private recordResult(
        group: RecordObject[],
        result: LoaderExecutionResult,
    ): void {
        this.succeeded += result.ok;
        this.failed += result.fail;
        this.skipped += result.skipped;
        const ratio = this.errorRateWindow?.add(result.fail, group.length);
        if (
            ratio !== undefined
            && this.config.pauseConfig
            && ratio >= this.config.pauseConfig.threshold
        ) {
            this.applyDrainStrategy();
        }
    }

    private applyDrainStrategy(): void {
        switch (this.config.drainStrategy) {
            case 'SHED':
                this.shedPendingBatches();
                break;
            case 'QUEUE':
                this.deferPendingBatches();
                this.pauseController();
                break;
            case 'BACKOFF':
            default:
                this.pauseController();
                break;
        }
    }

    private pauseController(): void {
        if (!this.config.pauseConfig) return;
        this.pausedUntil = Math.max(
            this.pausedUntil,
            Date.now() + this.config.pauseConfig.intervalMs,
        );
    }

    private deferPendingBatches(): void {
        while (this.batchQueue.length > 0) {
            const remaining = this.batchQueue.shift();
            if (remaining === undefined) break;
            if (!this.deferredQueue.enqueue(remaining)) {
                throw new Error(
                    `Deferred throughput queue exceeded ${THROUGHPUT.MAX_QUEUE_SIZE} batches; refusing to drop records`,
                );
            }
        }
    }

    private shedPendingBatches(): void {
        this.isShedding = true;
        this.skipped += this.batchQueue.reduce(
            (recordCount, pendingBatch) => recordCount + pendingBatch.length,
            0,
        );
        this.skipped += this.deferredQueue.getAll().reduce(
            (recordCount, pendingBatch) => recordCount + pendingBatch.length,
            0,
        );
        this.batchQueue.length = 0;
    }
}

/**
 * Execute load with throughput control
 */
export async function executeLoadWithThroughput(
    params: ThroughputExecutionParams,
): Promise<LoaderExecutionResult> {
    const config = resolveThroughputConfig(
        params.step,
        params.definition,
        params.batch.length,
    );
    return new ThroughputExecution(params, config).execute();
}
