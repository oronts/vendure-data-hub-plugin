import { describe, expect, it, vi } from 'vitest';
import { PipelineDefinition, StepType } from '../../types';
import { replayFromStepGraph, replayFromStepLinear } from './replay-executor';

const SEED = [{ sku: 'SKU-1' }];

function createDefinition(
    steps: PipelineDefinition['steps'],
    edges?: PipelineDefinition['edges'],
): PipelineDefinition {
    return { version: 1, steps, edges };
}

describe('replayFromStepLinear', () => {
    it('executes the failed step inclusively with the recorded input', async () => {
        const load = vi.fn().mockResolvedValue({ ok: 1, fail: 0, skipped: 0 });
        const definition = createDefinition([
            {
                key: 'failed-load',
                type: StepType.LOAD,
                adapterCode: 'product',
                config: {},
            },
        ]);

        const result = await replayFromStepLinear({
            ctx: {} as never,
            definition,
            startStepKey: 'failed-load',
            seed: SEED,
            executorCtx: {} as never,
            transformExecutor: {} as never,
            loadExecutor: { execute: load } as never,
            exportExecutor: {} as never,
            feedExecutor: {} as never,
            sinkExecutor: {} as never,
        });

        expect(load).toHaveBeenCalledWith(
            {},
            definition.steps[0],
            SEED,
            undefined,
            undefined,
            expect.objectContaining({
                channelStrategy: 'INHERIT',
                validationMode: 'STRICT',
            }),
        );
        expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    });

    it('rejects an unknown failed step instead of reporting an empty replay', async () => {
        await expect(replayFromStepLinear({
            ctx: {} as never,
            definition: createDefinition([]),
            startStepKey: 'missing',
            seed: SEED,
            executorCtx: {} as never,
            transformExecutor: {} as never,
            loadExecutor: {} as never,
            exportExecutor: {} as never,
            feedExecutor: {} as never,
            sinkExecutor: {} as never,
        })).rejects.toThrow('Replay start step "missing" not found');
    });
});

describe('replayFromStepGraph', () => {
    it('executes the failed graph step before its reachable descendants', async () => {
        const transformed = [{ sku: 'SKU-1', normalized: true }];
        const transform = vi.fn().mockResolvedValue(transformed);
        const load = vi.fn().mockResolvedValue({ ok: 1, fail: 0, skipped: 0 });
        const definition = createDefinition(
            [
                {
                    key: 'failed-transform',
                    type: StepType.TRANSFORM,
                    config: {},
                },
                {
                    key: 'load',
                    type: StepType.LOAD,
                    adapterCode: 'product',
                    config: {},
                },
            ],
            [{ from: 'failed-transform', to: 'load' }],
        );

        const result = await replayFromStepGraph({
            ctx: {} as never,
            definition,
            startStepKey: 'failed-transform',
            seed: SEED,
            executorCtx: {} as never,
            transformExecutor: { executeOperator: transform } as never,
            loadExecutor: { execute: load } as never,
            exportExecutor: {} as never,
            feedExecutor: {} as never,
            sinkExecutor: {} as never,
        });

        expect(transform).toHaveBeenCalledWith(
            {},
            definition.steps[0],
            SEED,
            {},
            expect.objectContaining({
                channelStrategy: 'INHERIT',
                validationMode: 'STRICT',
            }),
        );
        expect(load).toHaveBeenCalledWith(
            {},
            definition.steps[1],
            transformed,
            undefined,
            undefined,
            expect.objectContaining({
                channelStrategy: 'INHERIT',
                validationMode: 'STRICT',
            }),
        );
        expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    });

    it('rejects an unknown failed graph step instead of reporting success', async () => {
        await expect(replayFromStepGraph({
            ctx: {} as never,
            definition: createDefinition([], []),
            startStepKey: 'missing',
            seed: SEED,
            executorCtx: {} as never,
            transformExecutor: {} as never,
            loadExecutor: {} as never,
            exportExecutor: {} as never,
            feedExecutor: {} as never,
            sinkExecutor: {} as never,
        })).rejects.toThrow('Replay start step "missing" not found');
    });
});
