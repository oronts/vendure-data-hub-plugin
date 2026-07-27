# Custom Feed Generators

Create feed generators for custom product feed formats (marketplaces, advertising platforms, etc.).

> **Note:** This guide covers the `CustomFeedGenerator` interface for creating simple feed generators.
> For pipeline-integrated feeds, the system uses `FeedAdapter` internally with:
> - Built-in codes: `googleMerchant`, `metaCatalog`, `customFeed`
> - Supported formats: `xml`, `csv`, `tsv`, `json`

## Interface

```typescript
interface CustomFeedGenerator {
    code: string;
    name: string;
    description?: string;
    generate(context: FeedGeneratorContext): Promise<CustomFeedResult>;
}

interface FeedGeneratorContext {
    ctx: RequestContext;
    connection: TransactionalConnection;
    config: FeedConfig;
    products: VariantWithCustomFields[];
    moneyPrecision: number;
}

interface CustomFeedResult {
    content: string;
    contentType: string;
    fileExtension: string;
}

interface FeedConfig {
    code: string;
    name: string;
    format: FeedFormat;
    customGeneratorCode?: string;
    channelToken?: string;
    filters?: FeedFilters;
    fieldMappings?: Record<string, string | FeedFieldMapping>;
    options?: FeedOptions;
}

interface FeedOptions {
    includeVariants?: boolean;
    imageSize?: 'preview' | 'original';
    currency?: string;
    language?: string;
    baseUrl?: string;
    utmParams?: Record<string, string>;
}
```

## Basic Example

```typescript
import { CustomFeedGenerator, FeedGeneratorContext, CustomFeedResult, minorToMajorUnits } from '@oronts/vendure-data-hub-plugin';

export const myMarketplaceFeed: CustomFeedGenerator = {
    code: 'my-marketplace',
    name: 'My Marketplace Feed',
    description: 'Generate product feed for My Marketplace',

    async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
        const { products, config, moneyPrecision } = context;
        const baseUrl = config.options?.baseUrl;
        if (!baseUrl) throw new Error('baseUrl is required');

        const items = products.map(variant => ({
            sku: variant.sku,
            name: variant.name,
            price: minorToMajorUnits(variant.priceWithTax, moneyPrecision).toFixed(moneyPrecision),
            currency: config.options?.currency || 'USD',
            url: `${baseUrl}/products/${variant.product.slug}`,
            image: variant.featuredAsset?.preview || '',
            stock: variant.stockOnHand || 0,
            available: (variant.stockOnHand || 0) > 0,
        }));

        return {
            content: JSON.stringify(items, null, 2),
            contentType: 'application/json',
            fileExtension: 'json',
        };
    },
};
```

## Complete Example: Amazon Marketplace Feed

```typescript
import {
    CustomFeedGenerator,
    FeedGeneratorContext,
    CustomFeedResult,
    VariantWithCustomFields,
    minorToMajorUnits,
} from '@oronts/vendure-data-hub-plugin';

interface AmazonItem {
    item_sku: string;
    item_name: string;
    external_product_id: string;
    external_product_id_type: 'EAN' | 'UPC' | 'GTIN' | 'ISBN' | 'ASIN';
    brand_name: string;
    manufacturer: string;
    item_type: string;
    standard_price: string;
    currency: string;
    quantity: number;
    main_image_url: string;
    other_image_url1?: string;
    other_image_url2?: string;
    bullet_point1?: string;
    bullet_point2?: string;
    bullet_point3?: string;
    product_description: string;
    fulfillment_channel: 'DEFAULT' | 'AMAZON_NA';
    condition_type: 'New' | 'Refurbished' | 'UsedLikeNew' | 'UsedVeryGood' | 'UsedGood' | 'UsedAcceptable';
    parent_child?: 'Parent' | 'Child';
    parent_sku?: string;
    variation_theme?: string;
    color_name?: string;
    size_name?: string;
}

function mapVariantToAmazon(
    variant: VariantWithCustomFields,
    config: FeedGeneratorContext['config'],
    moneyPrecision: number,
): AmazonItem {
    const customFields = variant.customFields || {};
    const productCustomFields = variant.product?.customFields || {};
    const baseUrl = config.options?.baseUrl;
    if (!baseUrl) throw new Error('baseUrl is required');

    // Get images
    const images = [
        variant.featuredAsset?.preview,
        ...(variant.assets?.map(a => a.preview) || []),
    ].filter(Boolean);

    // Get bullet points from description or custom fields
    const bulletPoints = customFields.bulletPoints || [];

    return {
        item_sku: variant.sku,
        item_name: variant.name.substring(0, 200), // Amazon limit
        external_product_id: customFields.ean || customFields.upc || customFields.gtin || '',
        external_product_id_type: customFields.ean ? 'EAN' : customFields.upc ? 'UPC' : 'GTIN',
        brand_name: productCustomFields.brand || '',
        manufacturer: productCustomFields.manufacturer || productCustomFields.brand || '',
        item_type: productCustomFields.amazonCategory || 'Generic',
        standard_price: minorToMajorUnits(variant.priceWithTax, moneyPrecision).toFixed(moneyPrecision),
        currency: config.options?.currency || 'USD',
        quantity: variant.stockOnHand || 0,
        main_image_url: images[0] || '',
        other_image_url1: images[1],
        other_image_url2: images[2],
        bullet_point1: bulletPoints[0],
        bullet_point2: bulletPoints[1],
        bullet_point3: bulletPoints[2],
        product_description: variant.product?.description?.substring(0, 2000) || '',
        fulfillment_channel: customFields.fba ? 'AMAZON_NA' : 'DEFAULT',
        condition_type: 'New',
        parent_child: variant.options?.length > 0 ? 'Child' : undefined,
        parent_sku: variant.options?.length > 0 ? variant.product?.slug : undefined,
        variation_theme: getVariationTheme(variant),
        color_name: getOptionValue(variant, 'color'),
        size_name: getOptionValue(variant, 'size'),
    };
}

function getVariationTheme(variant: VariantWithCustomFields): string | undefined {
    const options = variant.options?.map(o => o.group?.code).filter(Boolean) || [];
    if (options.includes('color') && options.includes('size')) return 'SizeColor';
    if (options.includes('color')) return 'Color';
    if (options.includes('size')) return 'Size';
    return undefined;
}

function getOptionValue(variant: VariantWithCustomFields, optionCode: string): string | undefined {
    const option = variant.options?.find(o => o.group?.code === optionCode);
    return option?.name;
}

function generateTSV(items: AmazonItem[]): string {
    if (items.length === 0) return '';

    const headers = Object.keys(items[0]);
    const rows = items.map(item =>
        headers.map(h => {
            const value = (item as any)[h];
            if (value === undefined || value === null) return '';
            // Escape tabs and newlines
            return String(value).replace(/[\t\n\r]/g, ' ');
        }).join('\t')
    );

    return [headers.join('\t'), ...rows].join('\n');
}

export const amazonMarketplaceFeed: CustomFeedGenerator = {
    code: 'amazon-marketplace',
    name: 'Amazon Marketplace Feed',
    description: 'Generate TSV feed for Amazon Seller Central flat file upload',

    async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
        const { products, config, moneyPrecision } = context;

        // Filter products that have required Amazon fields
        const validProducts = products.filter(variant => {
            const customFields = variant.customFields || {};
            // Require at least EAN/UPC/GTIN
            return customFields.ean || customFields.upc || customFields.gtin;
        });

        const items = validProducts.map(variant => mapVariantToAmazon(variant, config, moneyPrecision));

        return {
            content: generateTSV(items),
            contentType: 'text/tab-separated-values',
            fileExtension: 'txt',
        };
    },
};
```

## Example: Pinterest Product Feed

```typescript
import {
    CustomFeedGenerator,
    FeedGeneratorContext,
    CustomFeedResult,
    VariantWithCustomFields,
    minorToMajorUnits,
} from '@oronts/vendure-data-hub-plugin';

interface PinterestItem {
    id: string;
    title: string;
    description: string;
    link: string;
    image_link: string;
    price: string;
    availability: 'in stock' | 'out of stock' | 'preorder';
    brand?: string;
    gtin?: string;
    mpn?: string;
    google_product_category?: string;
    product_type?: string;
    condition: 'new' | 'used' | 'refurbished';
    additional_image_link?: string[];
    sale_price?: string;
    item_group_id?: string;
    color?: string;
    size?: string;
    gender?: string;
    age_group?: string;
}

export const pinterestFeed: CustomFeedGenerator = {
    code: 'pinterest-catalog',
    name: 'Pinterest Product Catalog',
    description: 'Generate product feed for Pinterest Shopping',

    async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
        const { products, config, moneyPrecision } = context;
        const baseUrl = config.options?.baseUrl;
        if (!baseUrl) throw new Error('baseUrl is required');
        const currency = config.options?.currency || 'USD';

        const items: PinterestItem[] = products.map(variant => {
            const customFields = variant.customFields || {};
            const productCustomFields = variant.product?.customFields || {};

            // Get additional images
            const additionalImages = variant.assets
                ?.slice(1, 11) // Pinterest allows up to 10 additional images
                .map(a => a.preview)
                .filter(Boolean) || [];

            // Determine availability
            let availability: PinterestItem['availability'] = 'out of stock';
            if ((variant.stockOnHand || 0) > 0) {
                availability = 'in stock';
            } else if (customFields.allowBackorder) {
                availability = 'preorder';
            }

            return {
                id: variant.sku,
                title: variant.name,
                description: variant.product?.description || '',
                link: `${baseUrl}/products/${variant.product?.slug}?variant=${variant.id}`,
                image_link: variant.featuredAsset?.preview || '',
                price: `${minorToMajorUnits(variant.priceWithTax, moneyPrecision).toFixed(moneyPrecision)} ${currency}`,
                availability,
                brand: productCustomFields.brand,
                gtin: customFields.ean || customFields.gtin,
                mpn: customFields.mpn || variant.sku,
                google_product_category: productCustomFields.googleCategory,
                product_type: variant.product?.collections?.[0]?.name,
                condition: 'new',
                additional_image_link: additionalImages.length > 0 ? additionalImages : undefined,
                item_group_id: variant.product?.id?.toString(),
                color: variant.options?.find(o => o.group?.code === 'color')?.name,
                size: variant.options?.find(o => o.group?.code === 'size')?.name,
                gender: productCustomFields.gender,
                age_group: productCustomFields.ageGroup,
            };
        });

        // Generate XML RSS 2.0 format (Pinterest preferred)
        const xml = generatePinterestXML(items);

        return {
            content: xml,
            contentType: 'application/xml',
            fileExtension: 'xml',
        };
    },
};

function generatePinterestXML(items: PinterestItem[]): string {
    const escapeXml = (str: string | undefined) =>
        str ? str.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
        }[c] || c)) : '';

    const itemsXml = items.map(item => `
    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <g:title>${escapeXml(item.title)}</g:title>
      <g:description>${escapeXml(item.description)}</g:description>
      <g:link>${escapeXml(item.link)}</g:link>
      <g:image_link>${escapeXml(item.image_link)}</g:image_link>
      <g:price>${escapeXml(item.price)}</g:price>
      <g:availability>${item.availability}</g:availability>
      <g:condition>${item.condition}</g:condition>
      ${item.brand ? `<g:brand>${escapeXml(item.brand)}</g:brand>` : ''}
      ${item.gtin ? `<g:gtin>${escapeXml(item.gtin)}</g:gtin>` : ''}
      ${item.mpn ? `<g:mpn>${escapeXml(item.mpn)}</g:mpn>` : ''}
      ${item.google_product_category ? `<g:google_product_category>${escapeXml(item.google_product_category)}</g:google_product_category>` : ''}
      ${item.item_group_id ? `<g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>` : ''}
      ${item.color ? `<g:color>${escapeXml(item.color)}</g:color>` : ''}
      ${item.size ? `<g:size>${escapeXml(item.size)}</g:size>` : ''}
      ${(item.additional_image_link || []).map(img => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join('\n      ')}
    </item>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Product Catalog</title>
    <link></link>
    <description>Product feed for Pinterest</description>
${itemsXml}
  </channel>
</rss>`;
}
```

## Registration

### Via Plugin Options

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { amazonMarketplaceFeed } from './amazon-feed';
import { pinterestFeed } from './pinterest-feed';

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            feedGenerators: [
                amazonMarketplaceFeed,
                pinterestFeed,
            ],
        }),
    ],
};
```

### Programmatically

```typescript
import { OnModuleInit } from '@nestjs/common';
import { RequestContextService, VendurePlugin } from '@vendure/core';
import { DataHubPlugin, FeedGeneratorService } from '@oronts/vendure-data-hub-plugin';
import { amazonMarketplaceFeed } from './amazon-feed';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MyFeedsPlugin implements OnModuleInit {
    constructor(
        private feedService: FeedGeneratorService,
        private requestContextService: RequestContextService,
    ) {}

    async onModuleInit() {
        this.feedService.registerCustomGenerator(amazonMarketplaceFeed);
        const ctx = await this.requestContextService.create({
            apiType: 'admin',
            channelOrToken: 'us-channel',
        });
        const definition = {
            code: 'amazon-us',
            name: 'Amazon US Feed',
            format: 'CUSTOM',
            customGeneratorCode: 'amazon-marketplace',
            filters: { enabled: true, inStock: true },
            options: { currency: 'USD', baseUrl: 'https://mystore.com' },
        } as const;
        const existing = await this.feedService.getFeed(ctx, definition.code);
        if (existing) {
            await this.feedService.updateFeed(ctx, existing.id, definition);
        } else {
            await this.feedService.createFeed(ctx, definition);
        }
    }
}
```

## Using Custom Feeds

### Register Feed Configuration

```graphql
mutation CreateFeed($input: DataHubFeedInput!) {
  createDataHubFeed(input: $input) {
    id
    code
    customGeneratorCode
  }
}
```

Pass `format: CUSTOM` and the registered generator's code in
`customGeneratorCode`. The feed is persisted for the active Vendure channel.
`createDataHubFeed` rejects duplicate codes; use `updateDataHubFeed(id:, input:)`
for an explicit full-definition replacement and `deleteDataHubFeed(id:)` to
remove the definition and its current generated artifact. All lifecycle
operations require `ManageDataHubFeeds` and resolve IDs only inside the active
channel.

### Generate via GraphQL

```graphql
mutation {
  generateDataHubFeed(feedCode: "amazon-us") {
    success
    itemCount
    generatedAt
    downloadUrl
    errors
    warnings
  }
}
```

Generation stores the artifact through the configured Data Hub storage backend.
The returned URL uses the existing file download controller and requires
`ReadDataHubFiles`; feed lifecycle operations and generation require
`ManageDataHubFeeds`.

### Use in Pipeline

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const amazonFeedPipeline = createPipeline()
    .name('amazon-feed-export')
    .extract('products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',  // UPPERCASE entity names
        relations: ['product', 'product.customFields', 'featuredAsset', 'assets', 'options', 'options.group'],
    })
    .transform('filter-amazon', {
        adapterCode: 'when',
        conditions: [{ field: 'customFields.sellOnAmazon', cmp: 'eq', value: true }],
        action: 'keep',
    })
    .feed('generate-feed', {
        adapterCode: 'customFeed',
        generatorCode: 'amazon-marketplace',
        outputPath: 'feeds/amazon-${date}.txt',
        connectionCode: 's3-feeds', // Upload to S3
    })
    .trigger('schedule', {
        type: 'SCHEDULE',
        schedule: { cron: '0 6 * * *' }, // Daily at 6 AM
    })
    .build();
```

`outputPath` names the generated server-local file and must be relative to `DATA_HUB_EXPORT_ROOT`, for example `feeds/amazon-${date}.txt`. A configured remote connection does not make `outputPath` a URL or an absolute remote path; remote location fields belong to that destination's configuration.

## Feed Filters

Filter products before they reach the generator:

```typescript
const config: FeedConfig = {
    code: 'filtered-feed',
    name: 'Filtered Feed',
    format: 'CUSTOM',
    customGeneratorCode: 'my-feed',
    filters: {
        enabled: true,           // Only enabled products
        inStock: true,           // Only in-stock items
        hasPrice: true,          // Only items with price
        minPrice: 10,            // Minimum price in major currency units
        maxPrice: 1000,          // Maximum price in major currency units
        categories: ['electronics', 'accessories'], // Include collection slugs
        excludeCategories: ['clearance'],           // Exclude collection slugs
    },
};
```

Feed filters are declarative. Arbitrary JavaScript expressions are not accepted.
Prices and saleable stock are resolved through Vendure for the active channel,
currency, language, stock-location strategy, and out-of-stock thresholds before
these filters are applied.

## Field Mappings

Map Vendure fields to feed fields:

```typescript
const config: FeedConfig = {
    code: 'mapped-feed',
    name: 'Mapped Feed',
    format: 'custom',
    customGeneratorCode: 'my-feed',
    fieldMappings: {
        sku: 'variant.sku',
        name: 'variant.name',
        price: {
            source: 'variant.priceWithTax',
            default: 0,
        },
        brand: 'product.customFields.brand',
        url: 'product.slug',
    },
};
```

## Accessing Additional Data

The generator context provides access to:

```typescript
async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
    const { ctx, connection, config, products, moneyPrecision } = context;

    // Access database for additional queries
    const collections = await connection
        .getRepository(ctx, Collection)
        .find({ where: { isRoot: false } });

    // Access request context
    const channelId = ctx.channelId;
    const languageCode = ctx.languageCode;

    // Access feed configuration
    const currency = config.options?.currency;
    const baseUrl = config.options?.baseUrl;

    // Process products...
}
```

## Error Handling

Return errors and warnings in the feed result:

```typescript
async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const items = context.products.map(variant => {
        try {
            if (!variant.sku) {
                warnings.push(`Variant ${variant.id} missing SKU, skipped`);
                return null;
            }
            return mapVariant(variant);
        } catch (err) {
            errors.push(`Failed to process variant ${variant.id}: ${err.message}`);
            return null;
        }
    }).filter(Boolean);

    // Include errors in generated feed metadata
    const content = JSON.stringify({
        items,
        meta: {
            total: items.length,
            errors: errors.length,
            warnings: warnings.length,
        },
    });

    return { content, contentType: 'application/json', fileExtension: 'json' };
}
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { amazonMarketplaceFeed } from './amazon-feed';

describe('Amazon Marketplace Feed', () => {
    const mockContext = {
        ctx: {} as any,
        connection: {} as any,
        config: {
            code: 'test',
            name: 'Test',
            format: 'CUSTOM',
            options: { currency: 'USD', baseUrl: 'https://example.com' },
        },
        products: [
            {
                id: '1',
                sku: 'TEST-SKU',
                name: 'Test Product',
                priceWithTax: 1999,
                stockOnHand: 10,
                customFields: { ean: '1234567890123' },
                product: { slug: 'test-product', description: 'Test description' },
                featuredAsset: { preview: 'https://example.com/image.jpg' },
            },
        ],
    };

    it('should generate valid TSV', async () => {
        const result = await amazonMarketplaceFeed.generate(mockContext as any);

        expect(result.contentType).toBe('text/tab-separated-values');
        expect(result.fileExtension).toBe('txt');
        expect(result.content).toContain('item_sku');
        expect(result.content).toContain('TEST-SKU');
    });

    it('should filter products without EAN/UPC/GTIN', async () => {
        const contextWithoutEan = {
            ...mockContext,
            products: [{ ...mockContext.products[0], customFields: {} }],
        };

        const result = await amazonMarketplaceFeed.generate(contextWithoutEan as any);

        // Only header row, no data
        expect(result.content.split('\n').length).toBe(1);
    });
});
```
