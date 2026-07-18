import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, RequestContextService } from '@vendure/core';
import { PipelineRun } from '../../entities/pipeline';
import {
    createPipelineRunContext,
    getPipelineRunChannel,
} from './pipeline-run-channel';

describe('pipeline run channel context', () => {
    it('captures the initiating channel ID and token', () => {
        const ctx = {
            channelId: 17,
            channel: { token: 'private-channel' },
        } as RequestContext;

        expect(getPipelineRunChannel(ctx)).toEqual({
            channelId: '17',
            channelToken: 'private-channel',
        });
    });

    it('rejects run creation without a complete active channel', () => {
        expect(() => getPipelineRunChannel({ channelId: 17 } as RequestContext))
            .toThrow('Pipeline execution requires an active Vendure channel');
    });

    it('restores the persisted channel by token', async () => {
        const resolved = { channelId: 17 } as RequestContext;
        const requestContextService = {
            create: vi.fn(async () => resolved),
        };
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            run,
        )).resolves.toBe(resolved);
        expect(requestContextService.create).toHaveBeenCalledWith({
            apiType: 'admin',
            channelOrToken: 'private-channel',
        });
    });

    it('rejects a token that resolves to a different channel', async () => {
        const requestContextService = {
            create: vi.fn(async () => ({ channelId: 23 } as RequestContext)),
        };
        const run = Object.assign(new PipelineRun(), {
            id: 42,
            channelId: '17',
            channelToken: 'private-channel',
        });

        await expect(createPipelineRunContext(
            requestContextService as unknown as RequestContextService,
            run,
        )).rejects.toThrow(
            'Pipeline run 42 channel mismatch: expected 17, resolved 23',
        );
    });
});
