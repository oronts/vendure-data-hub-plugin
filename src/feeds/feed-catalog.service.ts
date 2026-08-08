import { Injectable } from '@nestjs/common';
import { SortOrder } from '@vendure/common/lib/generated-types';
import {
    CollectionService,
    ID,
    ProductService,
    ProductVariantService,
    RequestContext,
} from '@vendure/core';
import { PAGINATION } from '../constants';
import { majorToMinorUnits } from '../utils/money.utils';
import type {
    FeedFilters,
    VariantWithCustomFields,
} from './generators/feed-types';

@Injectable()
export class FeedCatalogService {
    constructor(
        private readonly productVariantService: ProductVariantService,
        private readonly productService: ProductService,
        private readonly collectionService: CollectionService,
    ) {}

    async getFilteredVariants(
        ctx: RequestContext,
        filters: FeedFilters | undefined,
        moneyPrecision: number,
        includeVariants: boolean | undefined,
        maxItems?: number,
    ): Promise<VariantWithCustomFields[]> {
        const result: VariantWithCustomFields[] = [];
        const seenProductIds = new Set<string>();
        let skip = 0;

        while (maxItems === undefined || result.length < maxItems) {
            const take = Math.min(
                PAGINATION.FEED_QUERY_PAGE_SIZE,
                maxItems === undefined
                    ? PAGINATION.FEED_QUERY_PAGE_SIZE
                    : maxItems - result.length,
            );
            const page = await this.productVariantService.findAll(ctx, {
                skip,
                take,
                filter: filters?.enabled === false
                    ? undefined
                    : { enabled: { eq: true } },
                sort: { id: SortOrder.ASC },
            });
            if (page.items.length === 0) break;

            const variants = await this.hydrateVariants(ctx, page.items);
            for (const variant of variants) {
                if (!this.matchesFilters(variant, filters, moneyPrecision)) continue;
                const productId = String(variant.productId);
                if (includeVariants === false && seenProductIds.has(productId)) continue;
                seenProductIds.add(productId);
                result.push(variant);
                if (maxItems !== undefined && result.length >= maxItems) break;
            }

            skip += page.items.length;
            if (skip >= page.totalItems) break;
        }

        return result;
    }

    private async hydrateVariants(
        ctx: RequestContext,
        variants: ReadonlyArray<{ id: ID }>,
    ): Promise<VariantWithCustomFields[]> {
        const hydrated = await this.productVariantService.findByIds(
            ctx,
            variants.map(variant => variant.id),
        );
        const productIds = Array.from(new Set(
            hydrated.map(variant => String(variant.productId)),
        ));
        const products = await this.productService.findByIds(ctx, productIds, [
            'featuredAsset',
            'assets',
            'assets.asset',
            'facetValues',
            'facetValues.facet',
        ]);
        const productsById = new Map(await this.mapWithConcurrency(
            products,
            async product => {
                const collections = await this.collectionService.getCollectionsByProductId(
                    ctx,
                    product.id,
                    true,
                );
                return [String(product.id), Object.assign(product, {
                    feedCollections: collections.map(collection => ({
                        name: collection.name,
                        slug: collection.slug,
                    })),
                })] as const;
            },
        ));

        return this.mapWithConcurrency(hydrated, async variant => Object.assign(variant, {
            product: productsById.get(String(variant.productId)),
            saleableStockLevel: await this.productVariantService.getSaleableStockLevel(
                ctx,
                variant,
            ),
        }) as unknown as VariantWithCustomFields);
    }

    private async mapWithConcurrency<T, R>(
        items: readonly T[],
        operation: (item: T) => Promise<R>,
    ): Promise<R[]> {
        const results = new Array<R>(items.length);
        let nextIndex = 0;
        const workers = Array.from({
            length: Math.min(PAGINATION.FEED_HYDRATION_CONCURRENCY, items.length),
        }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                results[index] = await operation(items[index]);
            }
        });
        await Promise.all(workers);
        return results;
    }

    private matchesFilters(
        variant: VariantWithCustomFields,
        filters: FeedFilters | undefined,
        moneyPrecision: number,
    ): boolean {
        if (filters?.enabled !== false && (!variant.enabled || !variant.product?.enabled)) {
            return false;
        }
        if (filters?.inStock && (variant.saleableStockLevel ?? 0) <= 0) return false;
        if (filters?.hasPrice && variant.priceWithTax <= 0) return false;
        if (
            filters?.minPrice !== undefined
            && variant.priceWithTax < majorToMinorUnits(filters.minPrice, moneyPrecision)
        ) return false;
        if (
            filters?.maxPrice !== undefined
            && variant.priceWithTax > majorToMinorUnits(filters.maxPrice, moneyPrecision)
        ) return false;

        const productCollections = new Set(
            (variant.product as VariantWithCustomFields['product'] & {
                feedCollections?: Array<{ slug: string }>;
            } | undefined)?.feedCollections?.map(
                collection => collection.slug.toLowerCase(),
            ) ?? [],
        );
        const included = filters?.categories
            ?.map(slug => slug.trim().toLowerCase())
            .filter(Boolean);
        if (included?.length && !included.some(slug => productCollections.has(slug))) {
            return false;
        }
        const excluded = filters?.excludeCategories
            ?.map(slug => slug.trim().toLowerCase())
            .filter(Boolean);
        return !excluded?.some(slug => productCollections.has(slug));
    }
}
