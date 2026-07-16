import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import { ExecutionLifecycleManager } from './execution-lifecycle';
function createPreparationFixture() {
    const checkpointManager = {
        clearCheckpoint: vi.fn(async () => undefined),
        loadCheckpoint: vi.fn(async () => undefined),
        saveCheckpoint: vi.fn(async () => undefined),
    };
    const lifecycle = new ExecutionLifecycleManager(
        {} as never,
        checkpointManager as never,
        { run: vi.fn(async () => undefined) } as never,
        { publish: vi.fn() } as never,
        { debug: vi.fn() } as never,
    );

    return { lifecycle, checkpointManager };
}

describe('ExecutionLifecycleManager', () => {
    it('preserves durable checkpoints on ordinary runs by default', async () => {
        const { lifecycle, checkpointManager } = createPreparationFixture();
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };

        await lifecycle.prepareExecution(ctx, definition, 7);

        expect(checkpointManager.clearCheckpoint).not.toHaveBeenCalled();
        expect(checkpointManager.loadCheckpoint).toHaveBeenCalledWith(ctx, 7);
    });

    it('clears a checkpoint only when explicitly requested', async () => {
        const { lifecycle, checkpointManager } = createPreparationFixture();
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };

        await lifecycle.prepareExecution(ctx, definition, 7, 11, { resetCheckpoint: true });

        expect(checkpointManager.clearCheckpoint).toHaveBeenCalledWith(ctx, 7);
        expect(checkpointManager.loadCheckpoint).toHaveBeenCalledWith(ctx, 7);
    });

    it('loads a checkpoint without clearing it when resuming a run', async () => {
        const { lifecycle, checkpointManager } = createPreparationFixture();
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };

        await lifecycle.prepareExecution(ctx, definition, 7, 11, { resume: true });

        expect(checkpointManager.clearCheckpoint).not.toHaveBeenCalled();
        expect(checkpointManager.loadCheckpoint).toHaveBeenCalledWith(ctx, 7);
    });

    it('does not emit completion side effects when checkpoint persistence fails', async () => {
        const failure = new Error('checkpoint write failed');
        const checkpointManager = {
            saveCheckpoint: vi.fn(async () => {
                throw failure;
            }),
        };
        const hookService = {
            run: vi.fn(async () => undefined),
        };
        const domainEvents = {
            publish: vi.fn(),
        };
        const lifecycle = new ExecutionLifecycleManager(
            {} as never,
            checkpointManager as never,
            hookService as never,
            domainEvents as never,
            { debug: vi.fn() } as never,
        );
        const ctx = {} as RequestContext;
        const definition: PipelineDefinition = { version: 1, steps: [] };
        const result = {
            processed: 2,
            succeeded: 2,
            failed: 0,
            details: [],
            counters: { extracted: 2 },
        };

        await expect(
            lifecycle.finalizeExecution(ctx, definition, result, 7),
        ).rejects.toBe(failure);

        expect(result.details).toEqual([]);
        expect(hookService.run).not.toHaveBeenCalled();
        expect(domainEvents.publish).not.toHaveBeenCalled();
    });
});
