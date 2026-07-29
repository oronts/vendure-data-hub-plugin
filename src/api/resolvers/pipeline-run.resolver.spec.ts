import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DataHubPipelineAdminResolver } from './pipeline.resolver';

describe('DataHubPipelineAdminResolver run mutation', () => {
    it('forwards the revision observed by the client', async () => {
        const run = { id: 91 };
        const pipelineService = {
            startRun: vi.fn(async () => run),
        };
        const resolver = new DataHubPipelineAdminResolver(
            pipelineService as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
        const ctx = {} as RequestContext;

        await expect(resolver.startDataHubPipelineRun(ctx, {
            pipelineId: 3,
            expectedRevisionId: 17,
        })).resolves.toBe(run);

        expect(pipelineService.startRun).toHaveBeenCalledWith(ctx, 3, {
            expectedRevisionId: 17,
        });
    });
});
