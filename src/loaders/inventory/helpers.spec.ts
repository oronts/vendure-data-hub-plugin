import type { RequestContext, StockLocationService } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import {
    resolveDefaultStockLocationId,
    resolveStockLocationId,
} from './helpers';

describe('resolveStockLocationId', () => {
    const ctx = { channelId: 'channel-a' } as RequestContext;

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

    it('leaves location selection to the caller when none is supplied', async () => {
        await expect(resolveStockLocationId(
            {} as StockLocationService,
            ctx,
            { sku: 'SKU-1', stockOnHand: 1 },
            new Map(),
        )).resolves.toBeUndefined();
    });

    it('isolates cached names between channels', async () => {
        const service = {
            findAll: vi.fn(async (requestCtx: RequestContext) => ({
                totalItems: 1,
                items: [{ id: `${String(requestCtx.channelId)}-location` }],
            })),
        } as unknown as StockLocationService;
        const cache = new Map();
        const record = {
            sku: 'SKU-1',
            stockOnHand: 1,
            stockLocationName: 'Warehouse',
        };

        await expect(resolveStockLocationId(
            service,
            { channelId: 'channel-a' } as RequestContext,
            record,
            cache,
        )).resolves.toBe('channel-a-location');
        await expect(resolveStockLocationId(
            service,
            { channelId: 'channel-b' } as RequestContext,
            record,
            cache,
        )).resolves.toBe('channel-b-location');
        expect(service.findAll).toHaveBeenCalledTimes(2);
    });

    it('selects the oldest location assigned to the active channel', async () => {
        const service = {
            findAll: vi.fn(async () => ({
                totalItems: 1,
                items: [{ id: 'channel-location' }],
            })),
            defaultStockLocation: vi.fn(),
        } as unknown as StockLocationService;

        await expect(resolveDefaultStockLocationId(service, ctx)).resolves.toBe(
            'channel-location',
        );
        expect(service.findAll).toHaveBeenCalledWith(ctx, {
            take: 1,
            sort: { createdAt: 'ASC' },
        });
        expect(service.defaultStockLocation).not.toHaveBeenCalled();
    });
});
