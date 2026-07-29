import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import {
    ConfigurationSource,
    PipelineStatus,
    RevisionType,
    RunStatus,
} from '../../constants/enums';
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
    run.gateStepKey = stepKey;
    run.gateTimeoutAt = new Date('2026-07-22T10:00:00.000Z');
    run.gateTimeoutLeaseToken = 'lease-token';
    run.gateTimeoutLeaseExpiresAt = new Date('2026-07-22T10:01:00.000Z');
    run.channelId = '17';
    run.channelToken = 'private-channel';
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
        expect(fixture.connection.getEntityOrThrow).toHaveBeenCalledWith(
            ctx,
            Pipeline,
            fixture.pipeline.id,
            { channelId: ctx.channelId },
        );
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
        expect(fixture.executionPermissions.assertAllowed).not.toHaveBeenCalled();
    });

    it('rejects starting a pipeline outside the active channel', async () => {
        const fixture = createFixture();
        fixture.connection.getEntityOrThrow.mockRejectedValueOnce(
            new Error('Pipeline not found'),
        );

        await expect(fixture.service.startRun(
            ctx,
            fixture.pipeline.id,
            { skipPermissionCheck: true },
        )).rejects.toThrow('Pipeline not found');
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('checks execution permissions before queueing a run', async () => {
        const fixture = createFixture();
        fixture.executionPermissions.assertAllowed.mockRejectedValueOnce(
            new Error('Target channel permission denied'),
        );

        await expect(
            fixture.service.startRun(ctx, fixture.pipeline.id),
        ).rejects.toThrow('Target channel permission denied');
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('scopes run lists and details to the active channel', async () => {
        const fixture = createFixture();
        const run = await fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
        });

        await expect(fixture.service.listRuns(ctx)).resolves.toEqual({
            items: [run],
            totalItems: 1,
        });
        expect(fixture.runListQuery.andWhere).toHaveBeenCalledWith(
            'pipelineRun.channelId = :channelId',
            { channelId: '17' },
        );
        await expect(fixture.service.runById(
            { channelId: 23 } as RequestContext,
            run.id,
        )).resolves.toBeNull();
    });

    it('does not cancel a run owned by another channel', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);

        await expect(fixture.service.cancelRun(
            { channelId: 23 } as RequestContext,
            run.id,
        )).rejects.toThrow();

        expect(run.status).toBe(RunStatus.PAUSED);
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishRunCancelled).not.toHaveBeenCalled();
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
        ).rejects.toThrow(/Published revision 7 is unavailable/);
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
    });

    it('runs the active published revision while the working copy is draft', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.DRAFT;

        const run = await fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
        });

        expect(run.revisionId).toBe(fixture.ids.revision);
        expect(run.definitionSnapshot).toEqual(publishedDefinition);
    });

    it('rejects a draft pipeline without an active published revision', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.DRAFT;
        fixture.pipeline.currentRevisionId = null;

        await expect(fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
        })).rejects.toThrow(/no active published revision/);
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale immediate trigger revision before creating a run', async () => {
        const fixture = createFixture();

        await expect(fixture.service.startRun(ctx, fixture.pipeline.id, {
            skipPermissionCheck: true,
            expectedRevisionId: 999,
        })).rejects.toThrow(/published revision changed/);
        expect(fixture.revisionRepository.findOne).not.toHaveBeenCalled();
        expect(fixture.runRepository.save).not.toHaveBeenCalled();
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
        expect(fixture.pipelineRepository.update).toHaveBeenCalledOnce();
    });

    it('keeps published state for a display-name-only update', async () => {
        const fixture = createFixture();

        await fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            name: 'Renamed catalog sync',
        });

        expect(fixture.pipeline.status).toBe(PipelineStatus.PUBLISHED);
        expect(fixture.pipeline.name).toBe('Renamed catalog sync');
        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            { name: 'Renamed catalog sync' },
        );
    });

    it('does not write or publish an event for an unchanged update', async () => {
        const fixture = createFixture();

        await fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            name: fixture.pipeline.name,
            enabled: fixture.pipeline.enabled,
        });

        expect(fixture.pipelineRepository.update).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishPipelineUpdated).not.toHaveBeenCalled();
    });

    it('blocks manual source mutations while code-first configuration owns the pipeline', async () => {
        const fixture = createFixture();
        fixture.pipeline.configurationSource = ConfigurationSource.CODE_FIRST;

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            name: 'Dashboard edit',
        })).rejects.toThrow(/managed by code-first configuration/);
        await expect(
            fixture.service.archive(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/managed by code-first configuration/);
        await expect(
            fixture.service.delete(ctx, fixture.pipeline.id),
        ).resolves.toMatchObject({
            result: DeletionResult.NOT_DELETED,
            message: expect.stringMatching(/managed by code-first configuration/),
        });

        expect(fixture.pipelineRepository.remove).not.toHaveBeenCalled();
    });

    it('keeps review workflow available for a code-first working copy', async () => {
        const fixture = createFixture();
        fixture.pipeline.configurationSource = ConfigurationSource.CODE_FIRST;
        fixture.pipeline.status = PipelineStatus.DRAFT;

        await expect(
            fixture.service.submitForReview(ctx, fixture.pipeline.id),
        ).resolves.toMatchObject({ status: PipelineStatus.REVIEW });

        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            { status: PipelineStatus.REVIEW },
        );
    });

    it('claims and releases code-first ownership without deleting the pipeline', async () => {
        const fixture = createFixture();

        await fixture.service.claimCodeFirstOwnership(ctx, fixture.pipeline);
        fixture.pipeline.configurationSource = ConfigurationSource.CODE_FIRST;
        await expect(
            fixture.service.releaseCodeFirstOwnership(ctx, new Set()),
        ).resolves.toBe(1);

        expect(fixture.pipelineRepository.update).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ rowVersion: 1 }),
            { configurationSource: ConfigurationSource.CODE_FIRST },
        );
        expect(fixture.pipelineRepository.update).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ rowVersion: 1 }),
            { configurationSource: ConfigurationSource.DATABASE },
        );
        expect(fixture.pipelineRepository.remove).not.toHaveBeenCalled();
    });

    it('invalidates the draft pointer when an existing draft definition changes', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.DRAFT;
        fixture.pipeline.draftRevisionId = 11;
        const changedDefinition: PipelineDefinition = {
            version: 1,
            steps: [{ key: 'changed-again', type: 'TRANSFORM', config: {} }],
        };

        await fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            definition: changedDefinition,
        });

        expect(fixture.pipeline.draftRevisionId).toBeNull();
        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            expect.objectContaining({
                definition: changedDefinition,
                draftRevisionId: null,
            }),
        );
    });

    it('rejects a working-copy update that loses a lifecycle race', async () => {
        const fixture = createFixture();
        fixture.pipelineRepository.update.mockResolvedValueOnce({ affected: 0 });

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            name: 'Concurrent name',
        })).rejects.toThrow(/changed concurrently/);

        expect(fixture.domainEvents.publishPipelineUpdated).not.toHaveBeenCalled();
    });

    it('rejects updates while archived', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.ARCHIVED;
        fixture.pipeline.enabled = false;

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            enabled: true,
        })).rejects.toThrow(/reactivate/);
        expect(fixture.pipeline.enabled).toBe(false);
        expect(fixture.pipelineRepository.update).not.toHaveBeenCalled();
    });

    it('rejects an archive that loses a concurrent lifecycle change', async () => {
        const fixture = createFixture();
        fixture.pipelineRepository.update.mockResolvedValueOnce({ affected: 0 });

        await expect(
            fixture.service.archive(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/changed concurrently/);

        expect(fixture.domainEvents.publishPipelineArchived).not.toHaveBeenCalled();
    });

    it('rejects review submission that loses a concurrent edit', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.DRAFT;
        fixture.pipelineRepository.update.mockResolvedValueOnce({ affected: 0 });

        await expect(
            fixture.service.submitForReview(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/changed concurrently/);

        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            { status: PipelineStatus.REVIEW },
        );
        expect(fixture.pipeline.status).toBe(PipelineStatus.DRAFT);
    });

    it('rejects review rejection that loses a concurrent edit', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.REVIEW;
        fixture.pipelineRepository.update.mockResolvedValueOnce({ affected: 0 });

        await expect(
            fixture.service.rejectReview(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/changed concurrently/);

        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            { status: PipelineStatus.DRAFT },
        );
        expect(fixture.pipeline.status).toBe(PipelineStatus.REVIEW);
    });

    it('rejects reactivation that loses a concurrent edit', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.ARCHIVED;
        fixture.pipeline.enabled = false;
        fixture.pipelineRepository.update.mockResolvedValueOnce({ affected: 0 });

        await expect(
            fixture.service.reactivate(ctx, fixture.pipeline.id),
        ).rejects.toThrow(/changed concurrently/);

        expect(fixture.pipelineRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({ rowVersion: 1 }),
            expect.objectContaining({
                status: PipelineStatus.PUBLISHED,
                enabled: true,
            }),
        );
        expect(fixture.pipeline.status).toBe(PipelineStatus.ARCHIVED);
        expect(fixture.domainEvents.publishPipelineReactivated).not.toHaveBeenCalled();
    });

    it('rejects a code change after first publication', async () => {
        const fixture = createFixture();

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            code: 'catalog-import',
        })).rejects.toThrow(/after its first publication/);
        expect(fixture.pipeline.code).toBe('catalog-sync');
        expect(fixture.pipelineRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a code change while another pipeline depends on it', async () => {
        const fixture = createFixture();
        fixture.pipeline.currentRevisionId = null;
        const dependent = createDependencyPipeline(2, 'storefront-export', ['catalog-sync']);
        fixture.setDependentPipelines([dependent]);

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            code: 'catalog-import',
        })).rejects.toThrow(
            'Cannot rename pipeline "catalog-sync" because it is required by: storefront-export',
        );
        expect(fixture.pipeline.code).toBe('catalog-sync');
        expect(fixture.pipelineRepository.update).not.toHaveBeenCalled();
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

    it('uses the immutable published revision when a draft removed a dependency', async () => {
        const fixture = createFixture();
        fixture.pipeline.currentRevisionId = null;
        const dependent = createDependencyPipeline(2, 'storefront-export', []);
        dependent.currentRevisionId = 8;
        const activeRevision = new PipelineRevision();
        activeRevision.id = 8;
        activeRevision.pipelineId = dependent.id;
        activeRevision.type = RevisionType.PUBLISHED;
        activeRevision.definition = {
            version: 1,
            steps: [],
            dependsOn: ['catalog-sync'],
        };
        fixture.setDependentPipelines([dependent]);
        fixture.setDependentRevisions([activeRevision]);

        const result = await fixture.service.delete(ctx, fixture.pipeline.id);

        expect(result).toEqual({
            result: DeletionResult.NOT_DELETED,
            message: 'Cannot delete pipeline "catalog-sync" because it is required by: storefront-export',
        });
        expect(fixture.pipelineRepository.remove).not.toHaveBeenCalled();
    });

    it('treats trigger-pipeline hooks as rename dependencies', async () => {
        const fixture = createFixture();
        fixture.pipeline.currentRevisionId = null;
        const dependent = createDependencyPipeline(2, 'storefront-export', []);
        dependent.definition = {
            version: 1,
            steps: [],
            hooks: {
                PIPELINE_COMPLETED: [{
                    type: 'TRIGGER_PIPELINE',
                    pipelineCode: 'catalog-sync',
                    triggerKey: 'follow-up',
                }],
            },
        };
        fixture.setDependentPipelines([dependent]);

        await expect(fixture.service.update(ctx, {
            id: fixture.pipeline.id,
            code: 'catalog-import',
        })).rejects.toThrow(
            'Cannot rename pipeline "catalog-sync" because it is required by: storefront-export',
        );
        expect(fixture.pipelineRepository.save).not.toHaveBeenCalled();
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
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('rejects gate approval when the run has no immutable snapshot', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        run.definitionSnapshot = null;
        fixture.pipeline.definition = {
            version: 1,
            steps: [{
                key: 'approval',
                type: 'GATE',
                config: { approvalType: 'MANUAL' },
            }],
        };

        await expect(
            fixture.service.approveGate(ctx, fixture.ids.run, 'approval'),
        ).rejects.toThrow(/no immutable definition snapshot/);

        expect(fixture.runRepository.update).not.toHaveBeenCalled();
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
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
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
    });

    it('approves only the exact run-scoped gate inside a transaction', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        const currentKeys = getGateCheckpointKeys(fixture.ids.run, 'approval');
        const otherKeys = getGateCheckpointKeys('another-run', 'approval');
        fixture.setCheckpointData({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
        });

        const result = await fixture.service.approveGate(
            ctx,
            fixture.ids.run,
            'approval',
        );

        expect(result).toBe(run);
        expect(run.status).toBe(RunStatus.RUNNING);
        expect(run.gateStepKey).toBeNull();
        expect(run.gateTimeoutAt).toBeNull();
        expect(run.gateTimeoutLeaseToken).toBeNull();
        expect(run.gateTimeoutLeaseExpiresAt).toBeNull();
        expect(fixture.runRepository.update).toHaveBeenCalledWith(
            {
                id: fixture.ids.run,
                channelId: '17',
                status: RunStatus.PAUSED,
                gateStepKey: 'approval',
            },
            expect.objectContaining({ status: RunStatus.RUNNING }),
        );
        expect(fixture.connection.withTransaction).toHaveBeenCalledOnce();
        expect(fixture.getCheckpointData()).toMatchObject({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [currentKeys.approved]: true,
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
        });
        expect(fixture.checkpointService.updateForPipeline).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishGateApproved).toHaveBeenCalledOnce();
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });

    it('does not resume a gate when its pending checkpoint is removed concurrently', async () => {
        const fixture = createFixture();
        createPausedGateRun(fixture);
        const keys = getGateCheckpointKeys(fixture.ids.run, 'approval');
        fixture.setCheckpointData({
            [keys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
        });
        fixture.checkpointService.updateForPipeline.mockImplementationOnce(
            async (_ctx, _pipelineId, updater) => ({
                data: updater({ unrelated: 'preserved' }),
            }),
        );

        await expect(
            fixture.service.approveGate(ctx, fixture.ids.run, 'approval'),
        ).rejects.toThrow(/pending gate state was removed concurrently/);

        expect(fixture.domainEvents.publishGateApproved).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('does not mutate a paused gate owned by another channel', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        fixture.setCheckpointData({
            [getGateCheckpointKeys(fixture.ids.run, 'approval').pending]: {
                pendingRecords: [],
            },
        });

        await expect(fixture.service.approveGate(
            { channelId: 23 } as RequestContext,
            fixture.ids.run,
            'approval',
        )).rejects.toThrow(`Pipeline run not found: ${String(run.id)}`);

        expect(run.status).toBe(RunStatus.PAUSED);
        expect(fixture.runRepository.update).not.toHaveBeenCalled();
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishGateApproved).not.toHaveBeenCalled();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });

    it('rejects a gate without deleting another run checkpoint', async () => {
        const fixture = createFixture();
        const run = createPausedGateRun(fixture);
        const currentKeys = getGateCheckpointKeys(fixture.ids.run, 'approval');
        const otherKeys = getGateCheckpointKeys('another-run', 'approval');
        fixture.setCheckpointData({
            [currentKeys.pending]: { pendingRecords: [{ sku: 'SKU-1' }] },
            [currentKeys.approved]: true,
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
        expect(run.gateStepKey).toBeNull();
        expect(run.gateTimeoutAt).toBeNull();
        expect(run.gateTimeoutLeaseToken).toBeNull();
        expect(run.gateTimeoutLeaseExpiresAt).toBeNull();
        expect(fixture.runRepository.update).toHaveBeenCalledWith(
            {
                id: fixture.ids.run,
                channelId: '17',
                status: RunStatus.PAUSED,
                gateStepKey: 'approval',
            },
            expect.objectContaining({ status: RunStatus.CANCELLED }),
        );
        expect(fixture.getCheckpointData()).toEqual({
            [otherKeys.pending]: { pendingRecords: [{ sku: 'SKU-2' }] },
            unrelated: 'preserved',
        });
        expect(fixture.checkpointService.updateForPipeline).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishGateRejected).toHaveBeenCalledOnce();
        expect(fixture.eventBus.publish).not.toHaveBeenCalled();
    });
});
