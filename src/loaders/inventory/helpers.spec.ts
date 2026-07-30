import type { RequestContext, StockLocationService } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { resolveStockLocationId } from './helpers';

describe('resolveStockLocationId', () => {
    const ctx = {} as RequestContext;

    it('rejects an unknown explicit location name', async () => {
        const service = {
            findAll: vi.fn(async () => ({ totalItems: 0, items: [] })),
        } as unknown as StockLocationService;

        await expect(resolveStockLocationId(
            service,
            ctx,
            { sku: 'SKU-1', stockOnHand: 1, stockLocationName: 'Missing' },
            new Map(),
        )).rejects.toThrow('Stock location "Missing" was not found');
    });

    it('rejects an unknown explicit location ID', async () => {
        const service = {
            findOne: vi.fn(async () => undefined),
        } as unknown as StockLocationService;

        await expect(resolveStockLocationId(
            service,
            ctx,
            { sku: 'SKU-1', stockOnHand: 1, stockLocationId: 'missing-id' },
            new Map(),
        )).rejects.toThrow('Stock location ID "missing-id" was not found');
    });

    it('leaves location selection to the Vendure default when none is supplied', async () => {
        await expect(resolveStockLocationId(
            {} as StockLocationService,
            ctx,
            { sku: 'SKU-1', stockOnHand: 1 },
            new Map(),
        )).resolves.toBeUndefined();
    });
});
