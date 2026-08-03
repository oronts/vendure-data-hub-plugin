import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { THROUGHPUT_LIMITS } from '../../../shared/constants';
import { THROUGHPUT } from '../../constants';
import type { PipelineDefinition, PipelineStepDefinition } from '../../types';
import type { LoadExecutor } from '../executors';
import { executeLoadWithThroughput } from './throughput-controller';

describe('executeLoadWithThroughput', () => {
    it('applies step context throughput over step and pipeline defaults', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: { batchSize: 3 },
            context: { throughput: { batchSize: 1, concurrency: 2 } },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(async () => ({ ok: 1, fail: 0, skipped: 0 })),
        } as unknown as LoadExecutor;

        const result = await executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }, { id: 2 }, { id: 3 }],
            definition: {
                version: 1,
                steps: [step],
                context: { throughput: { batchSize: 2, concurrency: 1 } },
            } as PipelineDefinition,
            loadExecutor,
        });

        expect(result).toEqual({ ok: 3, fail: 0, skipped: 0 });
        expect(loadExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('enforces one aggregate rate limit across concurrent workers', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const startedAt: number[] = [];
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: { batchSize: 1, concurrency: 3, rateLimitRps: 2 },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(async () => {
                startedAt.push(Date.now());
                return { ok: 1, fail: 0, skipped: 0 };
            }),
        } as unknown as LoadExecutor;

        try {
            const execution = executeLoadWithThroughput({
                ctx: {} as RequestContext,
                step,
                batch: [{ id: 1 }, { id: 2 }, { id: 3 }],
                definition: { version: 1, steps: [step] } as PipelineDefinition,
                loadExecutor,
            });

            await vi.runAllTimersAsync();
            await execution;

            expect(startedAt).toEqual([0, 500, 1_000]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects invalid rate limits before invoking a loader', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: { rateLimitRps: -1 },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(),
        } as unknown as LoadExecutor;

        await expect(executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }],
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        })).rejects.toThrow(/rateLimitRps/);
        expect(loadExecutor.execute).not.toHaveBeenCalled();
    });

    it('fails instead of dropping records when the deferred queue is full', async () => {
        const batch = Array.from(
            { length: THROUGHPUT.MAX_QUEUE_SIZE + 2 },
            (_, index) => ({ index }),
        );
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 1,
                pauseOnErrorRate: { threshold: 1, intervalSec: 1 },
                drainStrategy: 'QUEUE',
            },
        } as PipelineStepDefinition & {
            throughput: {
                batchSize: number;
                concurrency: number;
                pauseOnErrorRate: { threshold: number; intervalSec: number };
                drainStrategy: 'QUEUE';
            };
        };
        const loadExecutor = {
            execute: vi.fn(async () => ({ ok: 0, fail: 1, skipped: 0 })),
        } as unknown as LoadExecutor;

        await expect(executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch,
            definition: {
                version: 1,
                steps: [step],
            } as PipelineDefinition,
            loadExecutor,
        })).rejects.toThrow(/refusing to drop records/);

        expect(loadExecutor.execute).toHaveBeenCalledOnce();
    });

    it('waits for concurrent loader calls before reporting a queue overflow', async () => {
        const batch = Array.from(
            { length: THROUGHPUT.MAX_QUEUE_SIZE + 3 },
            (_, index) => ({ index }),
        );
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 2,
                pauseOnErrorRate: { threshold: 1, intervalSec: 1 },
                drainStrategy: 'QUEUE',
            },
        } as PipelineStepDefinition;
        let releaseConcurrentCall: (() => void) | undefined;
        const concurrentCall = new Promise<void>(resolve => {
            releaseConcurrentCall = resolve;
        });
        const loadExecutor = {
            execute: vi.fn()
                .mockResolvedValueOnce({ ok: 0, fail: 1, skipped: 0 })
                .mockImplementationOnce(async () => {
                    await concurrentCall;
                    return { ok: 1, fail: 0, skipped: 0 };
                }),
        } as unknown as LoadExecutor;

        const execution = executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch,
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        });
        let settled = false;
        void execution.then(
            () => { settled = true; },
            () => { settled = true; },
        );

        await vi.waitFor(() => expect(loadExecutor.execute).toHaveBeenCalledTimes(2));
        await new Promise(resolve => setImmediate(resolve));
        expect(settled).toBe(false);

        releaseConcurrentCall?.();
        await expect(execution).rejects.toThrow(/refusing to drop records/);
        expect(loadExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('aggregates successful and skipped outcomes across batches', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: { batchSize: 1, concurrency: 1 },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn()
                .mockResolvedValueOnce({ ok: 1, fail: 0, skipped: 0 })
                .mockResolvedValueOnce({ ok: 0, fail: 0, skipped: 1 }),
        } as unknown as LoadExecutor;

        const result = await executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }, { id: 2 }],
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        });

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 1 });
        expect(loadExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('reports every unprocessed record as skipped when shedding a queue', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 1,
                pauseOnErrorRate: { threshold: 1, intervalSec: 1 },
                drainStrategy: 'SHED',
            },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(async () => ({ ok: 0, fail: 1, skipped: 0 })),
        } as unknown as LoadExecutor;

        const result = await executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }, { id: 2 }, { id: 3 }],
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        });

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 2 });
        expect(loadExecutor.execute).toHaveBeenCalledOnce();
    });

    it('inherits pause and drain defaults from the pipeline context', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: { batchSize: 1, concurrency: 1 },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(async () => ({ ok: 0, fail: 1, skipped: 0 })),
        } as unknown as LoadExecutor;

        const result = await executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }, { id: 2 }, { id: 3 }],
            definition: {
                version: 1,
                steps: [step],
                context: {
                    throughput: {
                        pauseOnErrorRate: { threshold: 1, intervalSec: 1 },
                        drainStrategy: 'SHED',
                    },
                },
            } as PipelineDefinition,
            loadExecutor,
        });

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 2 });
        expect(loadExecutor.execute).toHaveBeenCalledOnce();
    });

    it('evaluates the error threshold across the configured time window', async () => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 1,
                pauseOnErrorRate: { threshold: 0.5, intervalSec: 60 },
                drainStrategy: 'SHED',
            },
        } as PipelineStepDefinition;
        let callCount = 0;
        const loadExecutor = {
            execute: vi.fn(async () => {
                callCount += 1;
                return callCount === 10
                    ? { ok: 0, fail: 1, skipped: 0 }
                    : { ok: 1, fail: 0, skipped: 0 };
            }),
        } as unknown as LoadExecutor;

        const result = await executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: Array.from({ length: 11 }, (_, id) => ({ id })),
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        });

        expect(result).toEqual({ ok: 10, fail: 1, skipped: 0 });
        expect(loadExecutor.execute).toHaveBeenCalledTimes(11);
    });

    it('pauses all workers when the backoff threshold is reached', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const startedAt: number[] = [];
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 2,
                pauseOnErrorRate: { threshold: 0.75, intervalSec: 1 },
                drainStrategy: 'BACKOFF',
            },
        } as PipelineStepDefinition;
        const loadExecutor = {
            execute: vi.fn(async () => {
                startedAt.push(Date.now());
                return startedAt.length === 1
                    ? { ok: 0, fail: 1, skipped: 0 }
                    : { ok: 1, fail: 0, skipped: 0 };
            }),
        } as unknown as LoadExecutor;

        try {
            const execution = executeLoadWithThroughput({
                ctx: {} as RequestContext,
                step,
                batch: [{ id: 1 }, { id: 2 }, { id: 3 }],
                definition: { version: 1, steps: [step] } as PipelineDefinition,
                loadExecutor,
            });

            await vi.advanceTimersByTimeAsync(0);
            expect(startedAt).toEqual([0, 0]);
            await vi.advanceTimersByTimeAsync(999);
            expect(startedAt).toEqual([0, 0]);
            await vi.advanceTimersByTimeAsync(1);
            await execution;

            expect(startedAt).toEqual([0, 0, 1_000]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('re-enters the concurrent scheduler after a queue cooldown', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        let releaseRecovery: (() => void) | undefined;
        const recoveryBlock = new Promise<void>(resolve => {
            releaseRecovery = resolve;
        });
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 2,
                pauseOnErrorRate: { threshold: 0.75, intervalSec: 1 },
                drainStrategy: 'QUEUE',
            },
        } as PipelineStepDefinition;
        let callCount = 0;
        const loadExecutor = {
            execute: vi.fn(async () => {
                callCount += 1;
                if (callCount > 2) {
                    await recoveryBlock;
                }
                return callCount === 1
                    ? { ok: 0, fail: 1, skipped: 0 }
                    : { ok: 1, fail: 0, skipped: 0 };
            }),
        } as unknown as LoadExecutor;

        try {
            const execution = executeLoadWithThroughput({
                ctx: {} as RequestContext,
                step,
                batch: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
                definition: { version: 1, steps: [step] } as PipelineDefinition,
                loadExecutor,
            });

            await vi.advanceTimersByTimeAsync(0);
            expect(loadExecutor.execute).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(999);
            expect(loadExecutor.execute).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(1);
            expect(loadExecutor.execute).toHaveBeenCalledTimes(4);

            releaseRecovery?.();
            await execution;
        } finally {
            vi.useRealTimers();
        }
    });

    it('defers untouched recovery work again when the service remains unhealthy', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const startedAt: number[] = [];
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput: {
                batchSize: 1,
                concurrency: 2,
                pauseOnErrorRate: { threshold: 0.6, intervalSec: 1 },
                drainStrategy: 'QUEUE',
            },
        } as PipelineStepDefinition;
        let callCount = 0;
        const loadExecutor = {
            execute: vi.fn(async () => {
                callCount += 1;
                startedAt.push(Date.now());
                return callCount === 1 || callCount === 3
                    ? { ok: 0, fail: 1, skipped: 0 }
                    : { ok: 1, fail: 0, skipped: 0 };
            }),
        } as unknown as LoadExecutor;

        try {
            const execution = executeLoadWithThroughput({
                ctx: {} as RequestContext,
                step,
                batch: Array.from({ length: 5 }, (_, id) => ({ id })),
                definition: { version: 1, steps: [step] } as PipelineDefinition,
                loadExecutor,
            });

            await vi.advanceTimersByTimeAsync(1_000);
            expect(startedAt).toEqual([0, 0, 1_000, 1_000]);
            await vi.advanceTimersByTimeAsync(999);
            expect(startedAt).toHaveLength(4);
            await vi.advanceTimersByTimeAsync(1);
            await execution;

            expect(startedAt).toEqual([0, 0, 1_000, 1_000, 2_000]);
        } finally {
            vi.useRealTimers();
        }
    });

    it.each([
        [{ rateLimitRps: '2' }, 'rateLimitRps'],
        [{ rateLimitRps: null }, 'rateLimitRps'],
        [{ rateLimitRps: THROUGHPUT_LIMITS.MAX_RATE_LIMIT_RPS + 1 }, 'rateLimitRps'],
        [{ batchSize: 1.5 }, 'batchSize'],
        [{ batchSize: '1' }, 'batchSize'],
        [{ batchSize: 10_001 }, 'batchSize'],
        [{ concurrency: 0 }, 'concurrency'],
        [{ concurrency: 17 }, 'concurrency'],
        [{ pauseOnErrorRate: { threshold: '0.5', intervalSec: 1 } }, 'threshold'],
        [{ pauseOnErrorRate: { threshold: 0, intervalSec: 1 } }, 'threshold'],
        [{ pauseOnErrorRate: null }, 'pauseOnErrorRate'],
        [{ pauseOnErrorRate: { threshold: 0.5, intervalSec: '1' } }, 'intervalSec'],
        [{
            pauseOnErrorRate: {
                threshold: 0.5,
                intervalSec: THROUGHPUT_LIMITS.MIN_PAUSE_INTERVAL_SEC / 2,
            },
        }, 'intervalSec'],
        [{
            pauseOnErrorRate: {
                threshold: 0.5,
                intervalSec: THROUGHPUT_LIMITS.MAX_PAUSE_INTERVAL_SEC + 1,
            },
        }, 'intervalSec'],
        [{ drainStrategy: 'DROP' }, 'drainStrategy'],
    ])('rejects unsafe throughput config %j', async (throughput, expectedField) => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            throughput,
        } as unknown as PipelineStepDefinition;
        const loadExecutor = { execute: vi.fn() } as unknown as LoadExecutor;

        await expect(executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }],
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        })).rejects.toThrow(expectedField);
        expect(loadExecutor.execute).not.toHaveBeenCalled();
    });

    it.each([
        ['step.throughput', { throughput: 'invalid' }],
        ['step.context.throughput', { context: { throughput: [] } }],
    ])('rejects a non-object %s value', async (expectedField, overrides) => {
        const step = {
            key: 'load',
            type: 'LOAD',
            config: { adapterCode: 'test-loader' },
            ...overrides,
        } as unknown as PipelineStepDefinition;
        const loadExecutor = { execute: vi.fn() } as unknown as LoadExecutor;

        await expect(executeLoadWithThroughput({
            ctx: {} as RequestContext,
            step,
            batch: [{ id: 1 }],
            definition: { version: 1, steps: [step] } as PipelineDefinition,
            loadExecutor,
        })).rejects.toThrow(expectedField);
        expect(loadExecutor.execute).not.toHaveBeenCalled();
    });
});
