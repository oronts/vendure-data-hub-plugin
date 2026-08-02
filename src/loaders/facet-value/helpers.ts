import { ID, RequestContext, FacetService } from '@vendure/core';
import { FacetValueInput } from './types';
import { createChannelScopedCacheKey } from '../shared-helpers';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

export async function resolveFacetId(
    ctx: RequestContext,
    facetService: FacetService,
    record: FacetValueInput,
    cache: Map<string, ID>,
): Promise<ID | null> {
    // Try ID first
    if (record.facetId) {
        return record.facetId as ID;
    }

    // Check cache
    const cacheKey = record.facetCode
        ? createChannelScopedCacheKey(ctx, record.facetCode)
        : undefined;
    if (cacheKey && cache.has(cacheKey)) {
        return cache.get(cacheKey) ?? null;
    }

    // Look up by code
    if (record.facetCode) {
        const facets = await facetService.findAll(ctx, {
            filter: { code: { eq: record.facetCode } },
        });
        if (facets.totalItems > 0) {
            const facetId = facets.items[0].id;
            if (cacheKey) cache.set(cacheKey, facetId);
            return facetId;
        }
    }

    return null;
}

export async function resolveFacetIdFromCode(
    ctx: RequestContext,
    facetService: FacetService,
    facetCode?: string,
): Promise<ID | null> {
    if (!facetCode) return null;
    const facets = await facetService.findAll(ctx, {
        filter: { code: { eq: facetCode } },
    });
    return facets.totalItems > 0 ? facets.items[0].id : null;
}
