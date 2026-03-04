# Multi-Currency Guide

Complete guide to multi-currency pricing in the Data Hub plugin.

---

## Introduction

### What is Multi-Currency Support?

Multi-currency support allows you to define different prices for products and variants across multiple currencies:
- **Single-currency mode** - One price for all channels (simple, common)
- **Multi-currency mode** - Different prices per currency (international stores)
- **Channel-based** - Each channel has its own currency settings
- **Price updates** - Update prices without modifying other product fields

### The Problem

**Before discovering `priceByCurrencyField`**, users only knew about single-currency pricing:

```typescript
// BEFORE: Single currency only
.load('import-products', {
    priceField: 'price'  // One price for all channels
})

// Input data:
{ name: 'T-Shirt', price: 29.99 }

// Result: All channels get USD $29.99 (or whatever the channel's currency is)
// European customers pay €29.99 (incorrect conversion!)
```

### The Solution

**Multi-currency fields** let you specify different prices for each currency:

```typescript
// AFTER: Multi-currency support
.load('import-products', {
    priceByCurrencyField: 'prices'  // ← Different price per currency
})

// Input data:
{
    name: 'T-Shirt',
    prices: {
        USD: 29.99,
        EUR: 24.99,
        GBP: 21.99
    }
}

// Result:
// - US channel: $29.99
// - EU channel: €24.99
// - UK channel: £21.99
```

---

## Channel-Currency Relationship

### How Channels & Currencies Work Together

Channels define which currencies are available:

```typescript
// Channel configuration determines valid currencies
const usChannel = {
    code: 'us-channel',
    defaultCurrencyCode: 'USD',
    availableCurrencyCodes: ['USD']
}

const euChannel = {
    code: 'eu-channel',
    defaultCurrencyCode: 'EUR',
    availableCurrencyCodes: ['EUR', 'GBP', 'CHF']  // Multi-currency channel
}
```

### Setting Up Multi-Currency Channels

Use the Channel loader to configure currency support:

```typescript
// Create multi-currency channel
.load('create-channels', {
    adapterCode: 'channelUpsert',
    codeField: 'code',
    defaultCurrencyCodeField: 'defaultCurrency',
    availableCurrencyCodesField: 'currencies'
})

// Input data:
[
    {
        code: 'us-store',
        defaultCurrency: 'USD',
        currencies: ['USD']
    },
    {
        code: 'eu-store',
        defaultCurrency: 'EUR',
        currencies: ['EUR', 'GBP', 'CHF']  // Supports 3 currencies
    }
]
```

**Available fields in Channel loader:**
- `defaultCurrencyCodeField` - Primary currency for the channel
- `availableCurrencyCodesField` - Array of supported currencies
- `defaultLanguageCodeField` - Primary language
- `availableLanguageCodesField` - Array of supported languages

---

## Product Pricing

### Single-Currency Pricing (Simple)

For stores with one currency, use `priceField`:

```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    nameField: 'name',
    priceField: 'price',  // ← Single price value
    skuField: 'sku'
})

// CSV input:
// name,sku,price
// T-Shirt,TSH-001,29.99
// Jeans,JNS-001,59.99

// Result: All products get the same numeric price
```

**How it works:**
1. Price is converted to minor units (cents): `29.99 → 2999`
2. Applied to variant with channel's currency
3. Displayed as `$29.99` in USD channel or `€29.99` in EUR channel

**Use when:**
- You only sell in one currency
- All channels use the same currency
- You handle currency conversion externally

---

### Multi-Currency Pricing (International)

For international stores, use `priceByCurrencyField`:

```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    nameField: 'name',
    priceByCurrencyField: 'prices',  // ← Object with currency→price mapping
    skuField: 'sku'
})

// JSON input:
[
    {
        name: 'Premium T-Shirt',
        sku: 'TSH-PREM-001',
        prices: {
            USD: 29.99,
            EUR: 24.99,
            GBP: 21.99,
            JPY: 3200
        }
    },
    {
        name: 'Designer Jeans',
        sku: 'JNS-DSGN-001',
        prices: {
            USD: 89.99,
            EUR: 74.99,
            GBP: 64.99,
            JPY: 9800
        }
    }
]
```

**Multi-currency object format:**
```typescript
prices: {
    [currencyCode: string]: number
}

// Examples:
{ EUR: 29.99, USD: 34.99 }
{ GBP: 19.99, EUR: 23.99, USD: 27.99 }
{ JPY: 3500, USD: 29.99 }  // JPY has no decimals
```

**How it works:**
1. Plugin converts each price to minor units
2. Creates price entry for each currency
3. Vendure automatically selects correct price based on channel's currency
4. If currency missing for a channel, Vendure falls back to default behavior

**Use when:**
- You sell in multiple countries
- You set prices manually per market (no automatic conversion)
- Different pricing strategies per region (e.g., EU includes VAT, US doesn't)

---

### CSV Multi-Currency Format

For CSV imports, use JSON-encoded objects:

```csv
name,sku,prices
Basic T-Shirt,TSH-001,"{""USD"": 29.99, ""EUR"": 24.99, ""GBP"": 21.99}"
Premium Hoodie,HDI-001,"{""USD"": 59.99, ""EUR"": 49.99, ""GBP"": 44.99}"
```

**Pipeline configuration:**
```typescript
.extract('csv-file', {
    filePath: '/data/products.csv'
})
.transform('parse-json-fields', {
    fields: 'prices'  // Parse JSON string to object
})
.load('import-products', {
    priceByCurrencyField: 'prices'
})
```

---

## Variant Pricing

Variants support the same single/multi-currency pattern:

### Single-Currency Variant

```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    skuField: 'sku',
    nameField: 'name',
    priceField: 'price'  // ← Single price
})

// Input:
{ sku: 'TSH-S-RED', name: 'Small Red T-Shirt', price: 29.99 }
```

### Multi-Currency Variant

```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    skuField: 'sku',
    nameField: 'name',
    priceByCurrencyField: 'prices'  // ← Multiple currencies
})

// Input:
{
    sku: 'TSH-S-RED',
    name: 'Small Red T-Shirt',
    prices: {
        USD: 29.99,
        EUR: 24.99,
        GBP: 21.99
    }
}
```

**Available fields:**
- **Product loader**: `priceField` OR `priceByCurrencyField`
- **Variant loader**: `priceField` OR `priceByCurrencyField`

---

## Currency Conversion Strategies

### Manual Pricing (Recommended)

Set prices manually per currency based on market conditions:

```typescript
// Input data with manual prices
{
    name: 'Product A',
    sku: 'PROD-A',
    prices: {
        USD: 99.99,    // US market
        EUR: 84.99,    // EU market (includes VAT)
        GBP: 74.99,    // UK market (competitive pricing)
        JPY: 11000     // Japan market (rounded to nearest 100)
    }
}
```

**Advantages:**
- Full control over pricing per market
- Can account for VAT differences
- Market-specific pricing strategies
- Psychological pricing (e.g., .99 endings)

**Use when:**
- You have dedicated pricing teams per region
- Tax/VAT varies significantly
- Competitive pricing differs by market

---

### Automatic Conversion

Use TRANSFORM operators to calculate prices from a base currency:

```typescript
.extract('database', { query: 'SELECT * FROM products' })
.transform('calculate-fields', {
    calculations: {
        'prices.EUR': 'price * 0.85',     // EUR = USD × 0.85
        'prices.GBP': 'price * 0.73',     // GBP = USD × 0.73
        'prices.JPY': 'price * 110'       // JPY = USD × 110
    }
})
.load('import-products', {
    priceByCurrencyField: 'prices'
})
```

**Real-time conversion with ENRICH step:**

```typescript
.extract('csv-file', { filePath: '/data/products.csv' })
.enrich('http-lookup', {
    url: 'https://api.exchangerate.host/latest?base=USD',
    responseField: 'rates',
    targetField: 'exchangeRates'
})
.transform('calculate-fields', {
    calculations: {
        'prices.EUR': 'price * exchangeRates.EUR',
        'prices.GBP': 'price * exchangeRates.GBP',
        'prices.JPY': 'price * exchangeRates.JPY'
    }
})
.load('import-products', {
    priceByCurrencyField: 'prices'
})
```

**Advantages:**
- Consistent pricing based on exchange rates
- Automatic updates when base price changes
- Less manual work

**Disadvantages:**
- Doesn't account for VAT differences
- May result in odd prices (e.g., €24.73 instead of €24.99)
- Ignores market-specific strategies

---

## Price Update Workflows

### Update Prices Only (Don't Touch Product Data)

Use `UPDATE` strategy with price fields only:

```typescript
// Pipeline that ONLY updates prices (doesn't modify name, description, etc.)
.extract('csv-file', { filePath: '/data/price-updates.csv' })
.load('update-prices', {
    adapterCode: 'productUpsert',
    strategy: 'UPDATE',  // ← Only update existing products
    slugField: 'slug',
    priceByCurrencyField: 'newPrices',  // ← Only price field configured
    // Intentionally NO nameField, descriptionField, etc.
})

// Input CSV:
// slug,newPrices
// basic-tshirt,"{""USD"": 24.99, ""EUR"": 19.99}"
// premium-hoodie,"{""USD"": 54.99, ""EUR"": 44.99}"

// Result:
// - Prices updated for all currencies
// - Name, description, facets, assets unchanged ✅
```

**How it works:**
1. `strategy: 'UPDATE'` → only existing products are modified
2. Only `slugField` and `priceByCurrencyField` configured
3. ProductHandler only updates configured fields
4. All other fields (name, description, etc.) remain unchanged

**Use cases:**
- Daily price sync from pricing system
- Seasonal price adjustments
- Promotional pricing
- Currency fluctuation updates

---

### Bulk Price Updates Across Channels

Update prices for specific channels only:

```typescript
// Update US channel prices only
.load('update-us-prices', {
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',
    channel: 'us-channel',  // ← Target specific channel
    skuField: 'sku',
    priceField: 'newPrice'  // Single currency for this channel
})

// Input:
// sku,newPrice
// TSH-001,34.99
// JNS-001,69.99

// Result: Only US channel prices updated, EU/UK unchanged
```

---

### Scheduled Price Changes

Combine with SCHEDULE trigger for automatic updates:

```typescript
const pipeline = {
    name: 'Daily Price Sync',
    trigger: {
        type: 'SCHEDULE',
        cron: '0 2 * * *'  // 2 AM daily
    },
    steps: [
        {
            type: 'EXTRACT',
            adapterCode: 'databaseExtract',
            config: {
                query: `
                    SELECT sku, usd_price, eur_price, gbp_price
                    FROM pricing_updates
                    WHERE updated_at > NOW() - INTERVAL '1 DAY'
                `
            }
        },
        {
            type: 'TRANSFORM',
            adapterCode: 'mapFields',
            config: {
                mappings: {
                    'prices.USD': 'usd_price',
                    'prices.EUR': 'eur_price',
                    'prices.GBP': 'gbp_price'
                }
            }
        },
        {
            type: 'LOAD',
            adapterCode: 'variantUpsert',
            config: {
                strategy: 'UPDATE',
                skuField: 'sku',
                priceByCurrencyField: 'prices'
            }
        }
    ]
};
```

---

## Integration Examples

### Example 1: PIM Import with Multi-Currency

```typescript
// Import products from PIM with international pricing
.extract('rest-api', {
    url: 'https://pim.example.com/api/products',
    auth: { type: 'API_KEY', apiKey: 'secret' }
})
.transform('map-fields', {
    mappings: {
        name: 'product_name',
        slug: 'product_slug',
        sku: 'sku_code',
        'prices.USD': 'price_us',
        'prices.EUR': 'price_eu',
        'prices.GBP': 'price_uk',
        'prices.JPY': 'price_jp'
    }
})
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    priceByCurrencyField: 'prices'
})
```

**PIM API response:**
```json
[
    {
        "product_name": "Wireless Mouse",
        "product_slug": "wireless-mouse",
        "sku_code": "MOUSE-W-001",
        "price_us": 29.99,
        "price_eu": 24.99,
        "price_uk": 21.99,
        "price_jp": 3200
    }
]
```

---

### Example 2: ERP Price Sync

```typescript
// Daily price sync from ERP system
.extract('database', {
    type: 'MSSQL',
    query: `
        SELECT
            ProductSKU,
            USDPrice,
            EURPrice,
            GBPPrice,
            LastModified
        FROM PricingMaster
        WHERE LastModified >= DATEADD(day, -1, GETDATE())
    `
})
.transform('calculate-fields', {
    calculations: {
        'prices.USD': 'USDPrice',
        'prices.EUR': 'EURPrice',
        'prices.GBP': 'GBPPrice'
    }
})
.load('sync-prices', {
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',  // Only update existing variants
    skuField: 'ProductSKU',
    priceByCurrencyField: 'prices'
})
```

---

### Example 3: Multi-Currency + Multi-Channel

```typescript
// Import with both multi-currency AND multi-channel support
.extract('csv-file', { filePath: '/data/products.csv' })
.load('import-products', {
    adapterCode: 'productUpsert',
    nameField: 'name',
    priceByCurrencyField: 'prices',  // ← Multi-currency
    channelsField: 'channels',        // ← Multi-channel
    translationsField: 'translations' // ← Multi-language
})

// Input data:
{
    name: 'Global Product',
    prices: {
        USD: 99.99,
        EUR: 84.99,
        GBP: 74.99
    },
    channels: ['us-store', 'eu-store', 'uk-store'],
    translations: [
        { languageCode: 'en', name: 'Global Product' },
        { languageCode: 'de', name: 'Globales Produkt' },
        { languageCode: 'fr', name: 'Produit Mondial' }
    ]
}

// Result:
// - Available in 3 channels
// - Correct price per channel's currency
// - Translated name per channel's language
```

---

## Complete Field Reference

### Product Loader

| Field | Type | Description |
|-------|------|-------------|
| `priceField` | `string \| number` | Single price for variant (converted to channel currency) |
| `priceByCurrencyField` | `Record<string, number>` | Multi-currency prices `{ USD: 29.99, EUR: 24.99 }` |
| `nameField` | `string` | Product name |
| `slugField` | `string` | Product slug (unique identifier) |
| `skuField` | `string` | Variant SKU |
| `channelsField` | `string[] \| string` | Array of channel codes |
| `translationsField` | `Array` | Multi-language translations |
| `strategy` | `'CREATE' \| 'UPDATE' \| 'UPSERT'` | Load strategy |

### Variant Loader

| Field | Type | Description |
|-------|------|-------------|
| `priceField` | `string \| number` | Single price for variant |
| `priceByCurrencyField` | `Record<string, number>` | Multi-currency prices |
| `skuField` | `string` | Variant SKU (unique identifier) |
| `nameField` | `string` | Variant name |
| `productSlug` | `string` | Parent product slug (for variant creation) |
| `channelsField` | `string[] \| string` | Array of channel codes |
| `strategy` | `'CREATE' \| 'UPDATE' \| 'UPSERT'` | Load strategy |

### Channel Loader

| Field | Type | Description |
|-------|------|-------------|
| `codeField` | `string` | Channel code (unique identifier) |
| `defaultCurrencyCodeField` | `CurrencyCode` | Primary currency (e.g., 'USD', 'EUR') |
| `availableCurrencyCodesField` | `CurrencyCode[]` | Supported currencies `['EUR', 'GBP', 'CHF']` |
| `defaultLanguageCodeField` | `LanguageCode` | Primary language (e.g., 'en', 'de') |
| `availableLanguageCodesField` | `LanguageCode[]` | Supported languages |
| `pricesIncludeTaxField` | `boolean` | Whether displayed prices include tax |

---

## Best Practices

### 1. Choose the Right Field

```typescript
// ✅ GOOD: Multi-currency for international stores
.load('import-products', {
    priceByCurrencyField: 'prices'
})

// ❌ BAD: Single-currency when you have multi-currency data
.load('import-products', {
    priceField: 'price'  // Loses currency-specific pricing!
})
```

### 2. Always Include All Active Currencies

```typescript
// ✅ GOOD: All channel currencies included
prices: {
    USD: 99.99,
    EUR: 84.99,
    GBP: 74.99
}

// ❌ BAD: Missing EUR (EU channel gets fallback price)
prices: {
    USD: 99.99,
    GBP: 74.99
    // EUR missing!
}
```

### 3. Use UPDATE Strategy for Price-Only Changes

```typescript
// ✅ GOOD: Only price field configured
.load('update-prices', {
    strategy: 'UPDATE',
    priceByCurrencyField: 'prices'
    // No nameField, descriptionField, etc.
})

// ❌ BAD: UPSERT with all fields (might overwrite manual changes)
.load('update-prices', {
    strategy: 'UPSERT',
    nameField: 'name',
    descriptionField: 'description',
    priceByCurrencyField: 'prices'  // Risk of data loss!
})
```

### 4. Handle Missing Currencies Gracefully

```typescript
// Validate currency data before loading
.validate('check-required', {
    rules: [
        { field: 'prices.USD', required: true },
        { field: 'prices.EUR', required: true },
        { field: 'prices.GBP', required: true }
    ]
})
.load('import-products', {
    priceByCurrencyField: 'prices'
})
```

### 5. Minor Units Conversion is Automatic

```typescript
// You provide decimal prices
prices: { USD: 29.99, EUR: 24.99 }

// Plugin automatically converts to minor units (cents)
// USD: 2999, EUR: 2499

// ❌ DON'T manually convert
prices: { USD: 2999, EUR: 2499 }  // Will become $29.99 → $2,999.00!
```

### 6. Test with Dry Run

```typescript
// Test multi-currency pricing before production
const pipeline = {
    name: 'Test Multi-Currency',
    dryRun: true,  // ← Simulate without changes
    steps: [
        // ... your steps
    ]
};

// Check logs to verify currency prices are correct
```

---

## Troubleshooting

### Wrong Prices in Specific Channels

**Problem**: US channel shows €24.99 instead of $29.99

**Solution**: Verify channel currency configuration

```typescript
// Check channel setup
.load('verify-channels', {
    adapterCode: 'channelUpsert',
    defaultCurrencyCodeField: 'currency'
})

// Ensure it matches your price data
{ code: 'us-store', currency: 'USD' }  // Should be USD, not EUR
```

---

### Prices Not Updating

**Problem**: Running price sync pipeline but prices unchanged

**Solutions:**

1. **Wrong strategy**
```typescript
// ✅ Use UPDATE to modify existing products
strategy: 'UPDATE'

// ❌ CREATE won't update existing
strategy: 'CREATE'
```

2. **Wrong identifier field**
```typescript
// ✅ Match by slug for products
slugField: 'product_slug'

// ✅ Match by SKU for variants
skuField: 'variant_sku'

// ❌ Missing identifier
// (neither slugField nor skuField configured)
```

---

### Currency Conversion Errors

**Problem**: Prices too high/low after import

**Solution**: Check decimal vs. minor units

```typescript
// ✅ CORRECT: Provide decimal prices
{ USD: 29.99, EUR: 24.99 }
// Plugin converts: 29.99 → 2999 cents

// ❌ WRONG: Providing minor units
{ USD: 2999, EUR: 2499 }
// Plugin converts: 2999 → 299900 cents ($2,999.00!)
```

---

### Missing Currencies

**Problem**: Some currencies not appearing in Admin UI

**Cause**: Channel doesn't list currency in `availableCurrencyCodes`

**Solution**: Update channel configuration

```typescript
.load('add-currency', {
    adapterCode: 'channelUpsert',
    strategy: 'UPDATE',
    codeField: 'code',
    availableCurrencyCodesField: 'currencies'
})

// Input:
{ code: 'eu-store', currencies: ['EUR', 'GBP', 'CHF'] }
```

---

## Summary

### Key Concepts

1. **Two pricing modes**: `priceField` (single) vs `priceByCurrencyField` (multi)
2. **Channel configuration**: Channels define available currencies
3. **Automatic conversion**: Plugin converts decimal → minor units
4. **Price-only updates**: Use `UPDATE` strategy with only price field
5. **Works with both loaders**: Product and Variant loaders support both modes

### When to Use Each Mode

| Scenario | Field to Use | Example |
|----------|-------------|---------|
| Single-currency store | `priceField` | US-only store with USD |
| International store | `priceByCurrencyField` | EU + UK + US with 3 currencies |
| Price sync only | `priceByCurrencyField` + `strategy: 'UPDATE'` | Daily ERP price updates |
| Auto conversion | `priceField` + TRANSFORM operators | Calculate from base USD |
| Manual per market | `priceByCurrencyField` | Different pricing strategies |

### Quick Start Template

```typescript
// Complete multi-currency pipeline
.extract('csv-file', {
    filePath: '/data/international-products.csv'
})
.transform('parse-json-fields', {
    fields: 'prices'  // Parse JSON string to object
})
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    nameField: 'name',
    slugField: 'slug',
    skuField: 'sku',
    priceByCurrencyField: 'prices',  // ← Multi-currency pricing
    channelsField: 'channels'         // ← Multi-channel assignment
})

// CSV format:
// name,slug,sku,prices,channels
// "T-Shirt","tshirt","TSH-001","{""USD"": 29.99, ""EUR"": 24.99}","us-store,eu-store"
```

---

## Related Guides

- [Multi-Channel Guide](./multi-channel.md) - Channel assignment and management
- [Multi-Language Guide](./multi-language.md) - Translations and language support
- [Multi-Entity Mode Guide](./multi-entity.md) - Complex nested entity handling
- [Loader Reference](../reference/loaders.md) - Complete loader field documentation
