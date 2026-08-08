import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { CheckpointService } from '../../services/data/checkpoint.service';
import { DataHubLogger } from '../../services/logger';
import { CheckpointManager } from './checkpoint-manager';

function createFixture() {
    const checkpointService = {
        getByPipeline: vi.fn(async () => ({ data: { cursor: 'next-page' } })),
        clearForPipeline: vi.fn(async () => undefined),
        updateForPipeline: vi.fn(async (_ctx, _pipelineId, updater) => ({
            data: updater({ fileWatcher: { path: 'pending.csv' } }),
        })),
    };
    const logger = {
        debug: vi.fn(),
        warn: vi.fn(),
    };
    const manager = new CheckpointManager(
        checkpointService as unknown as CheckpointService,
        logger as unknown as DataHubLogger,
    );
    return { manager, checkpointService };
}

describe('CheckpointManager', () => {
    const ctx = {} as RequestContext;

    it('loads persisted state and starts clean', async () => {
        const { manager } = createFixture();

        await manager.loadCheckpoint(ctx, 1);

        expect(manager.getCheckpointData()).toEqual({ cursor: 'next-page' });
        expect(manager.isCheckpointDirty()).toBe(false);
    });

    it('fails closed when checkpoint loading fails', async () => {
        const { manager, checkpointService } = createFixture();
        checkpointService.getByPipeline.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(manager.loadCheckpoint(ctx, 1)).rejects.toThrow('database unavailable');
        expect(manager.getCheckpointData()).toBeNull();
    });

    it('fails closed when clearing a fresh-run checkpoint fails', async () => {
        const { manager, checkpointService } = createFixture();
        checkpointService.clearForPipeline.mockRejectedValueOnce(new Error('clear failed'));

        await expect(manager.clearCheckpoint(ctx, 1)).rejects.toThrow('clear failed');
    });

    it('keeps dirty state when persistence fails', async () => {
        const { manager, checkpointService } = createFixture();
        await manager.loadCheckpoint(ctx, 1);
        manager.markCheckpointDirty();
        checkpointService.updateForPipeline.mockRejectedValueOnce(new Error('save failed'));

        await expect(manager.saveCheckpoint(ctx, 1)).rejects.toThrow('save failed');
        expect(manager.isCheckpointDirty()).toBe(true);
    });

    it('marks checkpoint state clean only after a successful save', async () => {
        const { manager, checkpointService } = createFixture();
        await manager.loadCheckpoint(ctx, 1);
        manager.markCheckpointDirty();

        await manager.saveCheckpoint(ctx, 1);

        expect(checkpointService.updateForPipeline).toHaveBeenCalledWith(
            ctx,
            1,
            expect.any(Function),
        );
        expect(manager.isCheckpointDirty()).toBe(false);
    });

    it('merges changed runtime keys without overwriting independent state', async () => {
        const { manager, checkpointService } = createFixture();
        await manager.loadCheckpoint(ctx, 1);
        const checkpoint = manager.getCheckpointData();
        if (!checkpoint) throw new Error('Expected loaded checkpoint');
        checkpoint.cursor = { value: 'after' };
        manager.markCheckpointDirty();

        await manager.saveCheckpoint(ctx, 1);

        const updater = checkpointService.updateForPipeline.mock.calls[0][2];
        expect(updater({ fileWatcher: { path: 'pending.csv' } })).toEqual({
            fileWatcher: { path: 'pending.csv' },
            cursor: { value: 'after' },
        });
    });
});
