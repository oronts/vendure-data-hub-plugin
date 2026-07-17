import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import { DataHubErrorAdminResolver } from './error.resolver';

function createRetryFixture(result: {
    success: boolean;
    outcome: string;
}) {
    const recordRetry = {
        retry: vi.fn().mockResolvedValue(result),
    };
    const resolver = new DataHubErrorAdminResolver(
        {} as never,
        recordRetry as never,
        {} as never,
        {} as never,
        { createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) } as never,
    );

    return { resolver, recordRetry };
}

describe('DataHubErrorAdminResolver retryDataHubRecord', () => {
    it('delegates the error ID and patch and returns the structured result', async () => {
        const result = { success: false, outcome: 'PATCH_REJECTED' };
        const fixture = createRetryFixture(result);
        const ctx = {
            userHasPermissions: vi.fn(() => true),
        } as never;
        const patch = { sku: 'SKU-2' };

        await expect(fixture.resolver.retryDataHubRecord(
            ctx,
            { errorId: 11, patch },
        )).resolves.toBe(result);

        expect(fixture.recordRetry.retry).toHaveBeenCalledWith(ctx, 11, patch);
    });

    it('uses an empty patch when none is supplied', async () => {
        const result = { success: true, outcome: 'APPLIED' };
        const fixture = createRetryFixture(result);
        const ctx = {
            userHasPermissions: vi.fn(() => false),
        } as never;

        await fixture.resolver.retryDataHubRecord(ctx, { errorId: 11 });

        expect(fixture.recordRetry.retry).toHaveBeenCalledWith(ctx, 11, {});
    });

    it('rejects a non-empty patch without quarantine edit permission', async () => {
        const fixture = createRetryFixture({ success: true, outcome: 'APPLIED' });
        const ctx = {
            userHasPermissions: vi.fn(() => false),
        } as never;

        await expect(fixture.resolver.retryDataHubRecord(
            ctx,
            { errorId: 11, patch: { sku: 'SKU-2' } },
        )).rejects.toBeInstanceOf(ForbiddenError);

        expect(fixture.recordRetry.retry).not.toHaveBeenCalled();
    });

    it('allows an empty patch without quarantine edit permission', async () => {
        const fixture = createRetryFixture({ success: true, outcome: 'APPLIED' });
        const ctx = {
            userHasPermissions: vi.fn(() => false),
        } as never;

        await fixture.resolver.retryDataHubRecord(ctx, { errorId: 11, patch: {} });

        expect(fixture.recordRetry.retry).toHaveBeenCalledWith(ctx, 11, {});
    });
});

describe('DataHubErrorAdminResolver masking policy failures', () => {
    function createMaskingFixture() {
        const recordErrors = {
            listByRun: vi.fn().mockResolvedValue({
                items: [{
                    id: 'error-1',
                    runId: 'run-1',
                    payload: { token: 'secret' },
                }],
                totalItems: 1,
                hasNextPage: false,
                endCursor: null,
            }),
            getById: vi.fn().mockResolvedValue({ id: 'error-1', runId: 'run-1' }),
        };
        const retryAudits = {
            listByError: vi.fn().mockResolvedValue([{
                id: 'audit-1',
                previousPayload: { token: 'before' },
                patch: { token: 'patch' },
                resultingPayload: { token: 'after' },
            }]),
        };
        const repository = {
            findOne: vi.fn().mockRejectedValue(new Error('policy database unavailable')),
        };
        const logger = { error: vi.fn(), warn: vi.fn() };
        const resolver = new DataHubErrorAdminResolver(
            recordErrors as never,
            {} as never,
            { getRepository: vi.fn(() => repository) } as never,
            retryAudits as never,
            { createLogger: vi.fn(() => logger) } as never,
        );
        return { resolver, logger };
    }

    it('withholds quarantined payloads when policy lookup fails', async () => {
        const fixture = createMaskingFixture();

        const rows = await fixture.resolver.dataHubRunErrors(
            {} as never,
            { runId: 'run-1' },
        );

        expect(rows.items[0].payload).toEqual({});
        expect(fixture.logger.error).toHaveBeenCalledOnce();
    });

    it('withholds all retry audit payloads when policy lookup fails', async () => {
        const fixture = createMaskingFixture();

        const rows = await fixture.resolver.dataHubRecordRetryAudits(
            {} as never,
            { errorId: 'error-1' },
        );

        expect(rows[0]).toEqual(expect.objectContaining({
            previousPayload: {},
            patch: {},
            resultingPayload: {},
        }));
        expect(fixture.logger.error).toHaveBeenCalledOnce();
    });
});

describe('DataHubErrorAdminResolver historical masking', () => {
    it('uses the immutable run snapshot when the current pipeline policy changes', async () => {
        const recordErrors = {
            listByRun: vi.fn().mockResolvedValue({
                items: [{
                    id: 'error-1',
                    runId: 'run-1',
                    payload: {
                        customer: {
                            email: 'private@example.com',
                            name: 'Visible Name',
                        },
                    },
                }],
                totalItems: 1,
                hasNextPage: false,
                endCursor: null,
            }),
        };
        const repository = {
            findOne: vi.fn().mockResolvedValue({
                id: 'run-1',
                definitionSnapshot: {
                    security: { maskFields: ['customer.email'] },
                },
                pipeline: {
                    definition: {
                        security: { maskFields: [] },
                    },
                },
            }),
        };
        const resolver = new DataHubErrorAdminResolver(
            recordErrors as never,
            {} as never,
            { getRepository: vi.fn(() => repository) } as never,
            {} as never,
            { createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) } as never,
        );

        const page = await resolver.dataHubRunErrors(
            {} as never,
            { runId: 'run-1' },
        );

        expect(page.items[0].payload).toEqual({
            customer: {
                email: '***',
                name: 'Visible Name',
            },
        });
    });
});
