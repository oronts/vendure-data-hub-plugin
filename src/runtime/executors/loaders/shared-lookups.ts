import {
    RequestContext,
    ProductVariantService,
    TaxCategoryService,
    StockLocationService,
    ProductVariant,
    TaxCategory,
    StockLocation,
    ListQueryOptions,
    ID,
} from '@vendure/core';
import { StockLevelInput } from '@vendure/common/lib/generated-types';

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
            error: (error as Error)?.message,
        });
        return undefined;
    }
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
            error: (error as Error)?.message,
        });
        return undefined;
    }
}
