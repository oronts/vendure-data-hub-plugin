import type {
    Product,
    ProductService,
    RequestContext,
} from '@vendure/core';
import { slugify } from '../shared-helpers';
import type { ProductVariantInput } from './types';

export interface ResolvedVariantProduct {
    readonly product: Product;
    readonly created: boolean;
}

export async function resolveVariantProduct(
    ctx: RequestContext,
    productService: ProductService,
    record: ProductVariantInput,
): Promise<ResolvedVariantProduct> {
    if (record.productId !== undefined) {
        const product = await productService.findOne(ctx, record.productId);
        if (!product) {
            throw new Error(`Product ID "${String(record.productId)}" was not found`);
        }
        return { product, created: false };
    }

    if (record.productSlug !== undefined) {
        const products = await productService.findAll(ctx, {
            filter: { slug: { eq: record.productSlug } },
            take: 1,
        });
        if (products.items[0]) {
            return { product: products.items[0], created: false };
        }
        if (!record.productName) {
            throw new Error(`Product slug "${record.productSlug}" was not found`);
        }
        return {
            product: await createProduct(
                ctx,
                productService,
                record.productName,
                record.productSlug,
            ),
            created: true,
        };
    }

    if (!record.productName) {
        throw new Error('A product ID, slug, or name is required');
    }

    const products = await productService.findAll(ctx, {
        filter: { name: { eq: record.productName } },
        take: 1,
    });
    if (products.items[0]) {
        return { product: products.items[0], created: false };
    }

    return {
        product: await createProduct(
            ctx,
            productService,
            record.productName,
            slugify(record.productName),
        ),
        created: true,
    };
}

async function createProduct(
    ctx: RequestContext,
    productService: ProductService,
    name: string,
    slug: string,
): Promise<Product> {
    return productService.create(ctx, {
        enabled: true,
        translations: [{
            languageCode: ctx.languageCode,
            name,
            slug,
            description: '',
        }],
    });
}
