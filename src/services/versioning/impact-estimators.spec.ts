import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { PipelineMetrics } from '../../types';
import { estimateDuration } from './impact-estimators';

describe('impact duration estimation', () => {
    it('loads historical runs only from the active channel', async () => {
        const find = vi.fn(async () => []);
        const connection = {
            getRepository: vi.fn(() => ({ find })),
        } as unknown as TransactionalConnection;
        const ctx = { channelId: 'channel-a' } as RequestContext;

        await estimateDuration(
            ctx,
            17,
            { totalRecords: 4 } as PipelineMetrics,
            connection,
        );

        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                pipelineId: 17,
                status: 'COMPLETED',
                channelId: 'channel-a',
            },
        }));
    });
});
