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
    relations: ['variants', 'featuredAsset', 'collections', 'translations'],
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
    format: 'XML',
    outputPath: 'feeds/google-shopping.xml',
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
Vendure query price fields are minor-unit integers, so built-in feeds default `priceUnit` to `MINOR` and format them with the configured Vendure `MoneyStrategy` precision. Set `priceUnit: 'MAJOR'` only for external records that already contain values such as `19.99`.

```typescript
.feed('google-feed', {
    adapterCode: 'googleMerchant',
    format: 'XML',
    outputPath: 'feeds/google.xml',

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
    format: 'CSV',  // or 'xml'
    outputPath: 'feeds/meta-catalog.csv',
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
    outputPath: 'feeds/amazon.txt',
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
    format: 'CSV',
    outputPath: 'feeds/products.csv',

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
    format: 'JSON',
    outputPath: 'feeds/products.json',
})
```

### XML Feed

```typescript
.feed('custom-xml', {
    adapterCode: 'customFeed',
    format: 'XML',
    outputPath: 'feeds/products.xml',
    rootElement: 'products',
    itemElement: 'product',
})
```

## Feed Output

### File Output

Save to the file system:

```typescript
outputPath: 'feeds/google.xml'
```

Files are written under `DATA_HUB_EXPORT_ROOT`, which defaults to `<cwd>/exports`; the example resolves to `<cwd>/exports/feeds/google.xml`. Feed files are not Vendure assets. Keep `outputPath` relative and use S3 or HTTP destination settings for remote delivery.

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
        type: 'SCHEDULE',
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

## Managed Feed Resources

The Admin API also exposes persisted feed resources. Unlike a pipeline `FEED`
step, a managed feed queries the active Vendure channel's product variants,
stores its current artifact through the Data Hub storage backend, and returns a
permissioned download URL.

```graphql
mutation CreateCatalogFeed {
  createDataHubFeed(input: {
    code: "google-catalog"
    name: "Google catalog"
    format: GOOGLE_SHOPPING
    options: {
      currency: "EUR"
      baseUrl: "https://shop.example.com"
    }
    schedule: {
      enabled: true
      cron: "0 4 * * *"
      timezone: "Europe/Berlin"
    }
  }) {
    id
    code
    schedule { enabled cron timezone }
  }
}
```

Feed codes are unique within a channel. The request's active channel is
authoritative; `channelToken` is accepted only when it matches that channel.
Every built-in format requires `options.baseUrl` so product, image, and feed
links use the real storefront origin. Data Hub rejects a missing or invalid URL
instead of publishing placeholder links. Custom generators may omit it when
their own output has no storefront URLs.
Schedules use standard five-field cron expressions and optional IANA timezone
names. Distributed locking prevents two instances from claiming the same feed
minute when a shared lock backend is configured.

Creation is strict: it rejects a code that already exists in the active
channel. Retrieve the feed ID from `dataHubFeeds` or `dataHubFeed(id: ...)`, then
replace its complete definition explicitly:

```graphql
mutation UpdateCatalogFeed($id: ID!) {
  updateDataHubFeed(id: $id, input: {
    code: "google-catalog"
    name: "Google catalog"
    format: GOOGLE_SHOPPING
    options: {
      currency: "EUR"
      baseUrl: "https://shop.example.com"
    }
    schedule: {
      enabled: true
      cron: "0 3 * * *"
      timezone: "Europe/Berlin"
    }
  }) {
    id
    updatedAt
    downloadUrl
  }
}
```

Any definition change invalidates and removes the previous generated artifact.
An identical full update is idempotent and preserves the current artifact.
Deleting the feed also removes its current artifact:

```graphql
mutation DeleteCatalogFeed($id: ID!) {
  deleteDataHubFeed(id: $id) {
    result
    message
  }
}
```

Generate and store the current artifact with:

```graphql
mutation GenerateCatalogFeed {
  generateDataHubFeed(feedCode: "google-catalog") {
    success
    itemCount
    generatedAt
    downloadUrl
    errors
    warnings
  }
}
```

The generated URL has the form `/data-hub/files/:id/download`. Generating a feed
requires `ManageDataHubFeeds`; downloading the artifact requires
`ReadDataHubFiles`. Regenerating replaces the current artifact, and changing the
feed definition invalidates the previous artifact.

### Preview limits

Dashboard previews request 20 items. The Admin API accepts an integer limit from
1 to 1,000 and defaults to 10. Preview queries apply the item limit before feed
rendering. The response always contains a complete feed document; content larger
than 1 MiB is rejected with a request to lower the item limit rather than being
returned as invalid truncated JSON, XML, or CSV.

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
