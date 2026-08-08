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
    const hooks = { runTest: vi.fn().mockResolvedValue(result) };
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
    const registry = { find: vi.fn() };
    const ctx = { channelId: 'channel-a', userHasPermissions: vi.fn(() => true) };
    return {
        resolver: new DataHubHookAdminResolver(
            hooks as never,
            connection as never,
            registry as never,
        ),
        hooks,
        result,
        ctx,
        connection,
    };
}

describe('DataHubHookAdminResolver', () => {
    it('returns the structured hook execution result', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.runDataHubHookTest(fixture.ctx as never, {
            pipelineId: 'pipeline-1',
            stage: 'ON_ERROR',
            payload: { sku: 'SKU-1' },
        })).resolves.toEqual(fixture.result);

        expect(fixture.connection.getEntityOrThrow).toHaveBeenCalledWith(
            fixture.ctx,
            expect.any(Function),
            'pipeline-1',
            { channelId: 'channel-a' },
        );
        expect(fixture.hooks.runTest).toHaveBeenCalledWith(
            fixture.ctx,
            expect.any(Object),
            'ON_ERROR',
            { sku: 'SKU-1' },
            'pipeline-1',
        );
    });

    it('rejects secret-backed hooks without resource-use permission', async () => {
        const fixture = createFixture();
        fixture.ctx.userHasPermissions.mockReturnValue(false);
        fixture.connection.getEntityOrThrow.mockResolvedValue({
            id: 'pipeline-1',
            definition: {
                version: 1,
                steps: [],
                hooks: {
                    ON_ERROR: [{
                        type: 'WEBHOOK',
                        url: 'https://example.com/hook',
                        secretCode: 'hook-signing-key',
                    }],
                },
            },
        });

        await expect(fixture.resolver.runDataHubHookTest(fixture.ctx as never, {
            pipelineId: 'pipeline-1',
            stage: 'ON_ERROR',
        })).rejects.toThrow('UseDataHubSecret');
        expect(fixture.hooks.runTest).not.toHaveBeenCalled();
    });

    it('rejects unsupported stages before executing actions', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.runDataHubHookTest(fixture.ctx as never, {
            pipelineId: 'pipeline-1',
            stage: 'UNKNOWN',
        })).rejects.toBeInstanceOf(UserInputError);
        expect(fixture.hooks.runTest).not.toHaveBeenCalled();
    });
});
