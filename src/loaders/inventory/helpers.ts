import { ID, RequestContext, StockLocationService } from '@vendure/core';
import { InventoryInput } from './types';

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
        if (cache.has(record.stockLocationName)) {
            return cache.get(record.stockLocationName);
        }

        const locations = await stockLocationService.findAll(ctx, {
            filter: { name: { eq: record.stockLocationName } },
        });

        if (locations.totalItems > 0) {
            const id = locations.items[0].id;
            cache.set(record.stockLocationName, id);
            return id;
        }
        throw new Error(`Stock location "${record.stockLocationName}" was not found`);
    }

    return undefined;
}
