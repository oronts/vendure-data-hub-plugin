# Multi-Channel Guide

Complete guide to multi-channel support in the Data Hub plugin.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Channel Creation and Configuration](#channel-creation-and-configuration)
4. [Product Assignment to Channels](#product-assignment-to-channels)
5. [Channel-Specific Pricing](#channel-specific-pricing)
6. [Channel Isolation](#channel-isolation)
7. [Supported Loaders](#supported-loaders)
8. [B2B Multi-Tenant Example](#b2b-multi-tenant-example)
9. [Advanced Patterns](#advanced-patterns)
10. [Common Pitfalls](#common-pitfalls)

---

## Introduction

### What Are Channels?

Channels in Vendure represent different storefronts, markets, or sales channels. Each channel can have:
- **Different languages** (e.g., German for DE market, English for UK)
- **Different currencies** (e.g., EUR for Europe, USD for USA)
- **Different tax configurations** (e.g., prices include VAT in EU)
- **Separate product catalogs** (channel isolation)
- **Independent shipping and payment methods**

### Use Cases

**Multi-Region Storefronts:**
```
├── web (B2C - Germany) → EUR, DE/EN, prices with tax
├── uk-store (B2C - UK) → GBP/EUR, EN, prices with tax
└── us-store (B2C - USA) → USD, EN, prices without tax
```

**B2B Multi-Tenant:**
```
├── default (Admin portal)
├── b2b-tenant-a (Company A) → Custom pricing, restricted catalog
├── b2b-tenant-b (Company B) → Custom pricing, different catalog
└── b2b-tenant-c (Company C) → Volume discounts, full catalog
```

**Multi-Brand:**
```
├── brand-luxury → Premium products, EUR/USD, EN/FR
├── brand-budget → Value products, EUR only, EN/DE
└── brand-outlet → Discounted items, all channels
```

---

## Quick Start

### Step 1: Create Channels

```typescript
import { PipelineBuilder } from '@oronts/vendure-plugin-data-hub';

const pipeline = PipelineBuilder.create('setup-channels')
    .extract('channel-data', {
        adapterCode: 'csv',
        csvPath: 'channels.csv'
    })
    .load('create-channels', {
        adapterCode: 'channelUpsert',
        codeField: 'code',
        nameField: 'name',
        defaultLanguageCodeField: 'defaultLanguage',
        availableLanguageCodesField: 'languages',
        defaultCurrencyCodeField: 'defaultCurrency',
        availableCurrencyCodesField: 'currencies'
    })
    .trigger('manual')
    .build();
```

**Data format (channels.csv):**
```csv
code,name,defaultLanguage,languages,defaultCurrency,currencies
web,Web Store,de,"de,en",EUR,"EUR,USD"
b2b,B2B Portal,de,"de,en",EUR,"EUR,CHF"
uk-store,UK Store,en,"en",GBP,"GBP,EUR"
```

### Step 2: Assign Products to Channels

```typescript
const pipeline = PipelineBuilder.create('import-products')
    .extract('product-data', {
        adapterCode: 'csv',
        csvPath: 'products.csv'
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        skuField: 'sku',
        nameField: 'name',
        channelsField: 'channels'  // ✅ Dynamic per-record channel assignment
    })
    .trigger('manual')
    .build();
```

**Data format (products.csv):**
```csv
sku,name,channels
PROD-001,Premium Widget,"web,b2b"
PROD-002,B2B Only Product,b2b
PROD-003,UK Exclusive,"uk-store"
```

---

## Channel Creation and Configuration

### Creating Channels via Pipeline

The `channelUpsert` loader creates or updates channels with full configuration support.

```typescript
.load('create-channels', {
    adapterCode: 'channelUpsert',

    // Lookup fields (choose one or more)
    codeField: 'code',           // Primary identifier
    tokenField: 'token',         // Alternative lookup

    // Language configuration
    defaultLanguageCodeField: 'defaultLanguage',       // Required: 2-letter code (e.g., "en")
    availableLanguageCodesField: 'languages',          // Array of language codes

    // Currency configuration
    defaultCurrencyCodeField: 'defaultCurrency',       // Required: 3-letter code (e.g., "EUR")
    availableCurrencyCodesField: 'currencies',         // Array of currency codes

    // Tax and shipping zones
    defaultTaxZoneCodeField: 'taxZone',               // Zone code/name
    defaultShippingZoneCodeField: 'shippingZone',     // Zone code/name

    // Tax display
    pricesIncludeTaxField: 'pricesIncludeTax',        // Boolean (true for EU, false for US)

    // Multi-vendor (optional)
    sellerIdField: 'sellerId',                        // For multi-vendor marketplaces

    // Custom fields
    customFieldsField: 'customFields',                // Object with custom field values

    strategy: 'UPSERT'  // CREATE, UPDATE, or UPSERT
})
```

### Channel Data Examples

**EU B2C Store:**
```json
{
    "code": "web-de",
    "token": "web_de_store_token",
    "defaultLanguage": "de",
    "languages": ["de", "en", "fr"],
    "defaultCurrency": "EUR",
    "currencies": ["EUR", "CHF"],
    "pricesIncludeTax": true,
    "taxZone": "EU",
    "shippingZone": "Europe"
}
```

**US B2C Store:**
```json
{
    "code": "web-us",
    "defaultLanguage": "en",
    "languages": ["en", "es"],
    "defaultCurrency": "USD",
    "currencies": ["USD"],
    "pricesIncludeTax": false,
    "taxZone": "US",
    "shippingZone": "North America"
}
```

**B2B Tenant Channel:**
```json
{
    "code": "b2b-acme-corp",
    "defaultLanguage": "en",
    "languages": ["en"],
    "defaultCurrency": "USD",
    "currencies": ["USD", "EUR"],
    "pricesIncludeTax": false,
    "sellerId": "12345",
    "customFields": {
        "accountManager": "john.doe@company.com",
        "contractNumber": "B2B-2024-001"
    }
}
```

### Channel Tokens

Channels have unique tokens for API requests. You can:

1. **Auto-generate** (recommended):
```json
{
    "code": "uk-store"
    // Token auto-generated: "ukstore_abc123"
}
```

2. **Provide custom token**:
```json
{
    "code": "uk-store",
    "token": "my_custom_token_12345"
}
```

Tokens are used in API requests:
```typescript
// GraphQL request with channel token
const headers = {
    'vendure-token': 'ukstore_abc123'
};
```

---

## Product Assignment to Channels

### Dynamic Per-Record Channel Assignment

The `channelsField` configuration option allows you to assign products to channels dynamically from source data.

**Supported in 8 loaders:**
- ✅ `productUpsert` - Products
- ✅ `variantUpsert` - Product variants
- ✅ `collectionUpsert` - Collections
- ✅ `facetUpsert` - Facets (not commonly used)
- ✅ `facetValueUpsert` - Facet values
- ✅ `promotionUpsert` - Promotions
- ✅ `paymentMethodUpsert` - Payment methods
- ✅ `shippingMethodUpsert` - Shipping methods

### Basic Usage

```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    skuField: 'sku',
    nameField: 'name',
    channelsField: 'channels'  // ← Record field containing channel codes
})
```

### Data Format Options

**1. Array of channel codes (recommended):**
```json
{
    "sku": "PROD-001",
    "name": "Premium Widget",
    "channels": ["web", "b2b", "uk-store"]
}
```

**2. Comma-separated string:**
```json
{
    "sku": "PROD-001",
    "name": "Premium Widget",
    "channels": "web,b2b,uk-store"
}
```

**3. Empty/null = no channel assignment:**
```json
{
    "sku": "PROD-001",
    "name": "Premium Widget",
    "channels": null  // Product not assigned to any additional channels
}
```

### Channel Assignment Behavior

**Important:** The `channelsField` **assigns** channels, it does not **replace** all channels.

```typescript
// Initial state: Product exists in "default" channel
// Record: { "channels": ["web", "b2b"] }
// Result: Product is now in ["default", "web", "b2b"]

// Note: The "default" channel assignment is typically managed by Vendure
// Additional channels are added via assignToChannels API
```

### Channel Code Resolution

The plugin automatically resolves channel codes to channel IDs:

```typescript
// Your data
{
    "channels": ["web", "b2b"]
}

// Plugin resolves internally:
// "web" → finds channel with code="web" → gets ID
// "b2b" → finds channel with code="b2b" → gets ID
// Then calls: channelService.assignToChannels(ctx, Product, productId, [webId, b2bId])
```

**Validation:**
- Invalid channel codes are logged as warnings and skipped
- Product import continues successfully even if some channel codes are invalid
- Check logs for channel assignment failures

---

## Channel-Specific Pricing

### Multi-Currency Pricing

Products and variants can have different prices for different currencies:

```typescript
.load('upsert-variants', {
    adapterCode: 'variantUpsert',
    skuField: 'sku',
    priceByCurrencyField: 'prices',  // ✅ Multi-currency pricing
    channelsField: 'channels'
})
```

**Data format:**
```json
{
    "sku": "VAR-001",
    "prices": {
        "EUR": 2990,   // €29.90 (in minor units)
        "USD": 3200,   // $32.00
        "GBP": 2650,   // £26.50
        "CHF": 2800    // CHF 28.00
    },
    "channels": ["web", "b2b", "uk-store"]
}
```

### How Channels Use Currencies

Each channel has a `defaultCurrencyCode` and `availableCurrencyCodes`:

```json
{
    "code": "web",
    "defaultCurrency": "EUR",
    "availableCurrencies": ["EUR", "USD"]
}
```

When a customer browses the "web" channel:
- **EUR** is shown by default
- **USD** is available via currency selector
- If product has both EUR and USD prices → customer can switch between them
- If product only has EUR price → only EUR is shown
- **GBP, CHF** prices are ignored (not available on this channel)

### Single-Currency Pricing (Legacy)

For simple use cases with one currency:

```typescript
.load('upsert-variants', {
    adapterCode: 'variantUpsert',
    skuField: 'sku',
    priceField: 'price',  // Single price in channel's default currency
    channelsField: 'channels'
})
```

**Data format:**
```json
{
    "sku": "VAR-001",
    "price": 2990,  // Uses channel's default currency (e.g., EUR)
    "channels": ["web"]
}
```

### Channel-Specific Price Lists

For true channel-specific pricing (different prices per channel, not just currency):

```typescript
// Option 1: Use custom fields
.load('upsert-variants', {
    skuField: 'sku',
    priceField: 'basePrice',
    customFieldsField: 'customFields',
    channelsField: 'channels'
})
```

```json
{
    "sku": "VAR-001",
    "basePrice": 2990,  // Web channel price
    "customFields": {
        "b2bPrice": 2500,      // B2B discounted price
        "vipPrice": 2200       // VIP customer price
    },
    "channels": ["web", "b2b"]
}
```

**Option 2: Separate variant records per channel:**
```json
[
    {
        "sku": "VAR-001-WEB",
        "productId": "PROD-001",
        "price": 2990,
        "channels": ["web"]
    },
    {
        "sku": "VAR-001-B2B",
        "productId": "PROD-001",
        "price": 2500,
        "channels": ["b2b"]
    }
]
```

---

## Channel Isolation

### What Is Channel Isolation?

**Channel isolation** means products assigned to one channel are **NOT visible** in other channels unless explicitly assigned.

```
Channel "web":     [PROD-001, PROD-002, PROD-003]
Channel "b2b":     [PROD-002, PROD-004]
Channel "uk-store": [PROD-001, PROD-003, PROD-005]

// PROD-004 is ONLY visible in "b2b" channel
// Customers on "web" or "uk-store" cannot see PROD-004
```

### Implementing Channel Isolation

**1. Create separate channels:**
```json
[
    { "code": "web", "name": "Public Web Store" },
    { "code": "b2b", "name": "B2B Portal" }
]
```

**2. Assign products to specific channels:**
```json
{
    "sku": "PUBLIC-001",
    "name": "Consumer Product",
    "channels": ["web"]  // ← Only visible in web channel
}
```

```json
{
    "sku": "B2B-001",
    "name": "Wholesale Product",
    "channels": ["b2b"]  // ← Only visible in b2b channel
}
```

```json
{
    "sku": "SHARED-001",
    "name": "Available Everywhere",
    "channels": ["web", "b2b"]  // ← Visible in both
}
```

### Verifying Channel Isolation

**API Request with channel token:**
```graphql
# Using "web" channel token
query {
    products {
        items {
            sku
            name
        }
    }
}

# Returns: PUBLIC-001, SHARED-001
# Does NOT return: B2B-001 (isolated to b2b channel)
```

```graphql
# Using "b2b" channel token
query {
    products {
        items {
            sku
            name
        }
    }
}

# Returns: B2B-001, SHARED-001
# Does NOT return: PUBLIC-001 (isolated to web channel)
```

### Channel Isolation for Other Entities

Channel isolation works for:
- ✅ **Products** - Separate catalogs per channel
- ✅ **Variants** - Channel-specific SKUs
- ✅ **Collections** - Different navigation per channel
- ✅ **Facets/FacetValues** - Channel-specific filters
- ✅ **Promotions** - Channel-exclusive discounts
- ✅ **Shipping Methods** - Different shipping per channel
- ✅ **Payment Methods** - Different payment options per channel

---

## Supported Loaders

### Full Channel Support

The following loaders support `channelsField` for dynamic per-record channel assignment:

#### 1. Product Loader (`productUpsert`)

```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    channelsField: 'channels',
    translationsField: 'translations'  // Multi-language + multi-channel
})
```

**Example:**
```json
{
    "sku": "PROD-001",
    "translations": {
        "de": { "name": "Produkt", "description": "Beschreibung" },
        "en": { "name": "Product", "description": "Description" }
    },
    "channels": ["web", "b2b"]
}
```

#### 2. Variant Loader (`variantUpsert`)

```typescript
.load('upsert-variants', {
    adapterCode: 'variantUpsert',
    channelsField: 'channels',
    priceByCurrencyField: 'prices'  // Multi-currency + multi-channel
})
```

**Example:**
```json
{
    "sku": "VAR-001",
    "prices": {
        "EUR": 2990,
        "USD": 3200
    },
    "channels": ["web", "uk-store"]
}
```

#### 3. Collection Loader (`collectionUpsert`)

```typescript
.load('upsert-collections', {
    adapterCode: 'collectionUpsert',
    channelsField: 'channels',
    translationsField: 'translations'
})
```

**Example:**
```json
{
    "slug": "electronics",
    "translations": {
        "de": { "name": "Elektronik", "description": "..." },
        "en": { "name": "Electronics", "description": "..." }
    },
    "channels": ["web"]
}
```

#### 4. Facet Value Loader (`facetValueUpsert`)

```typescript
.load('upsert-facet-values', {
    adapterCode: 'facetValueUpsert',
    channelsField: 'channels',
    translationsField: 'translations'
})
```

#### 5. Promotion Loader (`promotionUpsert`)

```typescript
.load('upsert-promotions', {
    adapterCode: 'promotionUpsert',
    channelsField: 'channels',
    translationsField: 'translations'
})
```

**Example - Channel-exclusive promotion:**
```json
{
    "code": "B2B-DISCOUNT-2024",
    "translations": {
        "en": {
            "name": "B2B Bulk Discount",
            "description": "10% off for orders over €1000"
        }
    },
    "channels": ["b2b"]  // ← Only visible in B2B channel
}
```

#### 6. Payment Method Loader (`paymentMethodUpsert`)

```typescript
.load('upsert-payment-methods', {
    adapterCode: 'paymentMethodUpsert',
    channelsField: 'channels'
})
```

**Example - Channel-specific payment:**
```json
{
    "code": "invoice-payment",
    "name": "Invoice Payment (NET30)",
    "channels": ["b2b"]  // ← Only available in B2B channel
}
```

#### 7. Shipping Method Loader (`shippingMethodUpsert`)

```typescript
.load('upsert-shipping-methods', {
    adapterCode: 'shippingMethodUpsert',
    channelsField: 'channels'
})
```

**Example - Channel-specific shipping:**
```json
{
    "code": "same-day-delivery",
    "name": "Same Day Delivery",
    "channels": ["web"]  // ← Only web channel (not B2B)
}
```

#### 8. Facet Loader (`facetUpsert`)

```typescript
.load('upsert-facets', {
    adapterCode: 'facetUpsert',
    channelsField: 'channels'
})
```

---

## B2B Multi-Tenant Example

### Scenario

You run a wholesale platform with multiple B2B customers. Each customer needs:
- **Isolated product catalog** (only see their assigned products)
- **Custom pricing** (negotiated prices per customer)
- **Separate branding** (custom channel name, logo)
- **Different languages and currencies** per market

### Implementation

#### Step 1: Create Tenant Channels

```typescript
const pipeline = PipelineBuilder.create('setup-b2b-tenants')
    .extract('tenant-data', {
        adapterCode: 'csv',
        csvPath: 'b2b-tenants.csv'
    })
    .load('create-tenant-channels', {
        adapterCode: 'channelUpsert',
        codeField: 'tenantCode',
        nameField: 'companyName',
        defaultLanguageCodeField: 'language',
        defaultCurrencyCodeField: 'currency',
        customFieldsField: 'customFields'
    })
    .trigger('manual')
    .build();
```

**Data (b2b-tenants.csv):**
```csv
tenantCode,companyName,language,currency,customFields
b2b-acme,ACME Corporation,en,USD,"{""accountManager"":""jane@company.com"",""discountTier"":""gold""}"
b2b-euro,EuroTech GmbH,de,EUR,"{""accountManager"":""hans@company.com"",""discountTier"":""silver""}"
b2b-asia,Asia Distributors,en,SGD,"{""accountManager"":""li@company.com"",""discountTier"":""platinum""}"
```

#### Step 2: Assign Products to Tenants

```typescript
const pipeline = PipelineBuilder.create('import-b2b-products')
    .extract('product-data', {
        adapterCode: 'csv',
        csvPath: 'b2b-products.csv'
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        skuField: 'sku',
        nameField: 'name',
        channelsField: 'assignedTenants',  // ← Tenant channel codes
        customFieldsField: 'customFields'
    })
    .trigger('manual')
    .build();
```

**Data (b2b-products.csv):**
```csv
sku,name,assignedTenants,customFields
PROD-SHARED,Universal Product,"b2b-acme,b2b-euro,b2b-asia","{""productLine"":""standard""}"
PROD-US-ONLY,US Market Exclusive,b2b-acme,"{""productLine"":""regional""}"
PROD-EU-ONLY,EU Market Exclusive,b2b-euro,"{""productLine"":""regional""}"
PROD-PREMIUM,Premium Product,"b2b-acme,b2b-asia","{""productLine"":""premium""}"
```

#### Step 3: Create Tenant-Specific Pricing

```typescript
const pipeline = PipelineBuilder.create('import-b2b-pricing')
    .extract('pricing-data', {
        adapterCode: 'csv',
        csvPath: 'b2b-pricing.csv'
    })
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        skuField: 'sku',
        priceField: 'basePrice',
        customFieldsField: 'tenantPricing',
        channelsField: 'channels'
    })
    .trigger('manual')
    .build();
```

**Data (b2b-pricing.csv):**
```csv
sku,basePrice,tenantPricing,channels
VAR-001,10000,"{""acmePrice"":9500,""euroPrice"":9000,""asiaPrice"":8500}","b2b-acme,b2b-euro,b2b-asia"
VAR-002,5000,"{""acmePrice"":4800,""euroPrice"":4500}","b2b-acme,b2b-euro"
```

**Interpretation:**
- `basePrice`: List price (USD $100.00, $50.00)
- `tenantPricing.acmePrice`: ACME's negotiated price (5% discount)
- `tenantPricing.euroPrice`: EuroTech's price (10% discount)
- `tenantPricing.asiaPrice`: Asia Distributors' price (15% discount - platinum tier)

#### Step 4: Verify Tenant Isolation

**ACME Corporation (b2b-acme channel):**
```graphql
# Using b2b-acme channel token
query {
    products {
        items {
            sku
            name
        }
    }
}

# Returns:
# - PROD-SHARED (visible to all)
# - PROD-US-ONLY (ACME exclusive)
# - PROD-PREMIUM (ACME + Asia)
# Does NOT return:
# - PROD-EU-ONLY (isolated to b2b-euro)
```

**EuroTech GmbH (b2b-euro channel):**
```graphql
# Using b2b-euro channel token
query {
    products {
        items {
            sku
            name
        }
    }
}

# Returns:
# - PROD-SHARED (visible to all)
# - PROD-EU-ONLY (EuroTech exclusive)
# Does NOT return:
# - PROD-US-ONLY (isolated to b2b-acme)
# - PROD-PREMIUM (isolated to b2b-acme + b2b-asia)
```

### Multi-Tenant Best Practices

1. **Channel Naming Convention:** Use consistent prefixes
   - ✅ `b2b-acme`, `b2b-euro`, `b2b-asia`
   - ❌ `acme`, `eurotech-channel`, `asia_distributors`

2. **Custom Fields for Tenant Metadata:**
   ```json
   {
       "accountManager": "jane@company.com",
       "discountTier": "gold",
       "contractNumber": "B2B-2024-001",
       "paymentTerms": "NET30"
   }
   ```

3. **Use Promotions for Tenant Discounts:**
   ```typescript
   .load('upsert-promotions', {
       codeField: 'code',
       channelsField: 'channels'
   })
   ```
   ```json
   {
       "code": "ACME-GOLD-2024",
       "conditions": [{ "code": "minimumOrderAmount", "args": { "amount": 100000 } }],
       "actions": [{ "code": "orderPercentageDiscount", "args": { "discount": 15 } }],
       "channels": ["b2b-acme"]
   }
   ```

4. **Separate Shipping Methods:**
   ```json
   {
       "code": "freight-shipping",
       "name": "Freight Delivery (Pallet)",
       "channels": ["b2b-acme", "b2b-euro", "b2b-asia"]
   }
   ```

5. **Tenant-Specific Payment Methods:**
   ```json
   {
       "code": "invoice-net30",
       "name": "Invoice Payment (NET30)",
       "channels": ["b2b-acme", "b2b-euro"]  // Only approved tenants
   }
   ```

---

## Advanced Patterns

### Pattern 1: Dynamic Channel Assignment via Transform

Assign channels based on product attributes:

```typescript
const pipeline = PipelineBuilder.create('smart-channel-assignment')
    .extract('product-data', {
        adapterCode: 'csv',
        csvPath: 'products.csv'
    })
    .transform('assign-channels', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Logic: Premium products → all channels
                        //        Budget products → web only
                        //        Wholesale products → b2b only

                        if (record.priceRange === 'premium') {
                            record.channels = ['web', 'b2b', 'uk-store'];
                        } else if (record.category === 'wholesale') {
                            record.channels = ['b2b'];
                        } else {
                            record.channels = ['web'];
                        }

                        return record;
                    `
                }
            }
        ]
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        channelsField: 'channels'
    })
    .trigger('manual')
    .build();
```

### Pattern 2: Channel Migration

Move products from one channel to another:

```typescript
// Extract from old channel
.extract('products-from-old-channel', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',
    filter: { channelId: { eq: 'old-channel-id' } }
})
// Transform to add new channel
.transform('add-new-channel', {
    operators: [
        {
            op: 'addField',
            args: {
                field: 'channels',
                value: 'new-channel-code'
            }
        }
    ]
})
// Load with new channel assignment
.load('migrate-products', {
    adapterCode: 'productUpsert',
    channelsField: 'channels'
})
```

### Pattern 3: Conditional Channel Assignment

Assign channels based on external API or database lookup:

```typescript
.transform('lookup-channel-mapping', {
    operators: [
        {
            op: 'enrichHttp',
            args: {
                url: 'https://api.company.com/channel-mapping',
                lookupField: 'productCategory',
                responseMapping: {
                    channels: 'data.assignedChannels'
                }
            }
        }
    ]
})
.load('upsert-products', {
    channelsField: 'channels'
})
```

### Pattern 4: Multi-Region Channel Setup

Create channels for multiple regions with standardized configuration:

```typescript
const regions = [
    { code: 'eu-de', lang: 'de', currency: 'EUR', tax: true },
    { code: 'eu-fr', lang: 'fr', currency: 'EUR', tax: true },
    { code: 'us-east', lang: 'en', currency: 'USD', tax: false },
    { code: 'uk', lang: 'en', currency: 'GBP', tax: true },
];

.extract('region-channels', {
    adapterCode: 'csv',
    rows: regions.map(r => ({
        code: r.code,
        defaultLanguage: r.lang,
        defaultCurrency: r.currency,
        pricesIncludeTax: r.tax
    }))
})
.load('create-channels', {
    adapterCode: 'channelUpsert',
    codeField: 'code',
    defaultLanguageCodeField: 'defaultLanguage',
    defaultCurrencyCodeField: 'defaultCurrency',
    pricesIncludeTaxField: 'pricesIncludeTax'
})
```

---

## Common Pitfalls

### ❌ Pitfall 1: Forgetting Channel Assignment

**Problem:**
```json
{
    "sku": "PROD-001",
    "name": "Product Name"
    // No channels field → product not assigned to any additional channels
}
```

**Solution:**
```json
{
    "sku": "PROD-001",
    "name": "Product Name",
    "channels": ["web", "b2b"]  // ✅ Explicit channel assignment
}
```

### ❌ Pitfall 2: Invalid Channel Codes

**Problem:**
```json
{
    "channels": ["web", "nonexistent-channel"]
}
```

**Result:**
- Plugin logs warning: `Channel code "nonexistent-channel" not found — skipped`
- Product is assigned to "web" channel only
- Import continues (no error)

**Solution:**
- Validate channel codes exist before import
- Check pipeline logs for warnings

### ❌ Pitfall 3: Mixing Channel and Currency Concepts

**Wrong assumption:** "Each channel has one currency"

**Reality:** Channels support **multiple currencies**:
```json
{
    "code": "web",
    "defaultCurrency": "EUR",
    "availableCurrencies": ["EUR", "USD", "GBP"]  // ← Supports 3 currencies
}
```

Customers on "web" channel can switch between EUR/USD/GBP if product has all 3 prices.

### ❌ Pitfall 4: Expecting channelsField to Remove Channels

**Problem:**
```typescript
// Record 1: { "channels": ["web", "b2b"] }  → Assigns to web + b2b
// Record 2: { "channels": ["web"] }         → Assigns to web
// Expected: Remove from b2b
// Actual: Still in web + b2b (assignment is additive, not replacement)
```

**Solution:**
If you need to remove channels, use Vendure Admin UI or GraphQL mutation directly:
```graphql
mutation {
    removeProductsFromChannel(input: {
        productIds: ["123"],
        channelId: "b2b-channel-id"
    }) {
        id
    }
}
```

### ❌ Pitfall 5: Channel-Specific Fields Without channelsField

**Problem:**
```json
{
    "sku": "VAR-001",
    "priceByCurrency": {
        "EUR": 2990,
        "GBP": 2650  // ← Channel-specific currency
    }
    // Missing: "channels": ["web", "uk-store"]
}
```

**Result:**
- Variant has EUR and GBP prices
- But may not be assigned to uk-store channel
- GBP price exists but product is not visible in uk-store

**Solution:**
```json
{
    "sku": "VAR-001",
    "priceByCurrency": {
        "EUR": 2990,
        "GBP": 2650
    },
    "channels": ["web", "uk-store"]  // ✅ Assign to both channels
}
```

### ❌ Pitfall 6: Using Wrong Field Name

**Problem:**
```typescript
.load('upsert-products', {
    channelsField: 'channelCodes'  // ← Field name in your data
})
```

```json
{
    "channels": ["web", "b2b"]  // ❌ Wrong field (doesn't match config)
}
```

**Solution:**
Match your data structure to the config:
```json
{
    "channelCodes": ["web", "b2b"]  // ✅ Matches channelsField config
}
```

Or use standard field name:
```typescript
.load('upsert-products', {
    channelsField: 'channels'  // ← Standard name
})
```

### ❌ Pitfall 7: Channel Isolation Not Working

**Problem:** "I assigned product to 'b2b' channel but it's still visible in 'web' channel"

**Cause:** Product was **already assigned** to "web" channel before

**Understanding:**
```
Initial state: Product in ["default", "web"]
Add channels: ["b2b"]
Final state: Product in ["default", "web", "b2b"]  ← Still in web!
```

**Solution:**
1. Check existing channel assignments in Vendure Admin
2. Manually remove from unwanted channels via Admin UI
3. Then use pipeline to assign to desired channels

---

## Next Steps

- **Multi-Language Guide:** [multi-language.md](./multi-language.md) - Combine channels with translations
- **Multi-Currency Guide:** [multi-currency.md](./multi-currency.md) - Advanced currency handling per channel
- **Loader Reference:** [loaders.md](../reference/loaders.md) - Full loader documentation
- **Pipeline Examples:** [examples/](../examples/) - Real-world pipeline examples

---

## Need Help?

- **Issue Tracker:** [GitHub Issues](https://github.com/oronts/vendure-plugin-data-hub/issues)
- **Documentation:** [Full Documentation](../README.md)
- **Vendure Channels:** [Vendure Channels Guide](https://docs.vendure.io/guides/core-concepts/channels/)
