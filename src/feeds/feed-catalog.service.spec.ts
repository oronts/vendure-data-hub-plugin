import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { PAGINATION } from '../constants';
import { FeedCatalogService } from './feed-catalog.service';

describe('FeedCatalogService', () => {
    it('hydrates variants through Vendure services in stable catalog order', async () => {
        const ctx = {} as RequestContext;
        const variants = [
            { id: '1', productId: 'product-1', enabled: true, priceWithTax: 1_000 },
            { id: '2', productId: 'product-2', enabled: true, priceWithTax: 2_000 },
        ];
        const productVariantService = {
            findAll: vi.fn().mockResolvedValue({ items: variants, totalItems: 2 }),
            findByIds: vi.fn().mockResolvedValue(variants),
            getSaleableStockLevel: vi.fn().mockImplementation(
                async (_ctx: RequestContext, variant: { id: string }) => (
                    variant.id === '1' ? 3 : 7
                ),
            ),
        };
        const productService = {
            findByIds: vi.fn().mockResolvedValue([
                { id: 'product-1', enabled: true },
                { id: 'product-2', enabled: true },
            ]),
        };
        const collectionService = {
            getCollectionsByProductId: vi.fn().mockImplementation(
                async (_ctx: RequestContext, productId: string) => [{
                    name: `Collection ${productId}`,
                    slug: `collection-${productId}`,
                }],
            ),
        };
        const service = new FeedCatalogService(
            productVariantService as never,
            productService as never,
            collectionService as never,
        );

        const result = await service.getFilteredVariants(
            ctx,
            undefined,
            2,
            true,
        );

        expect(productVariantService.findAll).toHaveBeenCalledWith(ctx, {
            skip: 0,
            take: PAGINATION.FEED_QUERY_PAGE_SIZE,
            filter: { enabled: { eq: true } },
            sort: { id: 'ASC' },
        });
        expect(productVariantService.findByIds).toHaveBeenCalledWith(ctx, ['1', '2']);
        expect(productService.findByIds).toHaveBeenCalledWith(
            ctx,
            ['product-1', 'product-2'],
            ['featuredAsset', 'assets', 'assets.asset', 'facetValues', 'facetValues.facet'],
        );
        expect(collectionService.getCollectionsByProductId).toHaveBeenCalledTimes(2);
        expect(result).toEqual([
            expect.objectContaining({
                id: '1',
                saleableStockLevel: 3,
                product: expect.objectContaining({
                    id: 'product-1',
                    feedCollections: [{
                        name: 'Collection product-1',
                        slug: 'collection-product-1',
                    }],
                }),
            }),
            expect.objectContaining({
                id: '2',
                saleableStockLevel: 7,
                product: expect.objectContaining({ id: 'product-2' }),
            }),
        ]);
    });
});
