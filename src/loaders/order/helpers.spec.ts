import { describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import { handleOrderLines } from './helpers';

interface MockOrder {
    state: string;
    lines: Array<{ id?: number; quantity: number }>;
}

type MockMutationResult = { id: number } | { errorCode: string; message: string };

function createFixture(options: { missingSku?: string; state?: string } = {}) {
    const orderService = {
        findOne: vi.fn(async (): Promise<MockOrder> => ({
            state: options.state ?? 'AddingItems',
            lines: [],
        })),
        addItemToOrder: vi.fn(async (): Promise<MockMutationResult> => ({ id: 1 })),
        adjustOrderLine: vi.fn(async (): Promise<MockMutationResult> => ({ id: 1 })),
    };
    const productVariantService = {
        findAll: vi.fn(async (_ctx, query) => {
            const sku = query.filter.sku.eq as string;
            return options.missingSku === sku
                ? { totalItems: 0, items: [] }
                : { totalItems: 1, items: [{ id: `variant-${sku}`, sku }] };
        }),
    };
    const logger = { debug: vi.fn(), warn: vi.fn() } as unknown as DataHubLogger;
    return { orderService, productVariantService, logger };
}

describe('order line integrity', () => {
    it('rejects invalid quantities before mutating the order', async () => {
        const fixture = createFixture();
        await expect(handleOrderLines(
            {} as never,
            fixture.orderService as never,
            fixture.productVariantService as never,
            1,
            [{ sku: 'SKU-1', quantity: 0 }],
            'REPLACE_ALL',
            fixture.logger,
        )).rejects.toThrow('positive whole quantity');
        expect(fixture.orderService.addItemToOrder).not.toHaveBeenCalled();
        expect(fixture.orderService.adjustOrderLine).not.toHaveBeenCalled();
    });

    it('resolves every SKU before destructive replacement', async () => {
        const fixture = createFixture({ missingSku: 'MISSING' });
        fixture.orderService.findOne.mockResolvedValue({
            state: 'AddingItems',
            lines: [{ id: 9, quantity: 1 }],
        });
        await expect(handleOrderLines(
            {} as never,
            fixture.orderService as never,
            fixture.productVariantService as never,
            1,
            [{ sku: 'SKU-1', quantity: 1 }, { sku: 'MISSING', quantity: 1 }],
            'REPLACE_ALL',
            fixture.logger,
        )).rejects.toThrow('Variant with SKU "MISSING" was not found');
        expect(fixture.orderService.adjustOrderLine).not.toHaveBeenCalled();
        expect(fixture.orderService.addItemToOrder).not.toHaveBeenCalled();
    });

    it('rejects mutation in terminal order states', async () => {
        const fixture = createFixture({ state: 'Shipped' });
        await expect(handleOrderLines(
            {} as never,
            fixture.orderService as never,
            fixture.productVariantService as never,
            1,
            [{ sku: 'SKU-1', quantity: 1 }],
            'APPEND_ONLY',
            fixture.logger,
        )).rejects.toThrow('Cannot modify lines');
        expect(fixture.orderService.addItemToOrder).not.toHaveBeenCalled();
    });

    it('propagates Vendure mutation error results', async () => {
        const fixture = createFixture();
        fixture.orderService.addItemToOrder.mockResolvedValue({
            errorCode: 'ORDER_MODIFICATION_ERROR',
            message: 'Order cannot be modified',
        });
        await expect(handleOrderLines(
            {} as never,
            fixture.orderService as never,
            fixture.productVariantService as never,
            1,
            [{ sku: 'SKU-1', quantity: 1 }],
            'APPEND_ONLY',
            fixture.logger,
        )).rejects.toThrow('Order cannot be modified');
    });

    it('passes imported custom fields to Vendure order-line creation', async () => {
        const fixture = createFixture();
        const ctx = {} as never;

        await handleOrderLines(
            ctx,
            fixture.orderService as never,
            fixture.productVariantService as never,
            1,
            [{ sku: 'SKU-1', quantity: 2, customFields: { sourceId: 'line-1' } }],
            'APPEND_ONLY',
            fixture.logger,
        );

        expect(fixture.orderService.addItemToOrder).toHaveBeenCalledWith(
            ctx,
            1,
            'variant-SKU-1',
            2,
            { sourceId: 'line-1' },
        );
    });
});
