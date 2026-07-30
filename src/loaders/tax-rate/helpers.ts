import { ID, RequestContext, TaxCategoryService, ZoneService } from '@vendure/core';
import { TaxRateInput } from './types';
import { resolveEntityReferenceId } from '../entity-reference.helpers';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

/**
 * Resolve tax category ID from code or direct ID
 */
export async function resolveTaxCategoryId(
    ctx: RequestContext,
    taxCategoryService: TaxCategoryService,
    record: TaxRateInput,
    cache: Map<string, ID>,
): Promise<ID | null> {
    const cacheKey = record.taxCategoryId !== undefined
        ? `tc:id:${String(record.taxCategoryId)}`
        : record.taxCategoryCode !== undefined
            ? `tc:code:${record.taxCategoryCode}`
            : undefined;
    if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const id = await resolveEntityReferenceId(
        ctx,
        taxCategoryService,
        'Tax category',
        {
            id: record.taxCategoryId as ID | undefined,
            code: record.taxCategoryCode,
        },
    );
    if (cacheKey && id !== null) cache.set(cacheKey, id);
    return id;
}

/**
 * Resolve zone ID from code or direct ID
 */
export async function resolveZoneId(
    ctx: RequestContext,
    zoneService: ZoneService,
    record: TaxRateInput,
    cache: Map<string, ID>,
): Promise<ID | null> {
    const cacheKey = record.zoneId !== undefined
        ? `zone:id:${String(record.zoneId)}`
        : record.zoneCode !== undefined
            ? `zone:code:${record.zoneCode}`
            : undefined;
    if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const id = await resolveEntityReferenceId(
        ctx,
        zoneService,
        'Zone',
        {
            id: record.zoneId as ID | undefined,
            code: record.zoneCode,
        },
    );
    if (cacheKey && id !== null) cache.set(cacheKey, id);
    return id;
}
