# Feed Generators Reference

Complete reference for all product feed generators.

## Common Configuration

All feed generators share these common options:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | File path or URL for output |
| `format` | string | Yes | Output format (xml, csv, json, tsv) |
| `channelId` | string | No | Vendure channel to use |

---

## Google Merchant Center

Code: `googleMerchant`

Generate product feeds for Google Merchant Center / Google Shopping.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | File path or URL |
| `format` | select | Yes | xml (RSS 2.0) or tsv |
| `targetCountry` | string | Yes | ISO country code (e.g., US) |
| `contentLanguage` | string | Yes | ISO language code (e.g., en) |
| `currency` | string | Yes | ISO currency code (e.g., USD) |
| `channelId` | string | No | Vendure channel to use |
| `includeOutOfStock` | boolean | No | Include out of stock items |
| `storeName` | string | No | Store name for feed |
| `storeUrl` | string | Yes | Base URL for product links |
| `shippingInfo` | json | No | Default shipping configuration |

### Example

```typescript
.feed('google-feed', {
    adapterCode: 'googleMerchant',
    format: 'XML',
    targetCountry: 'US',
    contentLanguage: 'en',
    currency: 'USD',
    storeUrl: 'https://mystore.com',
    storeName: 'My Store',
    includeOutOfStock: false,
    outputPath: '/feeds/google-shopping.xml',
})
```

### Output Format

The XML feed follows Google's RSS 2.0 specification:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>My Store Products</title>
    <link>https://mystore.com</link>
    <description>Product Feed</description>
    <item>
      <g:id>SKU-001</g:id>
      <g:title>Product Name</g:title>
      <g:description>Product description</g:description>
      <g:link>https://mystore.com/product/slug</g:link>
      <g:image_link>https://mystore.com/assets/image.jpg</g:image_link>
      <g:price>29.99 USD</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
    </item>
  </channel>
</rss>
```

### Required Product Fields

- `id` - Unique product identifier (SKU)
- `title` - Product name
- `link` - URL to product page
- `price` - Price with currency
- `availability` - Stock status

---

## Meta Catalog (Facebook/Instagram)

Code: `metaCatalog`

Generate product catalogs for Meta Commerce (Facebook/Instagram).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | File path or URL |
| `format` | select | Yes | csv or xml |
| `currency` | string | Yes | ISO currency code |
| `channelId` | string | No | Vendure channel to use |
| `brandField` | string | No | Field path for brand |
| `categoryField` | string | No | Field path for Google category |
| `includeVariants` | boolean | No | Include all variants |

### Example

```typescript
.feed('meta-catalog', {
    adapterCode: 'metaCatalog',
    format: 'CSV',
    currency: 'USD',
    brandField: 'customFields.brand',
    categoryField: 'customFields.googleCategory',
    includeVariants: true,
    outputPath: '/feeds/facebook-catalog.csv',
})
```

### CSV Output Format

```csv
id,title,description,availability,condition,price,link,image_link,brand
SKU-001,Product Name,Description,in stock,new,29.99 USD,https://store.com/product,https://store.com/image.jpg,BrandName
```

### Required Fields

- `id` - Unique identifier
- `title` - Product title
- `description` - Product description
- `availability` - in stock / out of stock
- `condition` - new / refurbished / used
- `price` - Price with currency
- `link` - Product URL
- `image_link` - Image URL

---

## Custom Feed

Code: `customFeed`

Generate custom product feeds with flexible field mapping and templates.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputPath` | string | Yes | File path or URL |
| `format` | select | Yes | xml, csv, json, or tsv |
| `template` | textarea | No | Handlebars template for rendering |
| `fieldMapping` | json | Yes | Map source to feed fields |
| `rootElement` | string | No | Root element name (XML) |
| `itemElement` | string | No | Item element name (XML) |
| `connectionCode` | string | No | Connection for file upload |

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
    outputPath: '/feeds/products.json',
})
```

### Example - Custom XML

```typescript
.feed('custom-xml', {
    adapterCode: 'customFeed',
    format: 'XML',
    rootElement: 'catalog',
    itemElement: 'product',
    fieldMapping: {
        sku: 'sku',
        title: 'name',
        price: 'priceWithTax',
    },
    outputPath: '/feeds/catalog.xml',
})
```

### Example - With Template

```typescript
.feed('templated-feed', {
    adapterCode: 'customFeed',
    format: 'CSV',
    template: '{{sku}},{{name}},{{#if inStock}}Available{{else}}Out of Stock{{/if}}',
    outputPath: '/feeds/custom.csv',
})
```

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

## Feed Output Options

### File Output

Feeds can be written to local filesystem:

```typescript
{
    outputPath: '/var/www/feeds/products.xml',
}
```

### Upload to Remote

Use a connection to upload feed files:

```typescript
{
    outputPath: 'products.xml',
    connectionCode: 'sftp-server',
}
```

### Serve via HTTP

Feeds can be served through Data Hub's feed endpoint:

```
GET /data-hub/feeds/{feed-code}
```

---

## Feed Scheduling

Schedule automatic feed generation using pipeline triggers:

```typescript
createPipeline()
    .name('daily-google-feed')
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',  // Daily at 2 AM
    })
    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,translations',
        languageCode: 'en',
        batchSize: 500,
    })
    .transform('prepare-feed', {
        operators: [
            { op: 'set', args: { path: 'availability', value: 'in_stock' } },
        ],
    })
    .feed('google-feed', {
        adapterCode: 'googleMerchant',
        format: 'XML',
        targetCountry: 'US',
        contentLanguage: 'en',
        currency: 'USD',
        storeUrl: 'https://mystore.com',
        outputPath: '/feeds/google-shopping.xml',
    })
```

---

## Feed Filters

Filter products included in feeds:

```typescript
{
    filters: {
        enabled: true,       // Only enabled products
        inStock: true,       // Only in-stock items
        hasPrice: true,      // Only priced items
        minPrice: 10,        // Minimum price
        maxPrice: 1000,      // Maximum price
    }
}
```
