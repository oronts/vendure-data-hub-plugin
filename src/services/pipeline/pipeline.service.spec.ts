import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { PipelineStatus, RevisionType, RunStatus } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import {
    createPipelineServiceFixture as createFixture,
    draftDefinition,
    publishedDefinition,
} from './pipeline.service.spec-fixture';

describe('PipelineService lifecycle', () => {
    const ctx = {} as RequestContext;

    it('snapshots the active published revision when a run is queued', async () => {
        const fixture = createFixture();

        const run = await fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
        });

        expect(run.status).toBe(RunStatus.PENDING);
        expect(run.definitionSnapshot).toEqual(publishedDefinition);
        expect(run.definitionSnapshot).not.toBe(publishedDefinition);
        expect(run.definitionSnapshot).not.toEqual(draftDefinition);
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });

    it('preserves UUID pipeline, revision, and run IDs while queueing a run', async () => {
        const ids = {
            pipeline: '10000000-0000-4000-8000-000000000010',
            revision: '10000000-0000-4000-8000-000000000011',
            run: '10000000-0000-4000-8000-000000000012',
        } as const;
        const fixture = createFixture(ids);

        const run = await fixture.service.startRun(ctx, ids.pipeline, {
            skipPermissionCheck: true,
        });

        expect(run.id).toBe(ids.run);
        expect(run.pipelineId).toBe(ids.pipeline);
        expect(fixture.revisionRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: ids.revision,
                pipelineId: ids.pipeline,
                type: RevisionType.PUBLISHED,
            },
        });
    });

    it('fails before enqueue when the active published revision is missing', async () => {
        const fixture = createFixture();
        fixture.revisionRepository.findOne.mockResolvedValueOnce(null);

        await expect(
            fixture.service.startRun(ctx, fixture.pipeline.id, {
                skipPermissionCheck: true,
            }),
        ).rejects.toThrow(/Active revision not found/);
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
    });

    it('does not run a draft pipeline', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.DRAFT;

        await expect(
            fixture.service.startRun(ctx, fixture.pipeline.id, {
                skipPermissionCheck: true,
            }),
        ).rejects.toThrow(/Cannot run/);
        expect(fixture.revisionRepository.findOne).not.toHaveBeenCalled();
    });

    it('moves a published pipeline to draft when its definition changes', async () => {
        const fixture = createFixture();
        const changedDefinition: PipelineDefinition = {
            version: 1,
            steps: [{ key: 'changed', type: 'TRANSFORM', config: {} }],
        };

        await fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            definition: changedDefinition,
        });

        expect(fixture.pipeline.status).toBe(PipelineStatus.DRAFT);
        expect(fixture.pipeline.definition).toEqual(changedDefinition);
        expect(fixture.pipelineRepository.save).toHaveBeenCalledOnce();
    });

    it('keeps published state for a display-name-only update', async () => {
        const fixture = createFixture();

        await fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            name: 'Renamed catalog sync',
        });

        expect(fixture.pipeline.status).toBe(PipelineStatus.PUBLISHED);
        expect(fixture.pipeline.name).toBe('Renamed catalog sync');
    });
});
