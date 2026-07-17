import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { THROUGHPUT } from '../../constants';
import type { PipelineDefinition, PipelineStepDefinition } from '../../types';
import type { LoadExecutor } from '../executors';
import { executeLoadWithThroughput } from './throughput-controller';

describe('executeLoadWithThroughput', () => {
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
});
