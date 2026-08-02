import type { FacetService, RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { resolveFacetId } from './helpers';

describe('resolveFacetId', () => {
    it('isolates cached facet codes between channels', async () => {
        const service = {
            findAll: vi.fn(async (ctx: RequestContext) => ({
                totalItems: 1,
                items: [{ id: `${String(ctx.channelId)}-facet` }],
            })),
        } as unknown as FacetService;
        const cache = new Map();
        const record = {
            code: 'material-cotton',
            name: 'Cotton',
            facetCode: 'material',
        };

        await expect(resolveFacetId(
            { channelId: 'channel-a' } as RequestContext,
            service,
            record,
            cache,
        )).resolves.toBe('channel-a-facet');
        await expect(resolveFacetId(
            { channelId: 'channel-b' } as RequestContext,
            service,
            record,
            cache,
        )).resolves.toBe('channel-b-facet');
        expect(service.findAll).toHaveBeenCalledTimes(2);
    });
});
