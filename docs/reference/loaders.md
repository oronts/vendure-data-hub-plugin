# Loaders Reference

Complete reference for all entity loaders.

## Common Configuration

All loaders require:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adapterCode` | string | Yes | Loader adapter identifier |

Some loaders (like `productUpsert`) support additional options:

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | Load strategy (see below) - only for `productUpsert` |
| `channel` | string | Target channel code (e.g., `__default_channel__`) |

### Load Strategies (productUpsert only)

| Strategy | Description |
|----------|-------------|
| `source-wins` | Upsert where source data overwrites Vendure data for conflicts |
| `vendure-wins` | Upsert where Vendure data is preserved for conflicts |
| `merge` | Deep merge source and Vendure data |

---

## Product Loader

Code: `productUpsert`

Upsert Products and default Variants by slug/SKU.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | Yes | Channel code (e.g., `__default_channel__`) |
| `strategy` | string | Yes | Conflict strategy: `source-wins`, `vendure-wins`, `merge` |
| `nameField` | string | No | Source field for product name |
| `slugField` | string | No | Source field for slug |
| `descriptionField` | string | No | Source field for description |
| `skuField` | string | No | Source field for default variant SKU |
| `priceField` | string | No | Source field for default variant price |
| `taxCategoryName` | string | No | Tax category name to assign |
| `trackInventory` | string | No | `true` or `false` |
| `stockField` | string | No | Source field for stock on hand |
| `stockByLocationField` | string | No | Source field for stock by location (object) |

### Example

```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'source-wins',
    channel: '__default_channel__',
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    skuField: 'sku',
    priceField: 'price',
})
```

### Identifier

Products are matched by `slug`.

---

## Product Variant Loader

Code: `variantUpsert`

Upsert ProductVariant by SKU.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | No | Channel code |
| `skuField` | string | Yes | Source field for SKU |
| `nameField` | string | No | Source field for variant name |
| `priceField` | string | No | Source field for price (in minor units) |
| `priceByCurrencyField` | string | No | Source field for multi-currency prices (object) |
| `taxCategoryName` | string | No | Tax category name to assign |
| `stockField` | string | No | Source field for stock on hand |
| `stockByLocationField` | string | No | Source field for stock by location (object) |

### Example

```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    channel: '__default_channel__',
    skuField: 'sku',
    priceField: 'price',
    stockField: 'stock',
})
```

### Identifier

Variants are matched by `sku`.

---

## Customer Loader

Code: `customerUpsert`

Upsert Customer by email or externalId; merge addresses; assign groups.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `emailField` | string | Yes | Source field for email |
| `firstNameField` | string | No | Source field for first name |
| `lastNameField` | string | No | Source field for last name |
| `phoneNumberField` | string | No | Source field for phone |
| `addressesField` | string | No | Source field for addresses array |
| `groupsField` | string | No | Source field for group codes array |
| `groupsMode` | string | No | `add` (append) or `set` (replace) |

### Example

```typescript
.load('import-customers', {
    adapterCode: 'customerUpsert',
    emailField: 'email',
    firstNameField: 'firstName',
    lastNameField: 'lastName',
    phoneNumberField: 'phone',
    groupsField: 'groups',
    groupsMode: 'add',
})
```

### Identifier

Customers are matched by `email`.

---

## Collection Loader

Code: `collectionUpsert`

Create or update collections.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | No | Channel code |
| `slugField` | string | Yes | Source field for slug |
| `nameField` | string | Yes | Source field for name |
| `parentSlugField` | string | No | Source field for parent collection slug |
| `descriptionField` | string | No | Source field for description |
| `applyFilters` | boolean | No | Whether to trigger filter job after upsert |

### Example

```typescript
.load('import-collections', {
    adapterCode: 'collectionUpsert',
    channel: '__default_channel__',
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    parentSlugField: 'parentSlug',
})
```

---

## Promotion Loader

Code: `promotionUpsert`

Upsert Promotion by couponCode; create/update enabled dates/actions/conditions.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `codeField` | string | Yes | Source field for coupon code |
| `nameField` | string | No | Source field for promotion name |
| `enabledField` | string | No | Source field for enabled status |
| `startsAtField` | string | No | Source field for start date |
| `endsAtField` | string | No | Source field for end date |
| `conditionsField` | string | No | Source field for conditions (JSON) |
| `actionsField` | string | No | Source field for actions (JSON) |
| `channel` | string | No | Channel code |

### Example

```typescript
.load('import-promotions', {
    adapterCode: 'promotionUpsert',
    channel: '__default_channel__',
    codeField: 'couponCode',
    nameField: 'name',
    startsAtField: 'validFrom',
    endsAtField: 'validTo',
    enabledField: 'enabled',
})
```

---

## Order Note Loader

Code: `orderNote`

Add notes to orders.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderCodeField` | string | No | Source field for order code |
| `orderIdField` | string | No | Source field for order ID |
| `noteField` | string | Yes | Source field for note content |
| `isPrivate` | boolean | No | Whether note is private (not visible to customer) |

Note: Provide either `orderCodeField` or `orderIdField` to identify the order.

### Example

```typescript
.load('add-order-notes', {
    adapterCode: 'orderNote',
    orderCodeField: 'orderCode',
    noteField: 'note',
    isPrivate: true,
})
```

---

## Order Transition Loader

Code: `orderTransition`

Transition order state.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderIdField` | string | No | Source field for order ID |
| `orderCodeField` | string | No | Source field for order code |
| `state` | string | Yes | Target state to transition to |

Note: Provide either `orderIdField` or `orderCodeField` to identify the order.

### Example

```typescript
.load('transition-orders', {
    adapterCode: 'orderTransition',
    orderCodeField: 'orderCode',
    state: 'Shipped',
})
```

---

## Stock Adjust Loader

Code: `stockAdjust`

Adjust inventory levels by SKU and stock location.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skuField` | string | Yes | Source field for variant SKU |
| `stockByLocationField` | string | Yes | Source field for stock map (location code to quantity) |
| `absolute` | boolean | No | If true, set absolute stock level; if false, apply delta |

### Example

```typescript
.load('update-stock', {
    adapterCode: 'stockAdjust',
    skuField: 'sku',
    stockByLocationField: 'stock',
    absolute: true,
})
```

### Stock Map Format

The `stockByLocationField` should point to an object mapping location codes to quantities:

```json
{
    "sku": "ABC-123",
    "stock": {
        "default": 100,
        "warehouse-1": 50
    }
}
```

---

## Apply Coupon Loader

Code: `applyCoupon`

Apply coupon codes to orders.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderIdField` | string | No | Source field for order ID |
| `orderCodeField` | string | No | Source field for order code |
| `couponField` | string | Yes | Source field for coupon code |

Note: Provide either `orderIdField` or `orderCodeField` to identify the order.

### Example

```typescript
.load('apply-coupons', {
    adapterCode: 'applyCoupon',
    orderCodeField: 'orderCode',
    couponField: 'couponCode',
})
```

---

## Asset Attach Loader

Code: `assetAttach`

Attach existing assets as featured asset to Products or Collections.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity` | string | Yes | Entity type: `product` or `collection` |
| `slugField` | string | Yes | Source field for entity slug |
| `assetIdField` | string | Yes | Source field for asset ID |
| `channel` | string | No | Channel code |

### Example

```typescript
.load('attach-assets', {
    adapterCode: 'assetAttach',
    entity: 'product',
    slugField: 'productSlug',
    assetIdField: 'featuredAssetId',
    channel: '__default_channel__',
})
```

---

## REST Post Loader

Code: `restPost`

Send data to external REST APIs.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | Target API endpoint |
| `method` | string | Yes | HTTP method: `POST` or `PUT` |
| `headers` | object | No | Request headers (JSON) |
| `auth` | string | No | Auth preset: `none`, `bearer`, `basic`, `hmac` |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token |
| `basicSecretCode` | string | No | Secret code for Basic auth |
| `hmacSecretCode` | string | No | Secret code for HMAC signature |
| `hmacHeader` | string | No | Header name for HMAC signature |
| `hmacPayloadTemplate` | string | No | Template for HMAC payload |
| `batchMode` | string | No | `single` (one per request) or `array` (batch) |
| `maxBatchSize` | number | No | Chunk size when batchMode is `array` |
| `retries` | number | No | Number of retries for failed requests |
| `retryDelayMs` | number | No | Delay between retries in milliseconds |
| `timeoutMs` | number | No | Request timeout in milliseconds |

### Example - Single Records

```typescript
.load('send-to-erp', {
    adapterCode: 'restPost',
    endpoint: 'https://api.erp.com/products',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    bearerTokenSecretCode: 'erp-api-key',
    batchMode: 'single',
    retries: 3,
    timeoutMs: 30000,
})
```

### Example - Batch Mode

```typescript
.load('batch-export', {
    adapterCode: 'restPost',
    endpoint: 'https://api.erp.com/products/batch',
    method: 'POST',
    batchMode: 'array',
    maxBatchSize: 100,
    bearerTokenSecretCode: 'erp-api-key',
})
```

---

## Tax Rate Loader

Code: `taxRateUpsert`

Create or update tax rates.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nameField` | string | Yes | Source field for tax rate name |
| `valueField` | string | Yes | Source field for rate value (percentage) |
| `categoryField` | string | No | Source field for tax category code |
| `zoneField` | string | No | Source field for zone code |
| `channel` | string | No | Channel code |

### Example

```typescript
.load('import-tax-rates', {
    adapterCode: 'taxRateUpsert',
    nameField: 'name',
    valueField: 'rate',
    categoryField: 'category',
    zoneField: 'zone',
    channel: '__default_channel__',
})
```

---

## Payment Method Loader

Code: `paymentMethodUpsert`

Create or update payment methods.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `codeField` | string | Yes | Source field for payment method code |
| `nameField` | string | Yes | Source field for name |
| `enabledField` | string | No | Source field for enabled status |
| `handlerField` | string | No | Source field for handler code |
| `channel` | string | No | Channel code |

### Example

```typescript
.load('import-payment-methods', {
    adapterCode: 'paymentMethodUpsert',
    codeField: 'code',
    nameField: 'name',
    enabledField: 'enabled',
    channel: '__default_channel__',
})
```

---

## Channel Loader

Code: `channelUpsert`

Create or update channels.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `codeField` | string | Yes | Source field for channel code |
| `tokenField` | string | Yes | Source field for channel token |
| `currencyCodeField` | string | No | Source field for default currency |
| `defaultLanguageCodeField` | string | No | Source field for default language |

### Example

```typescript
.load('import-channels', {
    adapterCode: 'channelUpsert',
    codeField: 'code',
    tokenField: 'token',
    currencyCodeField: 'currency',
    defaultLanguageCodeField: 'language',
})
```

---

## Quick Reference

| Code | Entity | Description |
|------|--------|-------------|
| `productUpsert` | Product | Create/update products with variants, prices, tax, and stock |
| `variantUpsert` | ProductVariant | Create/update variants with multi-currency prices |
| `customerUpsert` | Customer | Create/update customers with addresses and groups |
| `collectionUpsert` | Collection | Create/update collections with parent relationships |
| `promotionUpsert` | Promotion | Create/update promotions with conditions and actions |
| `orderNote` | Order | Add public or private notes to orders |
| `orderTransition` | Order | Transition order to new state (e.g., Shipped) |
| `stockAdjust` | ProductVariant | Adjust inventory levels by SKU and location |
| `applyCoupon` | Order | Apply coupon codes to orders |
| `assetAttach` | Product/Collection | Attach assets as featured image |
| `taxRateUpsert` | TaxRate | Create/update tax rates with category and zone |
| `paymentMethodUpsert` | PaymentMethod | Configure payment methods with handlers |
| `channelUpsert` | Channel | Create/update channels with currencies and languages |
| `restPost` | External | POST/PUT data to external REST APIs |

### Required Permissions

Each loader requires specific Vendure permissions:

| Loader | Required Permission |
|--------|---------------------|
| `productUpsert`, `variantUpsert`, `stockAdjust`, `collectionUpsert`, `assetAttach` | `UpdateCatalog` |
| `customerUpsert` | `UpdateCustomer` |
| `orderNote`, `orderTransition`, `applyCoupon` | `UpdateOrder` |
| `promotionUpsert` | `UpdatePromotion` |
| `taxRateUpsert`, `paymentMethodUpsert`, `channelUpsert` | `UpdateSettings` |
| `restPost` | `UpdateDataHubSettings` |
