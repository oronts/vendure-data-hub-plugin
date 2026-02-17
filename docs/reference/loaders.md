# Loaders Reference

Complete reference for all entity loaders (20 total).

## Common Configuration

All loaders are configured using the `.load()` step in the pipeline DSL:

```typescript
.load('step-name', {
    adapterCode: 'productUpsert',   // Loader adapter code (see list below)
    strategy: 'UPSERT',             // CREATE, UPDATE, UPSERT, MERGE, SOFT_DELETE, HARD_DELETE
    matchField: 'slug',             // Field to match existing records
    conflictStrategy: 'SOURCE_WINS', // Conflict resolution strategy (optional)
})
```

### Loader Adapter Codes

| Adapter Code | Entity Type | Description |
|--------------|-------------|-------------|
| `productUpsert` | Product | Products with name, slug, description, facets, assets |
| `variantUpsert` | Product Variant | Product variants with SKU, prices, stock |
| `customerUpsert` | Customer | Customers with email, addresses, groups |
| `collectionUpsert` | Collection | Collections with parent relationships |
| `facetUpsert` | Facet | Facets for product categorization |
| `facetValueUpsert` | Facet Value | Facet values within facets |
| `assetImport` | Asset | Import assets from URLs |
| `assetAttach` | Asset | Attach existing assets to entities |
| `promotionUpsert` | Promotion | Promotions with conditions and actions |
| `stockAdjust` | Inventory | Adjust stock levels by SKU and location |
| `orderNote` | Order | Add notes to orders |
| `orderTransition` | Order | Transition order states |
| `applyCoupon` | Order | Apply coupon codes to orders |
| `taxRateUpsert` | Tax Rate | Tax rates with zone and category mappings |
| `paymentMethodUpsert` | Payment Method | Payment methods with handler configuration |
| `channelUpsert` | Channel | Channels with currency and language settings |
| `restPost` | Custom | POST data to REST endpoints |
| `graphqlMutation` | GraphQL | Send records as GraphQL mutations to external APIs |

### Load Strategies

| Strategy | Description |
|----------|-------------|
| `CREATE` | Create only (skip if exists) |
| `UPDATE` | Update only (skip if not found) |
| `UPSERT` | Create or Update (default) |
| `MERGE` | Merge source with existing data |
| `SOFT_DELETE` | Mark as deleted / logical delete |
| `HARD_DELETE` | Permanently remove from database |

### Conflict Strategies

| Strategy | Description |
|----------|-------------|
| `SOURCE_WINS` | Source data overwrites Vendure data for conflicts |
| `VENDURE_WINS` | Vendure data is preserved for conflicts |
| `MERGE` | Deep merge source and Vendure data |
| `MANUAL_QUEUE` | Queue conflicts for manual resolution |

---

## Product Loader

Adapter Code: `productUpsert`

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
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    matchField: 'slug',
    conflictStrategy: 'SOURCE_WINS',
})
```

### Match Fields

Products can be matched by: `slug`, `id`, or `customFields.externalId`

---

## Product Variant Loader

Adapter Code: `variantUpsert`

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
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',
    matchField: 'sku',
})
```

### Match Fields

Variants can be matched by: `sku`

---

## Customer Loader

Adapter Code: `customerUpsert`

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
    adapterCode: 'customerUpsert',
    strategy: 'UPSERT',
    matchField: 'emailAddress',
})
```

### Match Fields

Customers can be matched by: `emailAddress`

---

## Collection Loader

Adapter Code: `collectionUpsert`

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
    adapterCode: 'collectionUpsert',
    strategy: 'UPSERT',
    matchField: 'slug',
})
```

---

## Inventory Loader

Adapter Code: `stockAdjust`

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
    adapterCode: 'stockAdjust',
    strategy: 'UPDATE',
    matchField: 'sku',
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

## GraphQL Mutation Loader

Adapter Code: `graphqlMutation`

Send records as GraphQL mutations to external APIs. Supports variable mapping, authentication, batch mode, retry with exponential backoff, and circuit breaker.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | GraphQL endpoint URL |
| `mutation` | string | Yes | GraphQL mutation string |
| `variableMapping` | object | No | Map record fields to mutation variables (e.g., `{ "input.name": "name", "input.sku": "sku" }`) |
| `headers` | json | No | Request headers (JSON object) |
| `auth` | string | No | Authentication type: `BEARER`, `BASIC`, `NONE` (default: `NONE`) |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token (when auth is `BEARER`) |
| `basicSecretCode` | string | No | Secret code for Basic auth credentials (when auth is `BASIC`) |
| `batchMode` | string | No | `single` or `batch`. If `batch`, send multiple records in a single mutation (default: `single`) |
| `maxBatchSize` | number | No | Maximum records per batch when batchMode is `batch` |
| `retries` | number | No | Maximum retry attempts on failure (default: 0) |
| `retryDelayMs` | number | No | Initial retry delay in milliseconds |
| `maxRetryDelayMs` | number | No | Maximum retry delay in milliseconds (caps exponential backoff) |
| `backoffMultiplier` | number | No | Multiplier for exponential backoff between retries |
| `timeoutMs` | number | No | Request timeout in milliseconds |

### Example - Single Record Mutation

```typescript
.load('sync-to-cms', {
    adapterCode: 'graphqlMutation',
    endpoint: 'https://cms.example.com/graphql',
    mutation: `
        mutation UpsertProduct($input: ProductInput!) {
            upsertProduct(input: $input) {
                id
                status
            }
        }
    `,
    variableMapping: {
        'input.name': 'name',
        'input.sku': 'sku',
        'input.price': 'price',
        'input.description': 'description',
    },
    auth: 'BEARER',
    bearerTokenSecretCode: 'cms-api-token',
    retries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
})
```

### Example - Batch Mutation

```typescript
.load('bulk-update', {
    adapterCode: 'graphqlMutation',
    endpoint: 'https://api.example.com/graphql',
    mutation: `
        mutation BulkUpdateInventory($input: [InventoryInput!]!) {
            bulkUpdateInventory(input: $input) {
                updated
                failed
            }
        }
    `,
    variableMapping: {
        'sku': 'sku',
        'quantity': 'stockOnHand',
    },
    batchMode: 'batch',
    maxBatchSize: 100,
    auth: 'BASIC',
    basicSecretCode: 'inventory-api-creds',
})
```

---

## Using Sinks for External Systems

For sending data to external systems (REST APIs, search engines, message queues), use **Sinks** instead of loaders. See [Sinks Reference](./sinks.md) for details on:

- MeiliSearch, Elasticsearch, Algolia, Typesense (search indexing)
- RabbitMQ Queue Producer (message queuing)
- Webhook (REST API callbacks)

---

## Quick Reference

| Adapter Code | Entity Type | Description |
|--------------|-------------|-------------|
| `productUpsert` | Product | Create/update products with name, slug, description, facets, assets |
| `variantUpsert` | Product Variant | Update variants by SKU with prices and stock |
| `customerUpsert` | Customer | Create/update customers with addresses and groups |
| `collectionUpsert` | Collection | Create/update collections with parent relationships |
| `facetUpsert` | Facet | Create/update facets for product categorization |
| `facetValueUpsert` | Facet Value | Create/update facet values within facets |
| `assetImport` | Asset | Import assets from URLs |
| `assetAttach` | Asset | Attach existing assets to entities |
| `promotionUpsert` | Promotion | Create/update promotions with conditions and actions |
| `stockAdjust` | Inventory | Adjust inventory levels by SKU and stock location |
| `orderNote` | Order | Add notes to orders |
| `orderTransition` | Order | Transition order states |
| `applyCoupon` | Order | Apply coupon codes to orders |
| `taxRateUpsert` | Tax Rate | Create/update tax rates with category and zone |
| `paymentMethodUpsert` | Payment Method | Create/update payment methods with handlers |
| `channelUpsert` | Channel | Create/update channels with currencies and languages |
| `restPost` | Custom | POST data to REST endpoints |
| `graphqlMutation` | GraphQL | Send records as GraphQL mutations to external APIs |

### Required Permissions

Each loader requires specific Vendure permissions:

| Adapter Code | Required Permission |
|--------------|---------------------|
| `productUpsert`, `variantUpsert`, `collectionUpsert`, `facetUpsert`, `facetValueUpsert`, `assetImport`, `assetAttach`, `stockAdjust` | `UpdateCatalog` |
| `customerUpsert` | `UpdateCustomer` |
| `orderNote`, `orderTransition`, `applyCoupon` | `UpdateOrder` |
| `promotionUpsert` | `UpdatePromotion` |
| `restPost` | No specific permission (depends on endpoint) |
| `graphqlMutation` | No specific permission (depends on endpoint) |
