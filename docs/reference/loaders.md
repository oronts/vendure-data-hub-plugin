# Loaders Reference

Complete reference for all 24 built-in loaders: 16 entity loaders, 4 order operation loaders, 1 entity deletion loader, 1 inventory adjust loader, and 2 external system loaders. Supports multi-language translations, multi-channel assignment, multi-currency pricing, custom fields, and entity deletion for 13 entity types.

> **New**: [Enhanced validation error messages](../examples/validation-error-messages.md) with record identifiers and line numbers for better debugging.

## Table of Contents

### [Common Configuration](#common-configuration)
- [Loader Adapter Codes](#loader-adapter-codes) - Complete list of all 24 loaders
- [Load Strategies](#load-strategies) - CREATE, UPDATE, UPSERT, MERGE, SOFT_DELETE, HARD_DELETE
- [Conflict Strategies](#conflict-strategies) - SOURCE_WINS, VENDURE_WINS, MERGE, MANUAL_QUEUE

### Entity Loaders
- [Product Loader](#product-loader) - Create/update products with facets and assets
- [Product Variant Loader](#product-variant-loader) - Update variants by SKU with prices
- [Customer Loader](#customer-loader) - Create/update customers with addresses and groups
- [Collection Loader](#collection-loader) - Create/update collections with parent relationships
- [Inventory Loader](#inventory-loader) - Update stock levels by SKU
- [Entity Deletion Loader](#entity-deletion-loader) - Delete products, variants, collections, promotions, shipping methods, customers, payment methods, facets, facet values, customer groups, tax rates, assets, stock locations
- [Additional Loaders](#additional-loaders) - Order, Customer Group, Facet, Facet Value, Asset, Promotion, Shipping Method, Stock Location, Tax Rate, Payment Method, Channel

### External System Loaders
- [GraphQL Mutation Loader](#graphql-mutation-loader) - Send records as GraphQL mutations to external APIs
- [Using Sinks for External Systems](#using-sinks-for-external-systems) - Alternative for search engines and message queues

### [Quick Reference](#quick-reference-1)
- Summary table of all 24 loaders with descriptions
- Required permissions for each loader

---

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
| `orderUpsert` | Order | Create/update orders with lines and addresses (migration use only) |
| `orderNote` | Order | Add notes to orders |
| `orderTransition` | Order | Transition order states |
| `applyCoupon` | Order | Apply coupon codes to orders |
| `taxRateUpsert` | Tax Rate | Tax rates with zone and category mappings |
| `paymentMethodUpsert` | Payment Method | Payment methods with handler configuration |
| `channelUpsert` | Channel | Channels with currency and language settings |
| `shippingMethodUpsert` | Shipping Method | Create/update shipping methods with calculators, translations, channels |
| `customerGroupUpsert` | Customer Group | Create/update customer groups with member assignments |
| `stockLocationUpsert` | Stock Location | Create/update stock locations for inventory |
| `inventoryAdjust` | Inventory | Adjust inventory levels by SKU and location |
| `entityDeletion` | Multiple | Delete products, variants, collections, promotions, shipping methods, customers, payment methods, facets, facet values, customer groups, tax rates, assets, or stock locations |
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

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `channel` | string | No | Target channel code |
| `strategy` | string | No | Load strategy: `UPSERT` (default), `CREATE`, or `UPDATE` |
| `conflictStrategy` | string | No | Conflict strategy: `SOURCE_WINS` (default), `VENDURE_WINS`, or `MERGE` |
| `nameField` | string | No | Record field for product name (default: `"name"`) |
| `slugField` | string | No | Record field for slug (default: `"slug"`) |
| `descriptionField` | string | No | Record field for description (default: `"description"`) |
| `enabledField` | string | No | Record field for enabled/published flag (default: `"enabled"`) |
| `channelsField` | string | No | Record field containing channel codes (array or comma-separated) for dynamic per-record channel assignment |
| `translationsField` | string | No | Record field containing multi-language translations. Overrides name/slug/description fields. Supports array format `[{ languageCode, name, slug?, description? }]` or object map `{ en: { name, slug?, description? } }` |
| `skuField` | string | No | Record field for default variant SKU |
| `priceField` | string | No | Record field for default variant price |
| `customFieldsField` | string | No | Record field containing custom fields object (default: `"customFields"`) |
| `createVariants` | boolean | No | Create/update a default variant alongside the product (default: `true`). Set to `false` when variants are handled by a separate `variantUpsert` step |
| `facetValuesMode` | string | No | How to handle facet value assignments: `REPLACE_ALL` (default - replace all facets), `MERGE` (add new, keep existing), `REMOVE` (remove specified facets), `SKIP` (don't touch facets) |

### Nested Entity Modes

**facetValuesMode** - Controls how facet values are assigned to products:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `REPLACE_ALL` | Replace all existing facet values with new list (default) | Source system is single source of truth for facet assignments |
| `MERGE` | Add new facet values, keep existing ones | Multiple data sources contribute facets (e.g., PIM + manual admin) |
| `REMOVE` | Remove specified facet values from product | Cleaning up discontinued or incorrect facet assignments |
| `SKIP` | Don't modify facet values at all | Partial updates - only updating product name/description/price |

**Example - Merge facets from multiple sources:**
```typescript
.load('enrich-products-from-pim', {
    adapterCode: 'productUpsert',
    strategy: 'UPDATE',
    facetValuesMode: 'MERGE',  // Add new facets, keep existing
})

// Run 1 assigns: [color-red, size-large]
// Run 2 adds: [material-cotton]
// Result: [color-red, size-large, material-cotton] ✅
```

**Example - Skip facets for partial updates:**
```typescript
.load('update-product-descriptions', {
    adapterCode: 'productUpsert',
    strategy: 'UPDATE',
    descriptionField: 'newDescription',
    facetValuesMode: 'SKIP',  // Don't touch facets
})
```

### Example

```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    conflictStrategy: 'SOURCE_WINS',
    channelsField: 'channels',
    translationsField: 'translations',
    createVariants: false,
})
```

### Match Fields

Products can be matched by: `slug`, `id`, or `customFields.externalId`

---

## Product Variant Loader

Adapter Code: `variantUpsert`

Update product variants by SKU with multi-currency prices and auto-create option groups.

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
| `customFields` | object | No | Custom field values to set on the variant |

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `skuField` | string | Yes | Record field containing the SKU |
| `nameField` | string | No | Record field for variant name |
| `priceField` | string | No | Record field for price (major units, auto-converted to minor) |
| `priceByCurrencyField` | string | No | Record field for multi-currency prices object (e.g. `{ USD: 19.99, EUR: 17.50 }`) |
| `enabledField` | string | No | Record field for variant enabled/published flag (default: `"enabled"`) |
| `channelsField` | string | No | Record field containing channel codes (array or comma-separated) for dynamic per-record channel assignment |
| `translationsField` | string | No | Record field containing multi-language translations. Overrides name field. Supports array `[{ languageCode, name }]` or object map `{ en: { name }, de: { name } }` |
| `customFieldsField` | string | No | Record field containing custom fields object |
| `optionGroupsField` | string | No | Record field containing option group key-value pairs (auto-creates groups) |
| `optionIdsField` | string | No | Record field containing pre-existing Vendure option IDs array |
| `optionCodesField` | string | No | Record field containing option codes array for lookup |
| `taxCategoryName` | string | No | Tax category name to assign |
| `stockField` | string | No | Record field for stock on hand |
| `stockByLocationField` | string | No | Record field for stock by location map |
| `strategy` | string | No | Load strategy: `UPSERT` (default), `CREATE`, or `UPDATE` |
| `facetValuesMode` | string | No | How to handle facet value assignments: `REPLACE_ALL` (default - replace all facets), `MERGE` (add new, keep existing), `REMOVE` (remove specified facets), `SKIP` (don't touch facets) |

### Nested Entity Modes

**facetValuesMode** - Controls how facet values are assigned to variants (same modes as Product):

| Mode | Behavior | Use Case |
|------|----------|----------|
| `REPLACE_ALL` | Replace all existing facet values with new list (default) | Source system controls all facet assignments |
| `MERGE` | Add new facet values, keep existing ones | Incremental facet additions from multiple sources |
| `REMOVE` | Remove specified facet values from variant | Removing discontinued attributes |
| `SKIP` | Don't modify facet values at all | Partial updates - only updating price/stock |

**Example - Update prices without touching facets:**
```typescript
.load('update-variant-prices', {
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',
    skuField: 'sku',
    priceField: 'newPrice',
    facetValuesMode: 'SKIP',  // Don't modify facets
})
```

### Option Group Assignment

Variants can be assigned to option groups in three ways:

**Auto-create from key-value pairs** (`optionGroupsField`): Pass an object like `{ size: 'S', color: 'Blue' }`. The loader auto-creates option groups and options if they don't exist, assigns them to the parent product, and links the variant.

```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    matchField: 'sku',
    skuField: 'sku',
    optionGroupsField: 'options',  // record field: { size: 'S', color: 'Blue' }
})
```

**Direct ID passthrough** (`optionIdsField`): Pass an array of Vendure option IDs directly.

**Code lookup** (`optionCodesField`): Pass an array of option codes like `['size-s', 'color-blue']` to resolve by code.

### Example

```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    strategy: 'UPSERT',
    matchField: 'sku',
    skuField: 'sku',
    priceField: 'priceValue',
    optionGroupsField: 'options',
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

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `strategy` | string | No | Load strategy: `UPSERT` (default), `CREATE`, or `UPDATE` |
| `matchField` | string | No | Field to match existing customers (default: `emailAddress`) |
| `addressesMode` | string | No | How to handle addresses: `UPSERT_BY_MATCH` (default), `REPLACE_ALL`, `APPEND_ONLY`, `UPDATE_BY_ID`, `SKIP` |
| `addressMatchFields` | string | No | Comma-separated fields for address matching (default: `streetLine1,city,countryCode`) |
| `groupsMode` | string | No | How to handle customer groups: `REPLACE_ALL` (default), `MERGE`, `REMOVE`, `SKIP` |

### Nested Entity Modes

**addressesMode** - Controls how customer addresses are managed:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `UPSERT_BY_MATCH` | Match by fields, update if exists, create if not (default, **recommended**) | **Prevents duplicate addresses** - most common use case |
| `REPLACE_ALL` | Delete all existing addresses, create new from source | Source system is single source of truth for addresses |
| `APPEND_ONLY` | Always create new addresses (allows duplicates) | Address history tracking (rare - usually want UPSERT) |
| `UPDATE_BY_ID` | Update by Vendure address ID if provided, create if not | Source system tracks Vendure address IDs |
| `SKIP` | Don't modify addresses at all | Partial updates - only updating customer name/email |

**Address Matching** (`UPSERT_BY_MATCH` mode):
- Default match fields: `streetLine1`, `city`, `countryCode`
- Customizable via `addressMatchFields` config
- Case-insensitive matching
- Prevents duplicate addresses across repeated pipeline runs

**groupsMode** - Controls customer group assignments:

| Mode | Behavior |
|------|----------|
| `REPLACE_ALL` | Remove all groups, assign new list (default) |
| `MERGE` | Add new groups, keep existing |
| `REMOVE` | Remove specified groups |
| `SKIP` | Don't modify groups |

### Example - Prevent Duplicate Addresses

```typescript
.load('import-customers', {
    adapterCode: 'customerUpsert',
    strategy: 'UPSERT',
    matchField: 'emailAddress',
    addressesMode: 'UPSERT_BY_MATCH',  // ← Prevents duplicates
    addressMatchFields: 'streetLine1,city,postalCode,countryCode'
})

// Run 1: Customer has 2 addresses
// Run 2: Customer still has 2 addresses (no duplicates!) ✅
```

### Example - Custom Address Matching

```typescript
.load('import-customers', {
    addressesMode: 'UPSERT_BY_MATCH',
    addressMatchFields: 'streetLine1,city,countryCode'  // Match by street+city+country only
})
```

### Match Fields

Customers can be matched by: `emailAddress`

---

## Collection Loader

Adapter Code: `collectionUpsert`

Create or update collections with parent relationships. Supports multi-language translations, multi-channel assignment, and isPrivate flag.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Collection name |
| `slug` | string | No | URL-friendly identifier |
| `description` | string | No | Collection description |
| `parentSlug` | string | No | Parent collection slug |
| `enabled` | boolean | No | Whether collection is visible |

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `channel` | string | No | Target channel code |
| `strategy` | string | No | Load strategy: `UPSERT` (default), `CREATE`, or `UPDATE` |
| `slugField` | string | No | Record field for slug (default: `"slug"`) |
| `nameField` | string | No | Record field for name (default: `"name"`) |
| `descriptionField` | string | No | Record field for description (default: `"description"`) |
| `parentSlugField` | string | No | Record field for parent collection slug |
| `customFieldsField` | string | No | Record field containing custom fields object |
| `translationsField` | string | No | Record field containing multi-language translations. Overrides name/slug/description fields. Supports array `[{ languageCode, name, slug?, description? }]` or object map `{ en: { name, slug?, description? } }` |
| `channelsField` | string | No | Record field containing channel codes (array or comma-separated) for per-record channel assignment |
| `isPrivateField` | string | No | Record field containing isPrivate boolean flag |
| `applyFilters` | boolean | No | Trigger filter application job after upsert |

### Example

```typescript
.load('import-collections', {
    adapterCode: 'collectionUpsert',
    strategy: 'UPSERT',
    translationsField: 'translations',
    channelsField: 'channels',
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

## Entity Deletion Loader

Adapter Code: `entityDeletion`

Delete entities by slug, SKU, code, email, name, or ID. Supports 13 entity types: Products, Variants, Collections, Promotions, Shipping Methods, Customers, Payment Methods, Facets, Facet Values, Customer Groups, Tax Rates, Assets, and Stock Locations.

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `entityType` | string | No | Entity type: `'product'`, `'variant'`, `'collection'`, `'promotion'`, `'shipping-method'`, `'customer'`, `'payment-method'`, `'facet'`, `'facet-value'`, `'customer-group'`, `'tax-rate'`, `'asset'`, or `'stock-location'` (default: `'product'`) |
| `identifierField` | string | No | Record field containing the identifier (default depends on entity type) |
| `matchBy` | string | No | How to find the entity: `'slug'`, `'sku'`, `'id'`, `'code'`, `'email'`, or `'name'` (default depends on entity type) |
| `cascadeVariants` | boolean | No | Delete all variants before deleting a product (default: `true`) |
| `channel` | string | No | Channel code for context |

### Default matchBy per Entity Type

| Entity Type | Default matchBy | Default identifierField |
|-------------|----------------|------------------------|
| `product` | `slug` | `slug` |
| `variant` | `sku` | `sku` |
| `collection` | `slug` | `slug` |
| `promotion` | `code` | `code` |
| `shipping-method` | `code` | `code` |
| `customer` | `email` | `email` |
| `payment-method` | `code` | `code` |
| `facet` | `code` | `code` |
| `facet-value` | `code` | `code` |
| `customer-group` | `name` | `name` |
| `tax-rate` | `name` | `name` |
| `asset` | `name` | `name` |
| `stock-location` | `name` | `name` |

### Example - Delete Products by Slug

```typescript
.load('delete-products', {
    adapterCode: 'entityDeletion',
    entityType: 'product',
    matchBy: 'slug',
    cascadeVariants: true,
})
```

### Example - Delete Promotions by Code

```typescript
.load('delete-promotions', {
    adapterCode: 'entityDeletion',
    entityType: 'promotion',
    identifierField: 'couponCode',
})
```

### Example - Delete Customers by Email

```typescript
.load('delete-customers', {
    adapterCode: 'entityDeletion',
    entityType: 'customer',
    identifierField: 'email',
})
```

### Example - Delete Collections by Slug

```typescript
.load('delete-collections', {
    adapterCode: 'entityDeletion',
    entityType: 'collection',
    identifierField: 'slug',
})
```

### Example - Delete Facet Values by Code

```typescript
.load('delete-facet-values', {
    adapterCode: 'entityDeletion',
    entityType: 'facet-value',
    identifierField: 'facetValueCode',
})
```

### Behavior

- **Product deletion with cascade**: All variants are soft-deleted first, then the product
- **Product deletion without cascade**: Only the product is soft-deleted (variants remain)
- **Collection deletion**: Deletes the collection found by slug or ID
- **Promotion deletion**: Soft-deletes the promotion found by coupon code or ID
- **Shipping method deletion**: Soft-deletes the shipping method found by code or ID
- **Customer deletion**: Soft-deletes the customer found by email or ID
- **Payment method deletion**: Hard-deletes the payment method found by code or ID
- **Facet deletion**: Hard-deletes the facet found by code or ID (includes all facet values)
- **Facet value deletion**: Hard-deletes the facet value found by code or ID
- **Customer group deletion**: Deletes the customer group found by name or ID
- **Tax rate deletion**: Deletes the tax rate found by name or ID
- **Asset deletion**: Deletes the asset found by name or ID
- **Stock location deletion**: Deletes the stock location found by name or ID
- **Not found**: Logs a warning and skips (does not fail the record)
- **Errors**: Reported via `onRecordError` callback per standard loader error handling

---

---

## Order Loader

Adapter Code: `orderUpsert`

Create or update orders with line items and addresses. **Intended for system migrations** - normal orders should go through the standard checkout flow.

### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Order code / reference number |
| `customerEmail` | string | Yes | Customer email address (must exist) |
| `lines` | array | Yes | Order line items with SKU and quantity |
| `shippingAddress` | object | No | Shipping address details |
| `billingAddress` | object | No | Billing address details |
| `shippingMethodCode` | string | No | Shipping method code |
| `state` | string | No | Target order state (e.g., 'PaymentSettled', 'Shipped') |
| `orderPlacedAt` | string | No | Order placement date (ISO 8601 format) for backdating |

### Config Fields

| Config Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `strategy` | string | No | Load strategy: `CREATE` (default), `UPDATE`, or `UPSERT` |
| `codeField` | string | No | Record field for order code (default: `"code"`) |
| `customerEmailField` | string | No | Record field for customer email (default: `"customerEmail"`) |
| `linesField` | string | No | Record field for order lines array (default: `"lines"`) |
| `shippingAddressField` | string | No | Record field for shipping address (default: `"shippingAddress"`) |
| `billingAddressField` | string | No | Record field for billing address (default: `"billingAddress"`) |
| `stateField` | string | No | Record field for target state (default: `"state"`) |
| `orderPlacedAtField` | string | No | Record field for order placement date (default: `"orderPlacedAt"`) |
| `linesMode` | string | No | How to handle order lines: `REPLACE_ALL` (default), `MERGE_BY_SKU`, `APPEND_ONLY`, `SKIP` |

### Nested Entity Modes

**linesMode** - Controls how order line items are managed:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `REPLACE_ALL` | Remove all existing lines, add new ones (default) | Full order replacement during migration |
| `MERGE_BY_SKU` | Update quantities for existing SKUs, add new SKUs | Incremental order updates - adding more items or adjusting quantities |
| `APPEND_ONLY` | Always add new lines (allows duplicate SKUs) | Order modification history tracking (rare) |
| `SKIP` | Don't modify order lines | Update order state or addresses only, leave lines unchanged |

**Example - Merge order lines by SKU:**
```typescript
.load('update-orders', {
    adapterCode: 'orderUpsert',
    strategy: 'UPDATE',
    codeField: 'orderCode',
    linesField: 'additionalItems',
    linesMode: 'MERGE_BY_SKU',  // Smart merging
})

// Existing order: PROD-A qty:2
// Update adds: PROD-A qty:5, PROD-B qty:1
// Result: PROD-A qty:5 (updated), PROD-B qty:1 (added) ✅
```

**Example - Replace all lines:**
```typescript
.load('migrate-orders', {
    adapterCode: 'orderUpsert',
    strategy: 'CREATE',
    linesMode: 'REPLACE_ALL',  // Complete replacement
    stateField: 'finalState',
    orderPlacedAtField: 'originalOrderDate',
})
```

### Match Fields

Orders can be matched by: `code`

---

## Additional Loaders

The following loaders are available but have similar patterns:

### Customer Group Loader (`CUSTOMER_GROUP`)
Create/update customer groups with member assignments.

### Facet Loader (`FACET`)
Create/update facets for product categorization. Supports `translationsField` for multi-language names and `channelsField` for per-record channel assignment.

### Facet Value Loader (`FACET_VALUE`)
Create/update facet values within facets. Supports `translationsField` for multi-language names and `channelsField` for per-record channel assignment.

### Asset Loader (`ASSET`)
Create/update assets and attach to entities.

### Promotion Loader (`PROMOTION`)
Create/update promotions with conditions and actions. Supports `translationsField` for multi-language name/description, `channelsField` for per-record channel assignment, `descriptionField` for single-language description, and `perCustomerUsageLimitField` for per-customer usage limits. When the `enabled` field is not provided in the record, promotions default to `enabled: true`.

### Shipping Method Loader (`SHIPPING_METHOD`)
Create/update shipping methods with calculators and fulfillment handlers. Supports `translationsField` for multi-language name/description, `channelsField` for per-record channel assignment, and `customFieldsField` for custom field values.

### Stock Location Loader (`STOCK_LOCATION`)
Create/update stock locations for inventory.

### Tax Rate Loader (`TAX_RATE`)
Create/update tax rates with category and zone.

### Payment Method Loader (`PAYMENT_METHOD`)
Create/update payment methods with handlers. Supports `translationsField` for multi-language name/description, `channelsField` for per-record channel assignment, and `customFieldsField` for custom field values.

### Channel Loader (`CHANNEL`)
Create/update channels with currencies and languages. Supports `customFieldsField` for custom field values.

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
| `shippingMethodUpsert` | Shipping Method | Create/update shipping methods with calculators, translations, channels |
| `customerGroupUpsert` | Customer Group | Create/update customer groups with member assignments |
| `stockLocationUpsert` | Stock Location | Create/update stock locations for inventory |
| `inventoryAdjust` | Inventory | Adjust inventory levels by SKU and location |
| `entityDeletion` | Multiple | Delete products, variants, collections, promotions, shipping methods, customers, payment methods, facets, facet values, customer groups, tax rates, assets, or stock locations |
| `restPost` | Custom | POST data to REST endpoints |
| `graphqlMutation` | GraphQL | Send records as GraphQL mutations to external APIs |

### Required Permissions

Each loader requires specific Vendure permissions:

| Adapter Code | Required Permission |
|--------------|---------------------|
| `productUpsert`, `variantUpsert`, `collectionUpsert`, `facetUpsert`, `facetValueUpsert`, `assetImport`, `assetAttach`, `stockAdjust`, `entityDeletion` | `UpdateCatalog` |
| `customerUpsert` | `UpdateCustomer` |
| `orderNote`, `orderTransition`, `applyCoupon` | `UpdateOrder` |
| `promotionUpsert` | `UpdatePromotion` |
| `shippingMethodUpsert` | `UpdateShippingMethod` |
| `customerGroupUpsert` | `UpdateCustomer` |
| `stockLocationUpsert` | `UpdateCatalog` |
| `inventoryAdjust` | `UpdateCatalog` |
| `taxRateUpsert` | `UpdateSettings` |
| `paymentMethodUpsert` | `UpdateSettings` |
| `channelUpsert` | `UpdateSettings` |
| `restPost` | `UpdateDataHubSettings` |
| `graphqlMutation` | `UpdateDataHubSettings` |
