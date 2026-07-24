import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineStatus, RevisionType } from '../../constants';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import {
    loadRunnablePipelineDefinitionByCode,
    loadRunnablePipelineDefinitions,
} from './active-pipeline-definitions';

const publishedDefinition: PipelineDefinition = {
    version: 1,
    steps: [{ key: 'published', type: 'TRANSFORM', config: {} }],
};

function createFixture() {
    const pipeline = Object.assign(new Pipeline(), {
        id: 3,
        code: 'catalog-sync',
        enabled: true,
        status: PipelineStatus.DRAFT,
        currentRevisionId: 17,
    });
    const revision = Object.assign(new PipelineRevision(), {
        id: 17,
        pipelineId: 3,
        type: RevisionType.PUBLISHED,
        definition: publishedDefinition,
    });
    const pipelineRepository = {
        find: vi.fn(async () => [pipeline]),
        findOne: vi.fn(async (): Promise<Pipeline | null> => pipeline),
    };
    const revisionRepository = {
        find: vi.fn(async () => [revision]),
    };
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => (
            entity === Pipeline ? pipelineRepository : revisionRepository
        )),
    } as unknown as TransactionalConnection;

    return {
        connection,
        pipeline,
        revision,
        pipelineRepository,
        revisionRepository,
    };
}

describe('runnable pipeline definition discovery', () => {
    const ctx = {} as RequestContext;

    it('hydrates the immutable published definition for an active draft working copy', async () => {
        const fixture = createFixture();

        const result = await loadRunnablePipelineDefinitions(fixture.connection, ctx);

        expect(result).toEqual([{
            id: 3,
            code: 'catalog-sync',
            revisionId: 17,
            definition: publishedDefinition,
        }]);
        expect(fixture.pipelineRepository.find).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                enabled: true,
                status: expect.anything(),
                currentRevisionId: expect.anything(),
            }),
            order: { id: 'ASC' },
        }));
    });

    it('fails closed when the published revision does not belong to the pipeline', async () => {
        const fixture = createFixture();
        fixture.revision.pipelineId = 99;

        await expect(
            loadRunnablePipelineDefinitions(fixture.connection, ctx),
        ).rejects.toThrow(/Published revision 17 is unavailable/);
    });

    it('enforces the caller discovery limit before hydrating revisions', async () => {
        const fixture = createFixture();
        fixture.pipelineRepository.find.mockResolvedValueOnce([
            fixture.pipeline,
            Object.assign(new Pipeline(), {
                id: 4,
                code: 'second',
                currentRevisionId: 18,
            }),
        ]);

        await expect(
            loadRunnablePipelineDefinitions(fixture.connection, ctx, 1),
        ).rejects.toThrow(/safe limit of 1/);
        expect(fixture.revisionRepository.find).not.toHaveBeenCalled();
    });

    it('returns null when no runnable pipeline matches a webhook code', async () => {
        const fixture = createFixture();
        fixture.pipelineRepository.findOne.mockResolvedValueOnce(null);

        await expect(
            loadRunnablePipelineDefinitionByCode(
                fixture.connection,
                ctx,
                'missing',
            ),
        ).resolves.toBeNull();
        expect(fixture.revisionRepository.find).not.toHaveBeenCalled();
    });
});
