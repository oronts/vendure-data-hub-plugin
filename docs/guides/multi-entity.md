# Multi-Entity Mode Guide

Complete guide to configurable nested entity modes in the Data Hub plugin.

---

## Introduction

### What Are Nested Entity Modes?

Nested entity modes control how arrays of related entities are handled during imports:
- **Customer addresses** - array of address objects
- **Product facet values** - array of facet assignments
- **Order line items** - array of products in the order
- **Product assets** - array of images
- And more...

### The Problem

**Without explicit modes**, re-running import pipelines can cause data corruption:

```typescript
// Import customer with 2 addresses
.load('import-customers', {
    addressesField: 'addresses'
})

// Run 1: Customer has 2 addresses ✅
// Run 2: Customer has 4 addresses ❌ (duplicates!)
// Run 3: Customer has 6 addresses ❌ (more duplicates!)
```

The root cause: The loader always created new nested entities without checking for existing ones.

### The Solution

**Configurable modes** give you full control over how nested entities are managed:

```typescript
.load('import-customers', {
    addressesMode: 'UPSERT_BY_MATCH',  // ← Smart matching prevents duplicates
    addressMatchFields: 'streetLine1,city,postalCode,countryCode'
})

// Run 1-10: Customer always has exactly 2 addresses ✅
```

---

## Mode Categories

### 1. Matching Modes (Smart Upsert)

**Pattern**: Match by specific fields, update if exists, create if not

**Modes**: `UPSERT_BY_MATCH`, `UPSERT_BY_URL`, `UPSERT_BY_NAME`, `MERGE_BY_SKU`, `UPDATE_BY_ID`

**When to use**:
- Source system doesn't track Vendure IDs
- Want to prevent duplicates automatically
- Data can be uniquely identified by business fields
- **Most common use case** - recommended default

**Example - Customer addresses:**
```typescript
.load('import-customers', {
    addressesMode: 'UPSERT_BY_MATCH',  // ← Prevents duplicate addresses
    addressMatchFields: 'streetLine1,city,countryCode'
})

// Without addressesMode: Run 1 = 2 addresses, Run 2 = 4 addresses (duplicates)
// With addressesMode: Run 1-100 = always 2 addresses
```

**How it works**:
1. For each new address, check existing addresses
2. Match by specified fields (e.g., street + city + country)
3. If match found → update existing address
4. If no match → create new address
5. Result: No duplicates!

**Customizable matching**:
```typescript
// Match by street + city + country (default)
addressMatchFields: 'streetLine1,city,countryCode'

// Match by street + city + postal code + country (more specific)
addressMatchFields: 'streetLine1,city,postalCode,countryCode'

// Match by street only (less specific - may incorrectly match)
addressMatchFields: 'streetLine1'  // ⚠️ Too broad
```

---

### 2. Replacement Modes (Full Control)

**Pattern**: Remove all existing, create new from source data

**Modes**: `REPLACE_ALL`

**When to use**:
- Source system is single source of truth
- Want complete control over nested entities
- Cleaning up old/stale data

**Example - Product facets:**
```typescript
.load('sync-products-from-pim', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    facetValuesMode: 'REPLACE_ALL'  // PIM controls all facet assignments
})

// PIM says: [color-red, size-large]
// Result: Vendure has exactly [color-red, size-large]
// Old facets removed, new facets added
```

**Supported by**: All modes support `REPLACE_ALL`

---

### 2. Merge Modes (Additive)

**Pattern**: Add new items, keep existing ones

**Modes**: `MERGE`, `APPEND_ONLY`, `MERGE_BY_SKU`

**When to use**:
- Multiple data sources contribute to same entity
- Never want to lose existing data
- Incremental updates only

**Example - Facet values from multiple sources:**
```typescript
// Run 1: PIM imports base facets
.load('import-from-pim', {
    facetValuesMode: 'MERGE'
})
// Input: [color-red, size-large]
// Result: [color-red, size-large]

// Run 2: Admin adds manual facets
.load('enrich-from-admin', {
    facetValuesMode: 'MERGE'
})
// Input: [material-cotton, eco-friendly]
// Result: [color-red, size-large, material-cotton, eco-friendly] ✅
```

**Example - Order lines smart merging:**
```typescript
.load('add-order-items', {
    adapterCode: 'orderUpsert',
    linesMode: 'MERGE_BY_SKU'  // Update quantities, add new SKUs
})

// Existing order: PROD-A qty:2
// Input: PROD-A qty:5, PROD-B qty:1
// Result: PROD-A qty:5 (updated), PROD-B qty:1 (added) ✅
```

**Difference between MERGE and APPEND_ONLY**:
- `MERGE`: Deduplicates (same facet won't be added twice)
- `APPEND_ONLY`: Allows duplicates (useful for history tracking)
- `MERGE_BY_SKU`: Smart merging based on SKU match (order lines only)

---

### 3. Removal Modes

**Pattern**: Remove specified items from entity

**Modes**: `REMOVE`

**When to use**:
- Removing discontinued or incorrect assignments
- Cleaning up specific facets/groups

**Example - Remove discontinued facets:**
```typescript
.load('remove-old-facets', {
    adapterCode: 'productUpsert',
    strategy: 'UPDATE',
    facetValuesMode: 'REMOVE'
})

// Existing facets: [color-red, size-large, season-2023]
// Input: [season-2023]  // Remove this facet
// Result: [color-red, size-large] ✅
```

---

### 4. Skip Mode

**Pattern**: Don't touch nested entities at all

**Modes**: `SKIP`

**When to use**:
- Partial updates - only modifying specific fields
- Want to leave nested entities completely unchanged

**Example - Update prices without touching facets:**
```typescript
.load('update-prices-only', {
    adapterCode: 'productUpsert',
    strategy: 'UPDATE',
    priceField: 'newPrice',
    facetValuesMode: 'SKIP',  // Don't modify facets
    assetsMode: 'SKIP'         // Don't modify images
})

// Only updates price field, everything else unchanged ✅
```

---

## All Implemented Modes Reference

### Customer Loader

**addressesMode** - Control customer address management

| Mode | Behavior |
|------|----------|
| `UPSERT_BY_MATCH` | Match by fields, update existing or create new (default, **recommended**) |
| `REPLACE_ALL` | Delete all addresses, create new from source |
| `APPEND_ONLY` | Always create new (allows duplicates - rare) |
| `UPDATE_BY_ID` | Update by Vendure ID, create if no ID |
| `SKIP` | Don't modify addresses |

**Configuration:**
```typescript
.load('import-customers', {
    adapterCode: 'customerUpsert',
    addressesMode: 'UPSERT_BY_MATCH',  // Default
    addressMatchFields: 'streetLine1,city,countryCode'  // Customizable
})
```

**This mode prevents duplicate addresses** by matching existing addresses before creating new ones. Without it, every pipeline run would create duplicate addresses.

**groupsMode** - Control customer group assignments

| Mode | Behavior |
|------|----------|
| `REPLACE_ALL` | Remove all groups, assign new (default) |
| `MERGE` | Add new groups, keep existing |
| `REMOVE` | Remove specified groups |
| `SKIP` | Don't modify groups |

---

### Product Loader

**facetValuesMode** - Control facet value assignments

| Mode | Behavior |
|------|----------|
| `REPLACE_ALL` | Replace all facets (default) |
| `MERGE` | Add new, keep existing |
| `REMOVE` | Remove specified facets |
| `SKIP` | Don't touch facets |

**Configuration:**
```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    facetValuesMode: 'MERGE'
})
```

---

### Product Variant Loader

**facetValuesMode** - Control facet value assignments (same as Product)

| Mode | Behavior |
|------|----------|
| `REPLACE_ALL` | Replace all facets (default) |
| `MERGE` | Add new, keep existing |
| `REMOVE` | Remove specified facets |
| `SKIP` | Don't touch facets |

**Configuration:**
```typescript
.load('upsert-variants', {
    adapterCode: 'variantUpsert',
    skuField: 'sku',
    facetValuesMode: 'SKIP'  // Don't modify facets
})
```

---

### Order Loader

**linesMode** - Control order line item management

| Mode | Behavior |
|------|----------|
| `REPLACE_ALL` | Remove all lines, add new (default) |
| `MERGE_BY_SKU` | Update quantities for existing SKUs, add new |
| `APPEND_ONLY` | Always add new lines (allows duplicates) |
| `SKIP` | Don't modify order lines |

**Configuration:**
```typescript
.load('update-orders', {
    adapterCode: 'orderUpsert',
    codeField: 'orderCode',
    linesMode: 'MERGE_BY_SKU'
})
```

---

## Decision Guide: Which Mode to Use?

### For Facet Values (Product/Variant)

| Scenario | Recommended Mode |
|----------|-----------------|
| PIM is single source of truth | `REPLACE_ALL` |
| Multiple sources add facets | `MERGE` |
| Removing specific facets | `REMOVE` |
| Only updating prices/stock | `SKIP` |

### For Order Lines

| Scenario | Recommended Mode |
|----------|-----------------|
| Full order import/migration | `REPLACE_ALL` |
| Adding items to existing order | `MERGE_BY_SKU` |
| Order modification history | `APPEND_ONLY` |
| Only updating order state | `SKIP` |

---

## Best Practices

### 1. Always Specify Modes Explicitly

```typescript
// ❌ Bad: Relies on defaults
.load('upsert-products', {})

// ✅ Good: Explicit configuration
.load('upsert-products', {
    facetValuesMode: 'REPLACE_ALL'
})
```

**Why**: Defaults may change in future versions, explicit config prevents surprises.

---

### 2. Use SKIP for Partial Updates

When updating only specific fields, explicitly skip nested entities:

```typescript
// Updating product descriptions only
.load('update-descriptions', {
    strategy: 'UPDATE',
    descriptionField: 'newDescription',
    facetValuesMode: 'SKIP',  // ← Don't accidentally clear facets
})
```

---

### 3. Document Your Mode Choices

Add comments explaining why you chose each mode:

```typescript
.load('import-products', {
    // PIM controls all facet assignments - replace completely
    facetValuesMode: 'REPLACE_ALL',

    // Images come from multiple sources - merge them
    assetsMode: 'MERGE',
})
```

---

### 4. Test with Dry Run First

Always test mode configuration before production:

```bash
npm run pipeline:run my-pipeline --dry-run
```

---

### 5. Choose the Right Merge Strategy

**For deduplication**: Use `MERGE`
```typescript
facetValuesMode: 'MERGE'  // Won't add duplicate facets
```

**For history tracking**: Use `APPEND_ONLY`
```typescript
addressesMode: 'APPEND_ONLY'  // Keeps address history (rare)
```

**For smart updates**: Use SKU-based merging
```typescript
linesMode: 'MERGE_BY_SKU'  // Updates quantities intelligently
```

---

## Complete Examples

### Example 1: Product Catalog from Multiple Sources

```typescript
// Step 1: Import base products from PIM
PipelineBuilder.create('import-from-pim')
    .extract('pim-products', {
        adapterCode: 'httpApi',
        url: 'https://pim.example.com/api/products'
    })
    .load('create-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        facetValuesMode: 'REPLACE_ALL',  // PIM controls facets
        assetsMode: 'REPLACE_ALL'         // PIM controls images
    })

// Step 2: Enrich with additional facets from admin
PipelineBuilder.create('enrich-from-admin')
    .extract('admin-enrichment', {
        adapterCode: 'csv',
        filePath: 'admin-facets.csv'
    })
    .load('add-facets', {
        adapterCode: 'productUpsert',
        strategy: 'UPDATE',
        facetValuesMode: 'MERGE',  // Add to existing facets
        assetsMode: 'SKIP'          // Don't touch images
    })
```

---

### Example 2: Order Migration with Line Management

```typescript
PipelineBuilder.create('migrate-legacy-orders')
    .extract('legacy-orders', {
        adapterCode: 'database',
        query: 'SELECT * FROM legacy_orders'
    })
    .transform('map-fields', {
        operators: [
            { op: 'copy', args: { source: 'order_id', target: 'code' } },
            { op: 'copy', args: { source: 'customer_email', target: 'customerEmail' } },
        ]
    })
    .load('create-orders', {
        adapterCode: 'orderUpsert',
        strategy: 'CREATE',
        codeField: 'code',
        linesMode: 'REPLACE_ALL',  // Complete order import
        stateField: 'finalState',
        orderPlacedAtField: 'originalDate'
    })
```

---

### Example 3: Incremental Product Updates

```typescript
// Daily price updates - don't touch anything else
PipelineBuilder.create('update-prices-daily')
    .extract('price-feed', {
        adapterCode: 'ftp',
        host: 'ftp.supplier.com',
        path: '/prices/daily.csv'
    })
    .load('update-prices', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        skuField: 'sku',
        priceField: 'newPrice',
        facetValuesMode: 'SKIP',  // Don't modify facets
        assetsMode: 'SKIP'         // Don't modify images
    })
```

---

## Troubleshooting

### "I'm still getting duplicates!"

**Check**:
1. Is the mode explicitly set? Defaults may not match your expectation
2. Using `MERGE` instead of `APPEND_ONLY`? MERGE deduplicates
3. For order lines: Using `MERGE_BY_SKU` instead of `APPEND_ONLY`?

**Solution**: Set explicit mode
```typescript
facetValuesMode: 'REPLACE_ALL'  // or MERGE, never APPEND_ONLY for facets
linesMode: 'MERGE_BY_SKU'       // for smart order line merging
```

---

### "My nested entities aren't updating"

**Check**:
1. Mode set to `SKIP`? Change to `REPLACE_ALL` or `MERGE`
2. Field name correct? (`linesField`, not `lineItems`)
3. Strategy allows updates? Must be `UPDATE` or `UPSERT`

**Solution**:
```typescript
.load('update-entity', {
    strategy: 'UPDATE',  // ← Allow updates
    facetValuesMode: 'MERGE',  // ← Not SKIP
    facetValueCodesField: 'facets'  // ← Correct field name
})
```

---

### "MERGE_BY_SKU isn't working for my order lines"

**Requirements**:
- Order must exist (use `UPDATE` or `UPSERT` strategy)
- SKU field must be correctly mapped
- Variants must exist in Vendure

**Correct configuration**:
```typescript
.load('update-order-lines', {
    adapterCode: 'orderUpsert',
    strategy: 'UPDATE',  // ← Order must exist
    codeField: 'orderCode',
    linesField: 'items',
    linesMode: 'MERGE_BY_SKU'
})
```

---

## Migration Guide

### Adding Explicit Modes to Existing Pipelines

**Step 1**: Update pipeline configuration with explicit modes

```typescript
// Without explicit mode
.load('import-products', {
    facetValueCodesField: 'facets'
})

// With explicit mode
.load('import-products', {
    facetValueCodesField: 'facets',
    facetValuesMode: 'REPLACE_ALL'  // ← Add this
})
```

**Step 2**: Test with dry run

```bash
npm run pipeline:run my-pipeline --dry-run
```

**Step 3**: Deploy to production

The default modes are chosen to be safe and match most use cases:
- `facetValuesMode` → `REPLACE_ALL`
- `linesMode` → `REPLACE_ALL`

---

## Related Documentation

- [Loaders Reference](../reference/loaders.md) - Complete API reference
- [Multi-Language Guide](./multi-language.md) - Translation handling
- [Multi-Channel Guide](./multi-channel.md) - Channel assignment
