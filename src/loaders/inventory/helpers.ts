import { ID, RequestContext, StockLocationService } from '@vendure/core';
import { SortOrder } from '@vendure/common/lib/generated-types';
import { InventoryInput } from './types';
import { createChannelScopedCacheKey } from '../shared-helpers';

export { isRecoverableError, findVariantBySku } from '../shared-helpers';

export async function resolveStockLocationId(
    stockLocationService: StockLocationService,
    ctx: RequestContext,
    record: InventoryInput,
    cache: Map<string, ID>,
): Promise<ID | undefined> {
    if (record.stockLocationId) {
        const location = await stockLocationService.findOne(
            ctx,
            record.stockLocationId as ID,
        );
        if (!location) {
            throw new Error(`Stock location ID "${String(record.stockLocationId)}" was not found`);
        }
        return location.id;
    }

    if (record.stockLocationName) {
        const cacheKey = createChannelScopedCacheKey(ctx, record.stockLocationName);
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }

        const locations = await stockLocationService.findAll(ctx, {
            filter: { name: { eq: record.stockLocationName } },
        });

        if (locations.totalItems > 0) {
            const id = locations.items[0].id;
            cache.set(cacheKey, id);
            return id;
        }
        throw new Error(`Stock location "${record.stockLocationName}" was not found`);
    }

    return undefined;
}

export async function resolveDefaultStockLocationId(
    stockLocationService: StockLocationService,
    ctx: RequestContext,
): Promise<ID | undefined> {
    const locations = await stockLocationService.findAll(ctx, {
        take: 1,
        sort: { createdAt: SortOrder.ASC },
    });
    return locations.items[0]?.id;
}
