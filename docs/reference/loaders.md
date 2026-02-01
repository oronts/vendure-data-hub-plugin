# Loaders Reference

Complete reference for all entity loaders (16 total).

## Common Configuration

All loaders are configured using the `.load()` step in the pipeline DSL:

```typescript
.load('step-name', {
    entityType: 'PRODUCT',          // Entity type (see list below)
    operation: 'UPSERT',            // CREATE, UPDATE, UPSERT, MERGE, DELETE
    lookupFields: ['slug'],         // Fields to match existing records
    options: { /* loader-specific */ },
})
```

### Entity Types

| Entity Type | Description |
|-------------|-------------|
| `PRODUCT` | Products with name, slug, description, facets, assets |
| `PRODUCT_VARIANT` | Product variants with SKU, prices, stock |
| `CUSTOMER` | Customers with email, addresses, groups |
| `CUSTOMER_GROUP` | Customer groups with member assignments |
| `ORDER` | Orders with line items and addresses |
| `COLLECTION` | Collections with parent relationships |
| `FACET` | Facets for product categorization |
| `FACET_VALUE` | Facet values within facets |
| `ASSET` | Assets and attachments to entities |
| `PROMOTION` | Promotions with conditions and actions |
| `SHIPPING_METHOD` | Shipping methods with calculators |
| `STOCK_LOCATION` | Stock locations for inventory |
| `INVENTORY` | Inventory levels by SKU and location |
| `TAX_RATE` | Tax rates by name with category and zone |
| `PAYMENT_METHOD` | Payment methods with handlers |
| `CHANNEL` | Channels with currencies and languages |

### Operations

| Operation | Description |
|----------|-------------|
| `CREATE` | Create only (skip if exists) |
| `UPDATE` | Update only (skip if not found) |
| `UPSERT` | Create or Update |
| `MERGE` | Merge source with existing data |
| `DELETE` | Delete matching records |

### Conflict Resolution

| Resolution | Description |
|------------|-------------|
| `source-wins` | Source data overwrites Vendure data for conflicts |
| `vendure-wins` | Vendure data is preserved for conflicts |
| `merge` | Deep merge source and Vendure data |

---

## Product Loader

Entity Type: `PRODUCT`

Create or update products with slug-based lookup, facets, and assets.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name for the product |
| `slug` | string | No | URL-friendly identifier (auto-generated if not provided) |
| `description` | string | No | Product description (HTML supported) |
| `enabled` | boolean | No | Whether the product is published |
| `facetValueCodes` | string[] | No | Array of facet value codes to assign |
| `assetUrls` | string[] | No | URLs of images to attach |
| `featuredAssetUrl` | string | No | URL of the featured/main image |
| `customFields` | object | No | Custom field values |

### Example

```typescript
.load('import-products', {
    entityType: 'PRODUCT',
    operation: 'UPSERT',
    lookupFields: ['slug'],
    options: {
        skipDuplicates: false,
        conflictResolution: 'source-wins',
    },
})
```

### Lookup Fields

Products are matched by: `slug`, `id`, or `customFields.externalId`

---

## Product Variant Loader

Entity Type: `PRODUCT_VARIANT`

Update product variants by SKU with multi-currency prices.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sku` | string | Yes | Product variant SKU |
| `name` | string | No | Variant name |
| `price` | number | No | Price in minor units (cents) |
| `prices` | object | No | Multi-currency prices `{ USD: 1999, EUR: 1799 }` |
| `taxCategoryName` | string | No | Tax category to assign |
| `stockOnHand` | number | No | Stock level |
| `enabled` | boolean | No | Whether variant is enabled |

### Example

```typescript
.load('import-variants', {
    entityType: 'PRODUCT_VARIANT',
    operation: 'UPDATE',
    lookupFields: ['sku'],
})
```

### Lookup Fields

Variants are matched by: `sku`

---

## Customer Loader

Entity Type: `CUSTOMER`

Create or update customers with addresses and group memberships.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `emailAddress` | string | Yes | Customer email address |
| `firstName` | string | No | First name |
| `lastName` | string | No | Last name |
| `phoneNumber` | string | No | Phone number |
| `addresses` | array | No | Array of address objects |
| `groupCodes` | string[] | No | Array of customer group codes |

### Example

```typescript
.load('import-customers', {
    entityType: 'CUSTOMER',
    operation: 'UPSERT',
    lookupFields: ['emailAddress'],
})
```

### Lookup Fields

Customers are matched by: `emailAddress`

---

## Collection Loader

Entity Type: `COLLECTION`

Create or update collections with parent relationships.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Collection name |
| `slug` | string | No | URL-friendly identifier |
| `description` | string | No | Collection description |
| `parentSlug` | string | No | Parent collection slug |
| `enabled` | boolean | No | Whether collection is visible |

### Example

```typescript
.load('import-collections', {
    entityType: 'COLLECTION',
    operation: 'UPSERT',
    lookupFields: ['slug'],
})
```

---

## Inventory Loader

Entity Type: `INVENTORY`

Update stock levels for product variants by SKU.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sku` | string | Yes | Product variant SKU |
| `stockOnHand` | number | Yes | Stock quantity |
| `stockLocationName` | string | No | Stock location name |
| `stockLocationId` | string | No | Stock location ID (alternative) |
| `reason` | string | No | Reason for adjustment |

### Example

```typescript
.load('update-stock', {
    entityType: 'INVENTORY',
    operation: 'UPDATE',
    lookupFields: ['sku'],
})
```

---

## Additional Loaders

The following loaders are available but have similar patterns:

### Order Loader (`ORDER`)
Create/update orders with line items and addresses.

### Customer Group Loader (`CUSTOMER_GROUP`)
Create/update customer groups with member assignments.

### Facet Loader (`FACET`)
Create/update facets for product categorization.

### Facet Value Loader (`FACET_VALUE`)
Create/update facet values within facets.

### Asset Loader (`ASSET`)
Create/update assets and attach to entities.

### Promotion Loader (`PROMOTION`)
Create/update promotions with conditions and actions.

### Shipping Method Loader (`SHIPPING_METHOD`)
Create/update shipping methods with calculators.

### Stock Location Loader (`STOCK_LOCATION`)
Create/update stock locations for inventory.

### Tax Rate Loader (`TAX_RATE`)
Create/update tax rates with category and zone.

### Payment Method Loader (`PAYMENT_METHOD`)
Create/update payment methods with handlers.

### Channel Loader (`CHANNEL`)
Create/update channels with currencies and languages.

---

## Using Sinks for External Systems

For sending data to external systems (REST APIs, search engines, message queues), use **Sinks** instead of loaders. See [Sinks Reference](./sinks.md) for details on:

- MeiliSearch, Elasticsearch, Algolia, Typesense (search indexing)
- RabbitMQ Queue Producer (message queuing)
- Webhook (REST API callbacks)

---

## Quick Reference

| Entity Type | Description |
|-------------|-------------|
| `PRODUCT` | Create/update products with name, slug, description, facets, assets |
| `PRODUCT_VARIANT` | Update variants by SKU with prices and stock |
| `CUSTOMER` | Create/update customers with addresses and groups |
| `CUSTOMER_GROUP` | Create/update customer groups with member assignments |
| `ORDER` | Create/update orders with line items |
| `COLLECTION` | Create/update collections with parent relationships |
| `FACET` | Create/update facets for product categorization |
| `FACET_VALUE` | Create/update facet values within facets |
| `ASSET` | Create/update assets and attach to entities |
| `PROMOTION` | Create/update promotions with conditions and actions |
| `SHIPPING_METHOD` | Create/update shipping methods with calculators |
| `STOCK_LOCATION` | Create/update stock locations for inventory |
| `INVENTORY` | Adjust inventory levels by SKU and stock location |
| `TAX_RATE` | Create/update tax rates with category and zone |
| `PAYMENT_METHOD` | Create/update payment methods with handlers |
| `CHANNEL` | Create/update channels with currencies and languages |

### Required Permissions

Each loader requires specific Vendure permissions:

| Entity Type | Required Permission |
|-------------|---------------------|
| `PRODUCT`, `PRODUCT_VARIANT`, `INVENTORY`, `COLLECTION`, `ASSET`, `FACET`, `FACET_VALUE` | `UpdateCatalog` |
| `CUSTOMER`, `CUSTOMER_GROUP` | `UpdateCustomer` |
| `ORDER` | `UpdateOrder` |
| `PROMOTION` | `UpdatePromotion` |
| `SHIPPING_METHOD`, `TAX_RATE`, `PAYMENT_METHOD`, `CHANNEL`, `STOCK_LOCATION` | `UpdateSettings` |
