/**
 * Shopify Products Extractor (Demo)
 *
 * Generates mock Shopify-style product data for demonstrating
 * custom SDK adapters. In a real implementation, this would
 * connect to Shopify's GraphQL API.
 */
import { JsonObject, ExtractorAdapter, ExtractContext, RecordEnvelope, StepConfigSchema } from '../../../../src';

export const shopifyProductsSchema: StepConfigSchema = {
    fields: [
        { key: 'shopDomain', type: 'string', label: 'Shop Domain', required: true, placeholder: 'your-store.myshopify.com' },
        { key: 'apiVersion', type: 'string', label: 'API Version', required: false, defaultValue: '2024-01' },
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
        { key: 'limit', type: 'number', label: 'Max Products', required: false, defaultValue: 10 },
    ],
};

interface ShopifyProductsConfig {
    shopDomain: string;
    apiVersion?: string;
    productStatus?: 'active' | 'draft' | 'archived';
    limit?: number;
}

// Mock product data generator that mimics Shopify's GraphQL response structure
function generateMockShopifyProducts(config: ShopifyProductsConfig): JsonObject[] {
    const { productStatus = 'active', limit = 10 } = config;
    const products: JsonObject[] = [];

    const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
    const adjectives = ['Premium', 'Classic', 'Modern', 'Vintage', 'Professional'];
    const nouns = ['Widget', 'Gadget', 'Device', 'Tool', 'Accessory'];

    for (let i = 1; i <= limit; i++) {
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
                    inventoryQuantity: Math.floor(Math.random() * 100) + 1,
                    weight: (0.5 + Math.random() * 2).toFixed(2),
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
            createdAt: new Date(Date.now() - i * 86400000).toISOString(),
            updatedAt: new Date().toISOString(),
            publishedAt: productStatus === 'active' ? new Date().toISOString() : null,
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

export const shopifyProductsExtractor: ExtractorAdapter<ShopifyProductsConfig> = {
    type: 'EXTRACTOR',
    code: 'shopify-products',
    name: 'Shopify Products (Demo)',
    description: 'Extract products from Shopify GraphQL API (demo mode generates mock data)',
    category: 'DATA_SOURCE',
    schema: shopifyProductsSchema,
    icon: 'shopping-bag',
    version: '1.0.0',
    batchable: true,

    async *extract(context: ExtractContext, config: ShopifyProductsConfig): AsyncGenerator<RecordEnvelope, void, undefined> {
        const { shopDomain, apiVersion = '2024-01', productStatus = 'active', limit = 10 } = config;

        context.logger.info(`Shopify extractor: Fetching ${productStatus} products from ${shopDomain} (API ${apiVersion})`);
        context.logger.info(`[DEMO MODE] Generating ${limit} mock Shopify products`);

        // In a real implementation, this would call Shopify's GraphQL API:
        // const accessToken = await context.secrets.get('shopify-access-token');
        // const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {...});

        const products = generateMockShopifyProducts(config);

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

        context.logger.info(`Shopify extractor: Completed extracting ${products.length} products`);
    },
};
