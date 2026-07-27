# Feed Generators Reference

Reference for the four built-in pipeline `FEED` step adapters. These handlers
consume records from the preceding pipeline step and write one server-local
file. This page does not describe the separate `FeedGeneratorService` API.

## Common Configuration

All four registry schemas expose these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | Relative file path under `DATA_HUB_EXPORT_ROOT` |
| `languageCode` | string | No | Flatten the matching object in the translations array before generating the feed; falls back to the first translation |
| `translationsField` | string | No | Record field containing translations (default: `translations`) |
| `channelCode` | string | No | Keep records whose `channels` array contains this channel code; records without a channels array remain included |

`outputPath` is relative to `DATA_HUB_EXPORT_ROOT`, which defaults to
`<cwd>/exports`. Absolute paths, URLs, `..` traversal, and symbolic-link escapes
are rejected. Pipeline feed handlers do not upload or serve the generated file.

### Commerce Feed Field Mappings

Google, Meta, and Amazon resolve input paths through these optional mappings.
Custom feeds use `fieldMapping` instead.

| Field | Default | Used by |
|-------|---------|---------|
| `titleField` | `name` | Google, Meta, Amazon |
| `descriptionField` | `description` | Google, Meta, Amazon |
| `priceField` | `price` | Google, Meta, Amazon |
| `priceUnit` | `MINOR` | Google, Meta, Amazon |
| `imageField` | `image` | Google, Meta, Amazon |
| `linkField` | `link` | Google, Meta |
| `brandField` | `brand` | Google, Meta, Amazon |
| `gtinField` | `gtin` | Google, Amazon |
| `availabilityField` | `availability` | Google, Meta |

`priceUnit: 'MINOR'` converts Vendure-style minor units before formatting. Use
`'MAJOR'` when the source already contains values such as `19.99`.

---

## Google Merchant Center

Code: `googleMerchant`

Generate product feeds for Google Merchant Center / Google Shopping.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | Relative file path under `DATA_HUB_EXPORT_ROOT` |
| `currency` | string | Yes | ISO currency code (e.g., USD) |
| `priceField` | string | No | Price field path (default: `price`) |
| `priceUnit` | select | No | `MINOR` for Vendure query values (default), or `MAJOR` for values such as `19.99` |
| `storeUrl` | string | Yes | URL written to the RSS channel link |
| `languageCode` | string | No | Translation language to flatten |
| `translationsField` | string | No | Translation array field (default: `translations`) |
| `channelCode` | string | No | Filter records by channel code |

The output is always XML RSS 2.0. The commerce mapping fields above are also
accepted. Missing mapped values become empty strings, except availability,
which defaults to `in stock`.

### Example

```typescript
.feed('google-feed', {
    adapterCode: 'googleMerchant',
    currency: 'USD',
    storeUrl: 'https://mystore.com',
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'priceWithTax',
    priceUnit: 'MINOR',
    imageField: 'featuredAsset.preview',
    linkField: 'customFields.storefrontUrl',
    brandField: 'customFields.brand',
    gtinField: 'customFields.gtin',
    availabilityField: 'customFields.availability',
    outputPath: 'feeds/google-shopping.xml',
})
```

### Output Format

The XML feed follows Google's RSS 2.0 specification:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Product Feed</title>
    <link>https://mystore.com</link>
    <description>Google Merchant Center Product Feed</description>
    <item>
      <g:id>SKU-001</g:id>
      <g:title>Product Name</g:title>
      <g:description>Product description</g:description>
      <g:link>https://mystore.com/product/slug</g:link>
      <g:image_link>https://mystore.com/assets/image.jpg</g:image_link>
      <g:price>29.99 USD</g:price>
      <g:brand>BrandName</g:brand>
      <g:gtin>0123456789012</g:gtin>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
    </item>
  </channel>
</rss>
```

The item ID is read from `id`, falling back to `sku`. There is no configurable
ID field for this handler.

---

## Meta Catalog (Facebook/Instagram)

Code: `metaCatalog`

Generate product catalogs for Meta Commerce (Facebook/Instagram).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | Relative file path under `DATA_HUB_EXPORT_ROOT` |
| `currency` | string | Yes | ISO currency code |
| `priceField` | string | No | Price field path (default: `price`) |
| `priceUnit` | select | No | `MINOR` for Vendure query values (default), or `MAJOR` for values such as `19.99` |
| `brandField` | string | No | Field path for brand |
| `languageCode` | string | No | Translation language to flatten |
| `translationsField` | string | No | Translation array field (default: `translations`) |
| `channelCode` | string | No | Filter records by channel code |

The output is always CSV. The commerce mapping fields above are also accepted.
The `condition` column is always `new`; missing availability defaults to
`in stock`.

### Example

```typescript
.feed('meta-catalog', {
    adapterCode: 'metaCatalog',
    currency: 'USD',
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'priceWithTax',
    priceUnit: 'MINOR',
    imageField: 'featuredAsset.preview',
    linkField: 'customFields.storefrontUrl',
    brandField: 'customFields.brand',
    availabilityField: 'customFields.availability',
    outputPath: 'feeds/facebook-catalog.csv',
})
```

### CSV Output Format

```csv
id,title,description,availability,condition,price,link,image_link,brand
SKU-001,Product Name,Description,in stock,new,29.99 USD,https://store.com/product,https://store.com/image.jpg,BrandName
```

The item ID is read from `id`, falling back to `sku`. There is no configurable
ID field for this handler.

---

## Amazon Seller Central

Code: `amazonFeed`

Generate the built-in Amazon inventory feed as tab-separated text.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | Relative file path under `DATA_HUB_EXPORT_ROOT`; use a `.txt` or `.tsv` extension |
| `currency` | string | Yes | Required by the current registry schema; the handler does not emit a currency column |
| `titleField` | string | No | Product title path (default: `name`) |
| `descriptionField` | string | No | Description path (default: `description`) |
| `priceField` | string | No | Price path (default: `price`) |
| `priceUnit` | select | No | `MINOR` by default, or `MAJOR` for already-decimal values |
| `imageField` | string | No | Main image URL path (default: `image`) |
| `brandField` | string | No | Brand path (default: `brand`) |
| `gtinField` | string | No | Product ID path (default: `gtin`) |
| `languageCode` | string | No | Translation language to flatten |
| `translationsField` | string | No | Translation array field (default: `translations`) |
| `channelCode` | string | No | Filter records by channel code |

The output is always TSV content and is written as text. SKU is read from `sku`,
falling back to `id`; quantity is read from `stockOnHand`, falling back to
`quantity` and then `0`. The `product-id-type` column is always `UPC`.

### Example

```typescript
.feed('amazon-inventory', {
    adapterCode: 'amazonFeed',
    currency: 'USD',
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'priceWithTax',
    priceUnit: 'MINOR',
    imageField: 'featuredAsset.preview',
    brandField: 'customFields.brand',
    gtinField: 'customFields.gtin',
    outputPath: 'feeds/amazon-inventory.txt',
})
```

### TSV Output Format

```text
sku	product-id	product-id-type	item-name	item-description	standard-price	quantity	main-image-url	brand-name
SKU-001	0123456789012	UPC	Product Name	Description	29.99	10	https://store.com/image.jpg	BrandName
```

---

## Custom Feed

Code: `customFeed`

Generate a locally written XML, CSV, JSON, or TSV file with explicit field
mapping.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | Relative file path under `DATA_HUB_EXPORT_ROOT` |
| `format` | select | Yes | `XML`, `CSV`, `JSON`, or `TSV` |
| `fieldMapping` | json | Yes | Map each output field name to a source record path |
| `languageCode` | string | No | Translation language to flatten before mapping |
| `translationsField` | string | No | Translation array field (default: `translations`) |
| `channelCode` | string | No | Filter records by channel code before mapping |

### Example - JSON Feed

```typescript
.feed('custom-json', {
    adapterCode: 'customFeed',
    format: 'JSON',
    fieldMapping: {
        id: 'sku',
        name: 'name',
        price: 'priceWithTax',
        stock: 'stockOnHand',
        image: 'featuredAsset.preview',
    },
    outputPath: 'feeds/products.json',
})
```

### Example - Custom XML

```typescript
.feed('custom-xml', {
    adapterCode: 'customFeed',
    format: 'XML',
    fieldMapping: {
        sku: 'sku',
        title: 'name',
        price: 'priceWithTax',
    },
    outputPath: 'feeds/catalog.xml',
})
```

Custom XML always uses `<feed>` as the root and `<item>` for each mapped record.
CSV and TSV include a header row. JSON is a formatted array of mapped objects.

### Field Mapping

The `fieldMapping` object maps output field names to source field paths:

```json
{
    "outputField": "source.path.to.value",
    "id": "sku",
    "name": "name",
    "price": "variants.0.priceWithTax",
    "brand": "customFields.brand"
}
```

Supports dot notation for nested values.

---

## Local Output Contract

Every built-in pipeline feed handler writes to the server-local export root:

```typescript
{
    outputPath: 'feeds/products.xml',
}
```

With the default configuration, this resolves to
`<cwd>/exports/feeds/products.xml`. The feed step returns the resolved path in
its execution result. It does not consume `connectionCode`, upload the file, or
register a feed download route.

---

## Feed Scheduling

Schedule automatic feed generation using pipeline triggers:

```typescript
const dailyGoogleFeed = createPipeline()
    .name('Daily Google Feed')
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',  // Daily at 2 AM
        timezone: 'Europe/Berlin',
    })
    .extract('query-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: ['product', 'product.translations', 'featuredAsset', 'productVariantPrices'],
        languageCode: 'en',
        batchSize: 500,
    })
    .feed('google-feed', {
        adapterCode: 'googleMerchant',
        currency: 'USD',
        storeUrl: 'https://mystore.com',
        titleField: 'name',
        descriptionField: 'product.description',
        priceField: 'priceWithTax',
        priceUnit: 'MINOR',
        imageField: 'featuredAsset.preview',
        linkField: 'customFields.storefrontUrl',
        brandField: 'product.customFields.brand',
        gtinField: 'customFields.gtin',
        availabilityField: 'customFields.availability',
        outputPath: 'feeds/google-shopping.xml',
    })
    .edge('schedule', 'query-variants')
    .edge('query-variants', 'google-feed')
    .build();
```
