import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubCheckpoint } from '../../entities/data';
import { Pipeline } from '../../entities/pipeline';
import { CheckpointService } from './checkpoint.service';

function createService(repository: object) {
    const pipeline = new Pipeline();
    pipeline.id = 7;
    const connection = {
        getRepository: vi.fn(() => repository),
        getEntityOrThrow: vi.fn(async () => pipeline),
    };
    return {
        service: new CheckpointService(
            connection as unknown as TransactionalConnection,
        ),
        connection,
        pipeline,
    };
}

describe('CheckpointService', () => {
    const ctx = {} as RequestContext;

    it('updates the single checkpoint row for a pipeline', async () => {
        const checkpoint = new DataHubCheckpoint();
        checkpoint.pipelineId = 7;
        checkpoint.data = { cursor: 1 };
        const repository = {
            findOne: vi.fn(async () => checkpoint),
            save: vi.fn(async (entity: DataHubCheckpoint) => entity),
            remove: vi.fn(),
        };
        const { service } = createService(repository);

        const result = await service.setForPipeline(ctx, 7, { cursor: 2 });

        expect(result).toBe(checkpoint);
        expect(checkpoint.data).toEqual({ cursor: 2 });
        expect(repository.save).toHaveBeenCalledOnce();
    });

    it('updates the row that wins a concurrent unique insert', async () => {
        const winner = new DataHubCheckpoint();
        winner.pipelineId = 7;
        winner.data = { cursor: 1 };
        const repository = {
            findOne: vi.fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(winner),
            save: vi.fn()
                .mockRejectedValueOnce(new Error('23505 unique constraint'))
                .mockImplementationOnce(async (entity: DataHubCheckpoint) => entity),
            remove: vi.fn(),
        };
        const { service } = createService(repository);

        const result = await service.setForPipeline(ctx, 7, { cursor: 2 });

        expect(result).toBe(winner);
        expect(winner.data).toEqual({ cursor: 2 });
        expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('removes only the pipeline checkpoint selected by the unique key', async () => {
        const checkpoint = new DataHubCheckpoint();
        checkpoint.pipelineId = 7;
        const repository = {
            findOne: vi.fn(async () => checkpoint),
            save: vi.fn(),
            remove: vi.fn(async () => checkpoint),
        };
        const { service } = createService(repository);

        await service.clearForPipeline(ctx, 7);

        expect(repository.findOne).toHaveBeenCalledWith({
            where: { pipelineId: 7 },
        });
        expect(repository.remove).toHaveBeenCalledWith(checkpoint);
    });
});
