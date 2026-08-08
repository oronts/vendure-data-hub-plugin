import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ID, RequestContext } from '@vendure/core';
import type { PipelineDefinition } from '../types';

vi.mock('./orchestration', async importOriginal => {
    const actual = await importOriginal<typeof import('./orchestration')>();
    return {
        ...actual,
        executeLinear: vi.fn(),
    };
});

import { executeLinear } from './orchestration';
import { AdapterRuntimeService } from './adapter-runtime.service';

function createFixture() {
    const checkpointData = new Map<string, Record<string, unknown>>();
    const checkpointService = {
        clearForPipeline: vi.fn(async () => undefined),
        getByPipeline: vi.fn(async (_ctx: RequestContext, pipelineId: ID) => {
            const key = String(pipelineId);
            const data = checkpointData.get(key) ?? {
                source: { pipelineId: key },
            };
            checkpointData.set(key, data);
            return { data };
        }),
        updateForPipeline: vi.fn(async (
            _ctx: RequestContext,
            pipelineId: ID,
            updater: (
                current: Record<string, unknown>,
            ) => Record<string, unknown> | Promise<Record<string, unknown>>,
        ) => {
            const key = String(pipelineId);
            const current = checkpointData.get(key) ?? {};
            checkpointData.set(key, await updater(structuredClone(current)));
        }),
    };
    const hookService = {
        run: vi.fn(async () => undefined),
    };
    const domainEvents = {
        publish: vi.fn(),
    };
    const logger = {
        debug: vi.fn(),
        warn: vi.fn(),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => logger),
    };
    const executor = {} as never;
    const runtime = new AdapterRuntimeService(
        {} as never,
        checkpointService as never,
        hookService as never,
        domainEvents as never,
        executor,
        executor,
        executor,
        executor,
        executor,
        executor,
        executor,
        {} as never,
        loggerFactory as never,
    );

    return { runtime, checkpointData, checkpointService };
}

describe('AdapterRuntimeService checkpoint isolation', () => {
    beforeEach(() => {
        vi.mocked(executeLinear).mockReset();
    });

    it('persists independent checkpoint state for concurrent pipeline runs', async () => {
        const { runtime, checkpointData, checkpointService } = createFixture();
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };
        const executeLinearMock = vi.mocked(executeLinear);
        let startedCount = 0;
        let releaseExecutions: () => void = () => undefined;
        let notifyBothStarted: () => void = () => undefined;
        const executionsReleased = new Promise<void>(resolve => {
            releaseExecutions = resolve;
        });
        const bothStarted = new Promise<void>(resolve => {
            notifyBothStarted = resolve;
        });

        executeLinearMock.mockImplementation(async params => {
            const pipelineId = String(params.pipelineId);
            params.executorCtx.cpData![`step-${pipelineId}`] = { cursor: pipelineId };
            params.executorCtx.markCheckpointDirty();
            startedCount += 1;
            if (startedCount === 2) {
                notifyBothStarted();
            }
            await executionsReleased;
            return {
                processed: 1,
                succeeded: 1,
            failed: 0,
            skipped: 0,
            details: [],
                counters: {},
                cancelled: false,
                paused: false,
            };
        });

        const firstRun = runtime.executePipeline(ctx, definition, undefined, undefined, 1);
        const secondRun = runtime.executePipeline(ctx, definition, undefined, undefined, 2);
        await bothStarted;
        releaseExecutions();
        await Promise.all([firstRun, secondRun]);

        expect(checkpointService.updateForPipeline).toHaveBeenCalledTimes(2);
        expect(checkpointData.get('1')).toEqual({
            source: { pipelineId: '1' },
            'step-1': { cursor: '1' },
        });
        expect(checkpointData.get('2')).toEqual({
            source: { pipelineId: '2' },
            'step-2': { cursor: '2' },
        });
    });

    it('does not persist working checkpoint state when execution fails', async () => {
        const { runtime, checkpointService } = createFixture();
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };
        const failure = new Error('load failed');

        vi.mocked(executeLinear).mockImplementation(async params => {
            params.executorCtx.cpData!.extract = { cursor: 'uncommitted' };
            params.executorCtx.markCheckpointDirty();
            throw failure;
        });

        await expect(
            runtime.executePipeline(ctx, definition, undefined, undefined, 7),
        ).rejects.toBe(failure);

        expect(checkpointService.updateForPipeline).not.toHaveBeenCalled();
    });
});
