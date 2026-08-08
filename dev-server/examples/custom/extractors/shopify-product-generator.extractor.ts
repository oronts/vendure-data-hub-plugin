/**
 * Deterministic Shopify-Shaped Product Generator
 *
 * Generates reproducible records for custom adapter demonstrations.
 */
import { CURRENT_ADAPTER_API_VERSION, JsonObject, ExtractorAdapter, ExtractContext, RecordEnvelope, StepConfigSchema } from '../../../../src';

export const shopifyProductGeneratorSchema: StepConfigSchema = {
    fields: [
        {
            key: 'productStatus',
            type: 'select',
            label: 'Product Status',
            required: false,
            defaultValue: 'active',
            options: [
                { value: 'active', label: 'Active' },
                { value: 'draft', label: 'Draft' },
                { value: 'archived', label: 'Archived' },
            ],
        },
        { key: 'limit', type: 'number', label: 'Max Products', required: false, defaultValue: 10, validation: { min: 1, max: 100 } },
    ],
};

interface ShopifyProductGeneratorConfig {
    productStatus?: 'active' | 'draft' | 'archived';
    limit?: number;
}

const DEFAULT_PRODUCT_LIMIT = 10;
const MAX_PRODUCT_LIMIT = 100;
const MILLISECONDS_PER_DAY = 86_400_000;
const REFERENCE_TIMESTAMP_MS = Date.parse('2024-01-01T00:00:00.000Z');

function generateShopifyShapedProducts(config: ShopifyProductGeneratorConfig): JsonObject[] {
    const { productStatus = 'active', limit = DEFAULT_PRODUCT_LIMIT } = config;
    const productCount = Number.isSafeInteger(limit)
        ? Math.min(Math.max(limit, 1), MAX_PRODUCT_LIMIT)
        : DEFAULT_PRODUCT_LIMIT;
    const products: JsonObject[] = [];

    const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
    const adjectives = ['Premium', 'Classic', 'Modern', 'Vintage', 'Professional'];
    const nouns = ['Widget', 'Gadget', 'Device', 'Tool', 'Accessory'];

    for (let i = 1; i <= productCount; i++) {
        const adj = adjectives[i % adjectives.length];
        const noun = nouns[i % nouns.length];
        const category = categories[i % categories.length];
        const title = `${adj} ${noun} ${i}`;
        const handle = title.toLowerCase().replace(/\s+/g, '-');

        // Generate 1-3 variants per product
        const variantCount = (i % 3) + 1;
        const variants: JsonObject[] = [];

        for (let v = 1; v <= variantCount; v++) {
            const variantTitle = variantCount > 1 ? `Variant ${v}` : 'Default';
            variants.push({
                node: {
                    id: `gid://shopify/ProductVariant/${i}${v}`,
                    sku: `SHOP-${i.toString().padStart(3, '0')}-${v}`,
                    title: variantTitle,
                    price: ((i * 10 + v * 5) + 0.99).toFixed(2),
                    compareAtPrice: ((i * 10 + v * 5) * 1.2 + 0.99).toFixed(2),
                    inventoryQuantity: ((i * 37 + v * 17) % 100) + 1,
                    weight: (0.5 + ((i * 7 + v * 3) % 20) / 10).toFixed(2),
                    weightUnit: 'KILOGRAMS',
                    barcode: `${1000000000 + i * 100 + v}`,
                },
            });
        }

        products.push({
            id: `gid://shopify/Product/${i}`,
            title,
            handle,
            status: productStatus.toUpperCase(),
            descriptionHtml: `<p>This is the description for ${title}. A high-quality ${noun.toLowerCase()} from our ${category.toLowerCase()} collection.</p>`,
            vendor: 'Demo Vendor',
            productType: category,
            tags: [category.toLowerCase(), adj.toLowerCase(), 'demo'],
            createdAt: new Date(REFERENCE_TIMESTAMP_MS - i * MILLISECONDS_PER_DAY).toISOString(),
            updatedAt: new Date(REFERENCE_TIMESTAMP_MS).toISOString(),
            publishedAt: productStatus === 'active' ? new Date(REFERENCE_TIMESTAMP_MS).toISOString() : null,
            images: {
                edges: [
                    {
                        node: {
                            id: `gid://shopify/ProductImage/${i}`,
                            url: `https://cdn.shopify.com/mock/products/${handle}.jpg`,
                            altText: title,
                        },
                    },
                ],
            },
            variants: {
                edges: variants,
            },
            seo: {
                title: title,
                description: `Shop ${title} - High quality ${noun.toLowerCase()} at great prices.`,
            },
        });
    }

    return products;
}

export const shopifyProductGeneratorExtractor: ExtractorAdapter<ShopifyProductGeneratorConfig> = {
    type: 'EXTRACTOR',
    code: 'shopify-product-generator',
    name: 'Shopify-Shaped Product Generator',
    description: 'Generate deterministic Shopify-shaped product records without network access',
    category: 'DATA_SOURCE',
    schema: shopifyProductGeneratorSchema,
    icon: 'shopping-bag',
    version: '1.1.0',
    apiVersion: CURRENT_ADAPTER_API_VERSION,
    batchable: true,

    async *extract(context: ExtractContext, config: ShopifyProductGeneratorConfig): AsyncGenerator<RecordEnvelope, void, undefined> {
        const products = generateShopifyShapedProducts(config);
        context.logger.info(`Generating ${products.length} deterministic Shopify-shaped products`);

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            yield {
                data: product,
                meta: {
                    sourceId: product.id as string,
                    sequence: i,
                    hash: `shopify-${product.id}`,
                },
            };
        }

        context.logger.info(`Generated ${products.length} Shopify-shaped products`);
    },
};
