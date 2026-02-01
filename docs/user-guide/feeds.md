# Product Feeds

Generate product feeds for advertising platforms like Google, Meta, and Amazon.

## Overview

Product feeds export your catalog in formats required by advertising platforms:

- **Google Merchant Center** - Google Shopping ads
- **Meta/Facebook Catalog** - Facebook & Instagram ads
- **Amazon** - Amazon Product Ads
- **Custom** - Any platform with CSV/JSON/XML support

## Creating a Feed Pipeline

### Step 1: Extract Products

Start with a Vendure Query extractor to get product data:

```typescript
.extract('get-products', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',
    relations: 'variants,featuredAsset,collections,translations',
    languageCode: 'en',
    batchSize: 1000,
})
```

### Step 2: Transform Data

Map fields to feed format:

```typescript
.transform('prepare-feed', {
    operators: [
        { op: 'template', args: {
            template: 'https://mystore.com/products/${slug}',
            target: 'link',
        }},
        { op: 'template', args: {
            template: 'https://mystore.com${featuredAsset.preview}',
            target: 'image_link',
        }},
        { op: 'set', args: { path: 'condition', value: 'new' }},
        { op: 'copy', args: { source: 'variants.0.stockLevel', target: 'stockStatus' }},
        { op: 'lookup', args: {
            source: 'stockStatus',
            map: {
                'IN_STOCK': 'in_stock',
                'OUT_OF_STOCK': 'out_of_stock',
                'LOW_STOCK': 'in_stock',
            },
            target: 'availability',
            default: 'out_of_stock',
        }},
    ],
})
```

### Step 3: Generate Feed

Use the feed step to output the final file:

```typescript
.feed('generate-google-feed', {
    adapterCode: 'googleMerchant',
    format: 'xml',
    outputPath: '/feeds/google-shopping.xml',
    targetCountry: 'US',
    contentLanguage: 'en',
    currency: 'USD',
    storeUrl: 'https://mystore.com',
})
```

## Google Merchant Feed

### Required Fields

| Field | Source | Notes |
|-------|--------|-------|
| id | product.id or variant.sku | Unique identifier |
| title | name | Product title |
| description | description | Product description |
| link | Generated URL | Product page URL |
| image_link | featuredAsset.preview | Main product image |
| price | variant.price | Format: "29.99 USD" |
| availability | stock status | in_stock, out_of_stock |
| condition | Usually "new" | new, used, refurbished |

### Optional Fields

| Field | Source |
|-------|--------|
| brand | customFields.brand |
| gtin | customFields.gtin |
| mpn | variant.sku |
| google_product_category | Google taxonomy ID |
| product_type | collection path |
| item_group_id | product.id (for variants) |
| color, size, material | option values |
| shipping | shipping configuration |
| custom_label_0-4 | Custom segmentation |

### Full Configuration

```typescript
.feed('google-feed', {
    adapterCode: 'googleMerchant',
    format: 'xml',
    outputPath: '/feeds/google.xml',

    // Required settings
    targetCountry: 'US',
    contentLanguage: 'en',
    currency: 'USD',
    storeUrl: 'https://mystore.com',

    // Field mappings
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'variants.0.price',
    imageField: 'featuredAsset.preview',
    brandField: 'customFields.brand',
    gtinField: 'customFields.gtin',

    // Options
    includeOutOfStock: false,
})
```

## Meta/Facebook Catalog

### Required Fields

| Field | Source |
|-------|--------|
| id | unique identifier |
| title | product name |
| description | product description |
| availability | in stock, out of stock |
| condition | new, refurbished, used |
| price | formatted price |
| link | product URL |
| image_link | product image URL |

### Configuration

```typescript
.feed('meta-catalog', {
    adapterCode: 'metaCatalog',
    format: 'csv',  // or 'xml'
    outputPath: '/feeds/meta-catalog.csv',
    currency: 'USD',

    // Field mappings
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'variants.0.price',
    imageField: 'featuredAsset.preview',
    brandField: 'customFields.brand',

    // Options
    includeVariants: true,
})
```

### CSV Format

Meta accepts CSV with these headers:
```
id,title,description,availability,condition,price,link,image_link,brand
```

## Amazon Product Feed

### Configuration

```typescript
.feed('amazon-feed', {
    adapterCode: 'amazonFeed',
    outputPath: '/feeds/amazon.txt',
    currency: 'USD',

    // Field mappings
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'variants.0.price',
    imageField: 'featuredAsset.preview',
    brandField: 'customFields.brand',
    gtinField: 'customFields.gtin',
})
```

## Custom Feeds

Create feeds in any format for any platform.

### CSV Feed

```typescript
.feed('custom-csv', {
    adapterCode: 'customFeed',
    format: 'csv',
    outputPath: '/feeds/products.csv',

    fieldMapping: {
        'Product ID': 'id',
        'Product Name': 'name',
        'Price': 'variants.0.price',
        'Category': 'collections.0.name',
    },
})
```

### JSON Feed

```typescript
.feed('custom-json', {
    adapterCode: 'customFeed',
    format: 'json',
    outputPath: '/feeds/products.json',
})
```

### XML Feed

```typescript
.feed('custom-xml', {
    adapterCode: 'customFeed',
    format: 'xml',
    outputPath: '/feeds/products.xml',
    rootElement: 'products',
    itemElement: 'product',
})
```

## Feed Output

### File Output

Save to the file system:

```typescript
outputPath: '/feeds/google.xml'
```

Files are saved to the Vendure assets directory.

### S3 Output

Upload directly to S3:

```typescript
bucket: 'my-feeds-bucket',
prefix: 'google/',
connectionCode: 'aws-s3',
```

### HTTP Upload

POST the feed to an API:

```typescript
outputUrl: 'https://api.platform.com/feeds',
bearerTokenSecretCode: 'platform-api-key',
```

## Scheduling Feeds

Generate feeds on a schedule:

```typescript
const feedPipeline = createPipeline()
    .trigger('schedule', {
        type: 'schedule',
        cron: '0 4 * * *',  // Daily at 4 AM
    })
    .extract('get-products', { ... })
    .transform('prepare', { ... })
    .feed('generate', { ... })
    .edge('schedule', 'get-products')
    .edge('get-products', 'prepare')
    .edge('prepare', 'generate')
    .build();
```

## Filtering Products

### Include Only In-Stock

```typescript
includeOutOfStock: false
```

### Filter by Category

Add a filter step:

```typescript
.transform('filter-electronics', {
    operators: [
        { op: 'when', args: {
            conditions: [{ field: 'collections.0.name', cmp: 'contains', value: 'Electronics' }],
            action: 'keep',
        }},
    ],
})
```

### Custom Filters

```typescript
.transform('custom-filter', {
    operators: [
        { op: 'when', args: {
            conditions: [
                { field: 'variants.0.price', cmp: 'gte', value: 10 },
                { field: 'variants.0.stockLevel', cmp: 'ne', value: 'OUT_OF_STOCK' },
            ],
            action: 'keep',
        }},
    ],
})
```

## Best Practices

### Data Quality

- Include all required fields
- Use high-quality images (800x800 minimum)
- Write clear, accurate descriptions
- Keep prices accurate and up-to-date

### Performance

- Schedule feeds during off-peak hours
- Use incremental updates when possible
- Limit feed size (split large catalogs)

### Compliance

- Follow platform guidelines
- Include required tax and shipping info
- Update availability promptly
- Remove discontinued products

### Monitoring

- Check feed generation logs
- Monitor platform rejection rates
- Set up alerts for feed failures
