import {
    RequestContext,
    ProductVariantService,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    TaxCategoryService,
    StockLocationService,
    ProductVariant,
    TaxCategory,
    StockLocation,
    ListQueryOptions,
    ID,
} from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { StockLevelInput } from '@vendure/common/lib/generated-types';
import { getErrorMessage } from '../../../utils/error.utils';

export interface LookupLogger {
    warn(message: string, context?: Record<string, unknown>): void;
}

export const noopLogger: LookupLogger = {
    warn: () => {},
};

export async function findVariantBySku(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    sku: string,
): Promise<ProductVariant | undefined> {
    const result = await productVariantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
    } as ListQueryOptions<ProductVariant>);
    return result.items[0];
}

export async function resolveTaxCategoryId(
    taxCategoryService: TaxCategoryService,
    ctx: RequestContext,
    name?: string | null,
    logger: LookupLogger = noopLogger,
): Promise<ID | undefined> {
    if (!name) return undefined;
    try {
        const list = await taxCategoryService.findAll(ctx, {
            filter: { name: { eq: name } },
            take: 1,
        } as ListQueryOptions<TaxCategory>);
        return list.items[0]?.id;
    } catch (error) {
        logger.warn('Failed to resolve tax category by name', {
            taxCategoryName: name,
            error: getErrorMessage(error),
        });
        return undefined;
    }
}

/**
 * Cache for option group and option lookups within a batch.
 * Per-product tracking because Vendure 3.x option groups are owned by a single product (ManyToOne).
 */
export interface OptionGroupCache {
    /** Per-product cache: productId → groupCode → { groupId, options: Map<optionCode, optionId> } */
    productGroups: Map<string, Map<string, { id: ID; options: Map<string, ID> }>>;
    /** Products whose existing option groups have been loaded from DB */
    loadedProducts: Set<string>;
    /** Flat option code→ID cache for resolveOptionCodes */
    optionsByCode: Map<string, ID>;
}

export function createOptionGroupCache(): OptionGroupCache {
    return { productGroups: new Map(), loadedProducts: new Set(), optionsByCode: new Map() };
}

/**
 * Slugify a string for use as an option/group code.
 */
function toOptionCode(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'unknown';
}

/**
 * Resolve option group→value pairs into Vendure option IDs.
 * Creates per-product option groups (Vendure 3.x: each group belongs to exactly one product via ManyToOne).
 * Loads existing groups from DB on first call per product for idempotent re-runs.
 */
export async function resolveOptionGroups(
    productOptionGroupService: ProductOptionGroupService,
    productOptionService: ProductOptionService,
    productService: ProductService,
    ctx: RequestContext,
    productId: ID,
    optionsMap: Record<string, string>,
    cache: OptionGroupCache,
    logger: LookupLogger = noopLogger,
): Promise<ID[]> {
    const optionIds: ID[] = [];
    const langCode = (ctx.languageCode ?? 'en') as LanguageCode;
    const productKey = String(productId);

    // 1. Load existing option groups for this product (once per product per batch)
    if (!cache.loadedProducts.has(productKey)) {
        try {
            const product = await productService.findOne(ctx, productId,
                ['optionGroups', 'optionGroups.options'] as never);
            if (product) {
                const groupMap = new Map<string, { id: ID; options: Map<string, ID> }>();
                const optionGroups = (product as unknown as {
                    optionGroups?: Array<{ id: ID; code: string; options?: Array<{ id: ID; code: string }> }>;
                }).optionGroups;
                if (Array.isArray(optionGroups)) {
                    for (const group of optionGroups) {
                        const options = new Map<string, ID>();
                        if (Array.isArray(group.options)) {
                            for (const opt of group.options) {
                                options.set(opt.code, opt.id);
                            }
                        }
                        groupMap.set(group.code, { id: group.id, options });
                    }
                }
                cache.productGroups.set(productKey, groupMap);
            }
        } catch (error) {
            logger.warn(`Failed to load existing option groups for product ${productId}`, {
                error: getErrorMessage(error),
            });
        }
        cache.loadedProducts.add(productKey);
    }

    // Ensure product has a map entry
    if (!cache.productGroups.has(productKey)) {
        cache.productGroups.set(productKey, new Map());
    }
    const groupMap = cache.productGroups.get(productKey)!;

    for (const [key, value] of Object.entries(optionsMap)) {
        if (!key || value == null || value === '') continue;

        const groupCode = toOptionCode(key);
        const optionCode = toOptionCode(String(value));

        try {
            // 2. Find or create the option group FOR THIS PRODUCT
            let groupEntry = groupMap.get(groupCode);
            if (!groupEntry) {
                // Create a NEW group for this product (Vendure 3.x: groups are per-product, not shared)
                const created = await productOptionGroupService.create(ctx, {
                    code: groupCode,
                    translations: [{ languageCode: langCode, name: key.charAt(0).toUpperCase() + key.slice(1) }],
                });
                await productService.addOptionGroupToProduct(ctx, productId, created.id);
                groupEntry = { id: created.id, options: new Map() };
                groupMap.set(groupCode, groupEntry);
            }

            // 3. Find or create the option within the group
            let optionId = groupEntry.options.get(optionCode);
            if (!optionId) {
                const allOptions = await productOptionService.findAll(ctx, {}, groupEntry.id);
                const existingOption = allOptions.items.find(o => o.code === optionCode);

                if (existingOption) {
                    optionId = existingOption.id;
                } else {
                    const createdOption = await productOptionService.create(ctx, groupEntry.id, {
                        code: optionCode,
                        translations: [{ languageCode: langCode, name: String(value) }],
                    });
                    optionId = createdOption.id;
                }
                groupEntry.options.set(optionCode, optionId);
            }

            optionIds.push(optionId);
        } catch (error) {
            logger.warn(`Failed to resolve option group "${key}": ${getErrorMessage(error)}`);
        }
    }

    return optionIds;
}

/**
 * Resolve option codes (e.g. ['size-s', 'color-blue']) to Vendure option IDs.
 * Looks up existing options by code. Uses flat cache for batch efficiency.
 */
export async function resolveOptionCodes(
    productOptionService: ProductOptionService,
    ctx: RequestContext,
    codes: string[],
    cache: OptionGroupCache,
    logger: LookupLogger = noopLogger,
): Promise<ID[]> {
    const optionIds: ID[] = [];

    for (const code of codes) {
        if (!code) continue;

        // Check flat code cache
        const cached = cache.optionsByCode.get(code);
        if (cached) {
            optionIds.push(cached);
            continue;
        }

        try {
            const result = await productOptionService.findAll(ctx, {
                filter: { code: { eq: code } },
                take: 1,
            } as never);

            if (result.items.length > 0) {
                const option = result.items[0];
                optionIds.push(option.id);
                cache.optionsByCode.set(code, option.id);
            } else {
                logger.warn(`Option code "${code}" not found — skipped`);
            }
        } catch (error) {
            logger.warn(`Failed to resolve option code "${code}": ${getErrorMessage(error)}`);
        }
    }

    return optionIds;
}

export async function resolveStockLevels(
    stockLocationService: StockLocationService,
    ctx: RequestContext,
    stockByLocation?: Record<string, number>,
    logger: LookupLogger = noopLogger,
): Promise<StockLevelInput[] | undefined> {
    if (!stockByLocation) return undefined;
    const locNames = Object.keys(stockByLocation);
    if (locNames.length === 0) return undefined;

    try {
        // Single query for all locations
        const list = await stockLocationService.findAll(ctx, {
            filter: { name: { in: locNames } },
        } as ListQueryOptions<StockLocation>);

        const locationMap = new Map(list.items.map(l => [l.name, l.id]));
        const result: StockLevelInput[] = [];

        for (const [name, qty] of Object.entries(stockByLocation)) {
            const locationId = locationMap.get(name);
            if (locationId) {
                result.push({ stockLocationId: locationId, stockOnHand: qty });
            }
        }
        return result.length > 0 ? result : undefined;
    } catch (error) {
        logger.warn('Failed to resolve stock locations', {
            locationNames: locNames,
            error: getErrorMessage(error),
        });
        return undefined;
    }
}
