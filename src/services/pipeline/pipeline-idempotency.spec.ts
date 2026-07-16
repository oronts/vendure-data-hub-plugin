import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { PipelineRunIdempotencyConflictError } from './pipeline-run-idempotency';
import { createPipelineServiceFixture as createFixture } from './pipeline.service.spec-fixture';

const context = { channelId: 1 } as RequestContext;
const baseOptions = {
    triggerKey: 'orders-webhook',
    skipPermissionCheck: true,
    triggeredBy: 'webhook:orders-webhook',
    idempotencyKey: 'request-42',
    idempotencyTtlSeconds: 3_600,
    requestFingerprint: 'payload-a',
} as const;

describe('PipelineService incoming idempotency', () => {
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
        expect(fixture.eventBus.publish).toHaveBeenCalledTimes(2);
    });
});
