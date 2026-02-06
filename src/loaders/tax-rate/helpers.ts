import { ID, RequestContext, TaxCategoryService, ZoneService, TaxCategory } from '@vendure/core';
import { TaxRateInput } from './types';

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
    // Try ID first
    if (record.taxCategoryId) {
        return record.taxCategoryId as ID;
    }

    // Check cache
    if (record.taxCategoryCode && cache.has(`tc:${record.taxCategoryCode}`)) {
        return cache.get(`tc:${record.taxCategoryCode}`) ?? null;
    }

    // Look up by code (name is used as code in Vendure for tax categories)
    if (record.taxCategoryCode) {
        const taxCategories = await taxCategoryService.findAll(ctx);
        // TaxCategoryService.findAll may return TaxCategory[] or PaginatedList
        const categoriesList = Array.isArray(taxCategories)
            ? taxCategories
            : (taxCategories as unknown as { items: TaxCategory[] }).items || [];
        const match = categoriesList.find(
            (tc: TaxCategory) => tc.name.toLowerCase() === record.taxCategoryCode?.toLowerCase()
        );
        if (match) {
            cache.set(`tc:${record.taxCategoryCode}`, match.id);
            return match.id;
        }
    }

    return null;
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
    // Try ID first
    if (record.zoneId) {
        return record.zoneId as ID;
    }

    // Check cache
    if (record.zoneCode && cache.has(`zone:${record.zoneCode}`)) {
        return cache.get(`zone:${record.zoneCode}`) ?? null;
    }

    // Look up by code (name is used as identifier for zones)
    if (record.zoneCode) {
        const zones = await zoneService.findAll(ctx);
        const match = zones.items.find(
            z => z.name.toLowerCase() === record.zoneCode?.toLowerCase()
        );
        if (match) {
            cache.set(`zone:${record.zoneCode}`, match.id);
            return match.id;
        }
    }

    return null;
}

