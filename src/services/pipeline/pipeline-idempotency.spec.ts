import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { PipelineRevision } from '../../entities/pipeline';
import { RevisionType } from '../../constants';
import { PipelineRunIdempotencyConflictError } from './pipeline-run-idempotency';
import { createPipelineServiceFixture as createFixture } from './pipeline.service.spec-fixture';

const context = {
    channelId: 1,
    channel: { token: 'incoming-channel' },
} as RequestContext;
const baseOptions = {
    triggerKey: 'orders-webhook',
    skipPermissionCheck: true,
    triggeredBy: 'webhook:orders-webhook',
    idempotencyKey: 'request-42',
    idempotencyTtlSeconds: 3_600,
    requestFingerprint: 'payload-a',
} as const;

describe('PipelineService incoming idempotency', () => {
    it('creates a durable run from the exact pinned published revision', async () => {
        const fixture = createFixture();
        const pinnedDefinition = {
            version: 1,
            steps: [
                {
                    key: 'orders-webhook',
                    type: 'TRIGGER',
                    config: { type: 'WEBHOOK' },
                },
                { key: 'captured-event', type: 'TRANSFORM', config: {} },
            ],
            edges: [{ from: 'orders-webhook', to: 'captured-event' }],
        } as const;
        const pinnedRevision = Object.assign(new PipelineRevision(), {
            id: 6,
            pipelineId: fixture.pipeline.id,
            type: RevisionType.PUBLISHED,
            definition: pinnedDefinition,
        });
        fixture.revisionRepository.findOne.mockResolvedValueOnce(pinnedRevision);

        const result = await fixture.service.startPinnedIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            pinnedRevision.id,
            [{ id: 42 }],
            baseOptions,
        );

        expect(result.duplicate).toBe(false);
        expect(result.run.revisionId).toBe(6);
        expect(result.run.definitionSnapshot).toEqual(pinnedDefinition);
        expect(fixture.revisionRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: 6,
                pipelineId: fixture.pipeline.id,
                type: RevisionType.PUBLISHED,
            },
        });
    });

    it('returns an existing pinned delivery after publication moves forward', async () => {
        const fixture = createFixture();
        const first = await fixture.service.startPinnedIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            fixture.ids.revision,
            [{ id: 42 }],
            baseOptions,
        );
        fixture.pipeline.currentRevisionId = 99;
        fixture.revisionRepository.findOne.mockRejectedValueOnce(
            new Error('must not reload a duplicate delivery'),
        );

        const duplicate = await fixture.service.startPinnedIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            fixture.ids.revision,
            [{ id: 42 }],
            baseOptions,
        );

        expect(duplicate).toEqual({ run: first.run, duplicate: true });
        expect(fixture.revisionRepository.findOne).toHaveBeenCalledOnce();
    });

    it('rejects a seeded run when the selected revision no longer has that trigger', async () => {
        const fixture = createFixture();
        fixture.revisionRepository.findOne.mockResolvedValueOnce(
            Object.assign(new PipelineRevision(), {
                id: fixture.ids.revision,
                pipelineId: fixture.pipeline.id,
                type: RevisionType.PUBLISHED,
                definition: {
                    version: 1,
                    steps: [{ key: 'published', type: 'TRANSFORM', config: {} }],
                },
            }),
        );

        await expect(fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        )).rejects.toThrow(/no enabled trigger step "orders-webhook"/);

        expect(fixture.runRepository.save).not.toHaveBeenCalled();
    });

    it('returns the existing run without enqueueing a duplicate', async () => {
        const fixture = createFixture();

        const first = await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );
        const duplicate = await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );

        expect(first.duplicate).toBe(false);
        expect(duplicate.duplicate).toBe(true);
        expect(duplicate.run).toBe(first.run);
        expect(first.run.idempotencyKeyHash).toMatch(/^[a-f0-9]{64}$/);
        expect(first.run.idempotencyKeyHash).not.toContain(baseOptions.idempotencyKey);
        expect(first.run.channelId).toBe('1');
        expect(first.run.channelToken).toBe('incoming-channel');
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });

    it('rejects reuse of a key with a different request fingerprint', async () => {
        const fixture = createFixture();
        await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );

        await expect(fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 43 }],
            { ...baseOptions, requestFingerprint: 'payload-b' },
        )).rejects.toBeInstanceOf(PipelineRunIdempotencyConflictError);
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });

    it('releases an expired key before enqueueing a new run', async () => {
        const fixture = createFixture();
        const first = await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );
        first.run.idempotencyExpiresAt = new Date(0);

        const next = await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );

        expect(next.duplicate).toBe(false);
        expect(fixture.runRepository.update).toHaveBeenCalledWith(first.run.id, {
            idempotencyChannelId: null,
            idempotencyTriggerKeyHash: null,
            idempotencyKeyHash: null,
            idempotencyPayloadHash: null,
            idempotencyExpiresAt: null,
        });
        expect(fixture.runRepository.save).toHaveBeenCalledTimes(2);
        expect(fixture.eventBus.publish).toHaveBeenCalledTimes(2);
    });

    it('checks permissions before releasing an expired idempotency scope', async () => {
        const fixture = createFixture();
        const first = await fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            baseOptions,
        );
        first.run.idempotencyExpiresAt = new Date(0);
        fixture.executionPermissions.assertAllowed.mockRejectedValueOnce(
            new Error('Target channel permission denied'),
        );

        await expect(fixture.service.startIdempotentRunWithSeed(
            context,
            fixture.pipeline.id,
            [{ id: 42 }],
            { ...baseOptions, skipPermissionCheck: false },
        )).rejects.toThrow('Target channel permission denied');
        expect(fixture.runRepository.save).toHaveBeenCalledOnce();
        expect(first.run.idempotencyKeyHash).not.toBeNull();
        expect(fixture.eventBus.publish).toHaveBeenCalledOnce();
    });
});
