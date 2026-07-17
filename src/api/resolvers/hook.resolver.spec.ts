import { describe, expect, it, vi } from 'vitest';
import { UserInputError } from '@vendure/core';
import { DataHubHookAdminResolver } from './hook.resolver';

function createFixture() {
    const result = {
        status: 'EXECUTED' as const,
        configured: 1,
        executed: 1,
        skipped: 0,
        failed: 0,
        errors: [],
    };
    const hooks = { run: vi.fn().mockResolvedValue(result) };
    const connection = {
        getEntityOrThrow: vi.fn().mockResolvedValue({
            id: 'pipeline-1',
            definition: {
                version: 1,
                steps: [],
                hooks: { ON_ERROR: [{ type: 'LOG', message: 'failed' }] },
            },
        }),
    };
    return {
        resolver: new DataHubHookAdminResolver(hooks as never, connection as never),
        hooks,
        result,
    };
}

describe('DataHubHookAdminResolver', () => {
    it('returns the structured hook execution result', async () => {
        const fixture = createFixture();
        const ctx = {} as never;

        await expect(fixture.resolver.runDataHubHookTest(ctx, {
            pipelineId: 'pipeline-1',
            stage: 'ON_ERROR',
            payload: { sku: 'SKU-1' },
        })).resolves.toEqual(fixture.result);

        expect(fixture.hooks.run).toHaveBeenCalledWith(
            ctx,
            expect.any(Object),
            'ON_ERROR',
            undefined,
            { sku: 'SKU-1' },
        );
    });

    it('rejects unsupported stages before executing actions', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.runDataHubHookTest({} as never, {
            pipelineId: 'pipeline-1',
            stage: 'UNKNOWN',
        })).rejects.toBeInstanceOf(UserInputError);
        expect(fixture.hooks.run).not.toHaveBeenCalled();
    });
});
