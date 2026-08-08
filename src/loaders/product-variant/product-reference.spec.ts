import type { ProductService, RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { resolveVariantProduct } from './product-reference';

const ctx = {
    languageCode: 'en',
} as unknown as RequestContext;

function createProductService() {
    return {
        findOne: vi.fn(),
        findAll: vi.fn(async (): Promise<{
            items: Array<{ id: string; name: string }>;
            totalItems: number;
        }> => ({ items: [], totalItems: 0 })),
        create: vi.fn(async (_ctx, input) => ({
            id: 'product-new',
            name: input.translations[0].name,
        })),
    };
}

describe('product variant parent resolution', () => {
    it('fails closed when an explicit product ID is missing', async () => {
        const service = createProductService();
        service.findOne.mockResolvedValue(undefined);

        await expect(resolveVariantProduct(ctx, service as unknown as ProductService, {
            sku: 'SKU-1',
            price: 10,
            productId: 'missing',
            productName: 'Fallback',
        })).rejects.toThrow('Product ID "missing" was not found');
        expect(service.findAll).not.toHaveBeenCalled();
        expect(service.create).not.toHaveBeenCalled();
    });

    it('requires product data before creating a missing slug reference', async () => {
        const service = createProductService();

        await expect(resolveVariantProduct(ctx, service as unknown as ProductService, {
            sku: 'SKU-1',
            price: 10,
            productSlug: 'missing-product',
        })).rejects.toThrow('Product slug "missing-product" was not found');
        expect(service.create).not.toHaveBeenCalled();
    });

    it('preserves an explicit slug when product data authorizes creation', async () => {
        const service = createProductService();

        await expect(resolveVariantProduct(ctx, service as unknown as ProductService, {
            sku: 'SKU-1',
            price: 10,
            productSlug: 'source-product',
            productName: 'Source Product',
        })).resolves.toEqual({
            product: { id: 'product-new', name: 'Source Product' },
            created: true,
        });
        expect(service.create).toHaveBeenCalledWith(ctx, {
            enabled: true,
            translations: [{
                languageCode: 'en',
                name: 'Source Product',
                slug: 'source-product',
                description: '',
            }],
        });
    });

    it('reuses the channel-visible product matching an exact name', async () => {
        const service = createProductService();
        service.findAll.mockResolvedValue({
            items: [{ id: 'product-1', name: 'Existing Product' }],
            totalItems: 1,
        });

        await expect(resolveVariantProduct(ctx, service as unknown as ProductService, {
            sku: 'SKU-1',
            price: 10,
            productName: 'Existing Product',
        })).resolves.toEqual({
            product: { id: 'product-1', name: 'Existing Product' },
            created: false,
        });
        expect(service.create).not.toHaveBeenCalled();
    });
});
