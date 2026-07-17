import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineStatus, RevisionType, RunStatus } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import { getGateCheckpointKeys } from '../../runtime/gate-checkpoint';
import {
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
} from '../../permissions';
import {
    createPipelineServiceFixture as createFixture,
    draftDefinition,
    publishedDefinition,
} from './pipeline.service.spec-fixture';


function permissionContext(...granted: string[]): RequestContext {
    const permissions = new Set(granted);
    return {
        channelId: 17,
        channel: { token: 'private-channel' },
        userHasPermissions: (requested: string[]) => requested.some(permission => permissions.has(permission)),
    } as unknown as RequestContext;
}

function createPausedGateRun(
    fixture: ReturnType<typeof createFixture>,
    stepKey = 'approval',
): PipelineRun {
    const run = new PipelineRun();
    run.id = fixture.ids.run;
    run.pipeline = fixture.pipeline;
    run.pipelineId = fixture.ids.pipeline;
    run.status = RunStatus.PAUSED;
    run.metrics = { pausedAtStep: stepKey };
    run.definitionSnapshot = {
        version: 1,
        steps: [{
            key: stepKey,
            type: 'GATE',
            config: { approvalType: 'MANUAL' },
        }],
    };
    fixture.setRun(run);
    return run;
}

function createDependencyPipeline(
    id: number,
    code: string,
    dependsOn: string[],
): Pipeline {
    const pipeline = new Pipeline();
    pipeline.id = id;
    pipeline.code = code;
    pipeline.name = code;
    pipeline.definition = { version: 1, steps: [], dependsOn };
    return pipeline;
}

describe('PipelineService lifecycle', () => {
    const ctx = {
        channelId: 17,
        channel: { token: 'private-channel' },
    } as RequestContext;

    it('snapshots the active published revision when a run is queued', async () => {
        const fixture = createFixture();

        const run = await fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
        });

        expect(run.status).toBe(RunStatus.PENDING);
        expect(run.revisionId).toBe(fixture.pipeline.currentRevisionId);
        expect(run.definitionSnapshot).toEqual(publishedDefinition);
        expect(run.definitionSnapshot).not.toBe(publishedDefinition);
        expect(run.definitionSnapshot).not.toEqual(draftDefinition);
        expect(run.channelId).toBe('17');
        expect(run.channelToken).toBe('private-channel');
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
        expect(fixture.pipeline.currentRevisionId).toBe(fixture.ids.revision);
        expect(fixture.pipeline.draftRevisionId).toBeNull();
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

    it('rejects a code change while another pipeline depends on it', async () => {
        const fixture = createFixture();
        const dependent = createDependencyPipeline(2, 'storefront-export', ['catalog-sync']);
        fixture.setDependentPipelines([dependent]);

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            code: 'catalog-import',
        })).rejects.toThrow(
            'Cannot rename pipeline "catalog-sync" because it is required by: storefront-export',
        );
        expect(fixture.pipeline.code).toBe('catalog-sync');
        expect(fixture.pipelineRepository.save).not.toHaveBeenCalled();
    });

    it('returns NOT_DELETED while another pipeline depends on it', async () => {
        const fixture = createFixture();
        const dependent = createDependencyPipeline(2, 'storefront-export', ['catalog-sync']);
        fixture.setDependentPipelines([dependent]);

        const result = await fixture.service.delete(ctx, fixture.pipeline.id);

        expect(result).toEqual({
            result: DeletionResult.NOT_DELETED,
            message: 'Cannot delete pipeline "catalog-sync" because it is required by: storefront-export',
        });
        expect(fixture.pipelineRepository.remove).not.toHaveBeenCalled();
    });
    it.each([
        PipelineStatus.DRAFT,
        PipelineStatus.PUBLISHED,
        PipelineStatus.ARCHIVED,
    ])('rejects direct publication from %s', async status => {
        const fixture = createFixture();
        fixture.pipeline.status = status;

        await expect(
            fixture.service.publish(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/Cannot publish/);
        expect(fixture.revisionService.publishVersion).not.toHaveBeenCalled();
    });

    it('publishes only a reviewed pipeline', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.REVIEW;

        const published = await fixture.service.publish(ctx, fixture.pipeline.id);

        expect(published.status).toBe(PipelineStatus.PUBLISHED);
        expect(fixture.revisionService.publishVersion).toHaveBeenCalledOnce();
    });

    it('requires both review and publish permissions to approve', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.REVIEW;

        await expect(fixture.service.approve(
            permissionContext(ReviewDataHubPipelinePermission.Permission),
            fixture.pipeline.id,
        )).rejects.toThrow(/both review and publish permissions/);
        expect(fixture.revisionService.publishVersion).not.toHaveBeenCalled();

        await fixture.service.approve(
            permissionContext(
                ReviewDataHubPipelinePermission.Permission,
                PublishDataHubPipelinePermission.Permission,
            ),
            fixture.pipeline.id,
        );
        expect(fixture.revisionService.publishVersion).toHaveBeenCalledOnce();
    });

    it('enforces draft, review, and published transition sources', async () => {
        const fixture = createFixture();

        fixture.pipeline.status = PipelineStatus.PUBLISHED;
        await expect(
            fixture.service.submitForReview(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/Cannot submit for review/);

        fixture.pipeline.status = PipelineStatus.DRAFT;
        await fixture.service.submitForReview(ctx, fixture.pipeline.id);
        expect(fixture.pipeline.status).toBe(PipelineStatus.REVIEW);

        await fixture.service.rejectReview(ctx, fixture.pipeline.id);
        expect(fixture.pipeline.status).toBe(PipelineStatus.DRAFT);

        await expect(
            fixture.service.archive(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/Cannot archive/);

        fixture.pipeline.status = PipelineStatus.PUBLISHED;
        await fixture.service.archive(ctx, fixture.pipeline.id);
        expect(fixture.pipeline.status).toBe(PipelineStatus.ARCHIVED);
        expect(fixture.pipeline.enabled).toBe(false);
        expect(fixture.domainEvents.publishPipelineArchived).toHaveBeenCalledOnce();
    });

    it('reactivates only an archived pipeline and restores its active revision', async () => {
        const fixture = createFixture();

        await expect(
            fixture.service.reactivate(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/Cannot reactivate/);

        fixture.pipeline.status = PipelineStatus.ARCHIVED;
        fixture.pipeline.enabled = false;
        fixture.pipeline.definition = draftDefinition;

        const reactivated = await fixture.service.reactivate(ctx, fixture.pipeline.id);

        expect(reactivated.status).toBe(PipelineStatus.PUBLISHED);
        expect(reactivated.enabled).toBe(true);
        expect(reactivated.definition).toEqual(publishedDefinition);
        expect(fixture.revisionRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: fixture.pipeline.currentRevisionId,
                pipelineId: fixture.pipeline.id,
                type: RevisionType.PUBLISHED,
            },
        });
        expect(fixture.domainEvents.publishPipelineReactivated).toHaveBeenCalledOnce();
    });

    it('rejects approval for a gate other than the run checkpoint', async () => {
        const fixture = createFixture();
        createPausedGateRun(fixture);
        fixture.setCheckpointData({
            [getGateCheckpointKeys(fixture.ids.run, 'approval').pending]: {
                pendingRecords: [],
            },
        });

        await expect(
            fixture.service.approveGate(ctx, fixture.ids.run, 'different-gate'),
        ).rejects.toThrow(/run is paused at "approval"/);

        expect(fixture.runRepository.update).not.toHaveBeenCalled();
        expect(fixture.checkpointService.setForPipeline).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('requires pending state for the exact run before approving a gate', async () => {
        const fixture = createFixture();
        createPausedGateRun(fixture);
        fixture.setCheckpointData({
            [getGateCheckpointKeys('another-run', 'approval').pending]: {
                pendingRecords: [],
            },
        });

        await expect(
            fixture.service.approveGate(ctx, fixture.ids.run, 'approval'),
        ).rejects.toThrow(/pending gate state was not found/);

        expect(fixture.runRepository.update).not.toHaveBeenCalled();
        expect(fixture.checkpointService.setForPipeline).not.toHaveBeenCalled();
    });

    it('approves only the exact run-scoped gate inside a transaction', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        const currentKeys = getGateCheckpointKeys(fixture.ids.run, 'approval');
        const otherKeys = getGateCheckpointKeys('another-run', 'approval');
        fixture.setCheckpointData({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [currentKeys.timeout]: {
                runId: fixture.ids.run,
                stepKey: 'approval',
            },
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
        });

        const result = await fixture.service.approveGate(
            ctx,
            fixture.ids.run,
            'approval',
        );

        expect(result).toBe(run);
        expect(run.status).toBe(RunStatus.RUNNING);
        expect(fixture.connection.withTransaction).toHaveBeenCalledOnce();
        expect(fixture.getCheckpointData()).toMatchObject({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [currentKeys.approved]: true,
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
        });
        expect(fixture.domainEvents.publishGateApproved).toHaveBeenCalledOnce();
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });

    it('rejects a gate without deleting another run checkpoint', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        const currentKeys = getGateCheckpointKeys(fixture.ids.run, 'approval');
        const otherKeys = getGateCheckpointKeys('another-run', 'approval');
        fixture.setCheckpointData({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [currentKeys.approved]: true,
            [currentKeys.timeout]: {
                runId: fixture.ids.run,
                stepKey: 'approval',
            },
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
            unrelated: 'preserved',
        });

        const result = await fixture.service.rejectGate(
            ctx,
            fixture.ids.run,
            'approval',
        );

        expect(result).toBe(run);
        expect(run.status).toBe(RunStatus.CANCELLED);
        expect(fixture.getCheckpointData()).toEqual({
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
            unrelated: 'preserved',
        });
        expect(fixture.domainEvents.publishGateRejected).toHaveBeenCalledOnce();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });
});
