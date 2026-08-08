import { describe, expect, it, vi } from 'vitest';
import type { PipelineStepDefinition } from '../../../types';
import { StockAdjustHandler } from './inventory-handler';

function stockStep(absolute?: boolean): PipelineStepDefinition {
    return {
        key: 'adjust-stock',
        type: 'LOAD',
        config: {
            adapterCode: 'stockAdjust',
            skuField: 'sku',
            stockByLocationField: 'stockByLocation',
            ...(absolute === undefined ? {} : { absolute }),
        },
    } as PipelineStepDefinition;
}

function createFixture() {
    const productVariantService = {
        findAll: vi.fn().mockResolvedValue({ items: [{ id: 'variant-1' }] }),
    };
    const stockLocationService = {
        findAll: vi.fn().mockResolvedValue({ items: [{ id: 'location-1' }] }),
    };
    const stockLevelService = {
        getStockLevel: vi.fn().mockResolvedValue({ stockOnHand: 10 }),
    };
    const stockMovementService = {
        adjustProductVariantStock: vi.fn().mockResolvedValue([]),
    };
    const distributedLock = {
        withLock: vi.fn(async (_key: string, work: () => Promise<unknown>) => work()),
    };
    const handler = new StockAdjustHandler(
        productVariantService as never,
        stockLocationService as never,
        stockLevelService as never,
        stockMovementService as never,
        distributedLock as never,
    );

    return {
        distributedLock,
        handler,
        productVariantService,
        stockLevelService,
        stockLocationService,
        stockMovementService,
    };
}

const ctx = { channelId: 'channel-1' } as never;

describe('StockAdjustHandler', () => {
    it('uses absolute stock levels by default through Vendure stock movements', async () => {
        const fixture = createFixture();

        await expect(fixture.handler.execute(ctx, stockStep(), [{
            sku: 'SKU-1',
            stockByLocation: { Warehouse: 7 },
        }])).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });

        expect(fixture.stockMovementService.adjustProductVariantStock).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            [{ stockLocationId: 'location-1', stockOnHand: 7 }],
        );
        expect(fixture.distributedLock.withLock).not.toHaveBeenCalled();
    });

    it('serializes delta updates and derives their new absolute stock level', async () => {
        const fixture = createFixture();

        await expect(fixture.handler.execute(ctx, stockStep(false), [{
            sku: 'SKU-1',
            stockByLocation: { Warehouse: -3 },
        }])).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });

        expect(fixture.distributedLock.withLock).toHaveBeenCalledWith(
            'stock-adjust:channel-1:variant-1',
            expect.any(Function),
        );
        expect(fixture.stockLevelService.getStockLevel).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'location-1',
        );
        expect(fixture.stockMovementService.adjustProductVariantStock).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            [{ stockLocationId: 'location-1', stockOnHand: 7 }],
        );
    });

    it('rejects structured SKUs and non-integer quantities before Vendure lookup', async () => {
        const fixture = createFixture();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(fixture.handler.execute(ctx, stockStep(), [
            { sku: { value: 'SKU-1' }, stockByLocation: { Warehouse: 4 } },
            { sku: 'SKU-2', stockByLocation: { Warehouse: 1.5 } },
        ], onRecordError)).resolves.toEqual({ ok: 0, fail: 2, skipped: 0 });

        expect(fixture.productVariantService.findAll).not.toHaveBeenCalled();
        expect(fixture.stockMovementService.adjustProductVariantStock).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledTimes(2);
    });

    it('resolves every exact location name before applying any stock movement', async () => {
        const fixture = createFixture();
        fixture.stockLocationService.findAll
            .mockResolvedValueOnce({ items: [{ id: 'location-1' }] })
            .mockResolvedValueOnce({ items: [] });
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(fixture.handler.execute(ctx, stockStep(), [{
            sku: 'SKU-1',
            stockByLocation: { Warehouse: 7, Missing: 2 },
        }], onRecordError)).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });

        expect(fixture.stockMovementService.adjustProductVariantStock).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'adjust-stock',
            'Stock location name "Missing" was not found in the active channel',
            expect.anything(),
            expect.any(String),
        );
    });

    it('rejects negative absolute levels', async () => {
        const fixture = createFixture();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(fixture.handler.execute(ctx, stockStep(true), [{
            sku: 'SKU-1',
            stockByLocation: { Warehouse: -1 },
        }], onRecordError)).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });

        expect(fixture.stockMovementService.adjustProductVariantStock).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'adjust-stock',
            'Absolute stock levels must be non-negative',
            expect.anything(),
            expect.any(String),
        );
    });
});
