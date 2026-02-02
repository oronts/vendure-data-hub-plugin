import { ID, RequestContext, FacetService } from '@vendure/core';
import { FacetValueInput } from './types';

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
    if (record.facetCode && cache.has(record.facetCode)) {
        return cache.get(record.facetCode)!;
    }

    // Look up by code
    if (record.facetCode) {
        const facets = await facetService.findAll(ctx, {
            filter: { code: { eq: record.facetCode } },
        });
        if (facets.totalItems > 0) {
            const facetId = facets.items[0].id;
            cache.set(record.facetCode, facetId);
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

