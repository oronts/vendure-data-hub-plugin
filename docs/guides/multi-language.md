# Multi-Language Import/Export Guide

Complete guide to importing and exporting multi-language data in the Data Hub plugin.

---

## Quick Start

Import products in multiple languages (English and German):

```typescript
datahub.pipeline('import-products-multilang')
  .extract('csv', {
    path: '/data/products-multilang.csv'
  })
  .load('product', {
    nameField: 'name_en',
    slugField: 'slug_en',
    translationsField: 'translations'  // ← Magic field for multi-language
  })
  .run();
```

**CSV Data Format**:
```csv
name_en,slug_en,translations
"Premium Widget","premium-widget","{""de"":{""name"":""Premium-Widget"",""slug"":""premium-widget"",""description"":""Hochwertige Qualität""},""en"":{""name"":""Premium Widget"",""slug"":""premium-widget"",""description"":""High quality""}}"
```

**Or JSON format** (cleaner):
```json
{
  "name_en": "Premium Widget",
  "slug_en": "premium-widget",
  "translations": {
    "de": {
      "name": "Premium-Widget",
      "slug": "premium-widget",
      "description": "Hochwertige Qualität"
    },
    "en": {
      "name": "Premium Widget",
      "slug": "premium-widget",
      "description": "High quality"
    }
  }
}
```

✅ **One pipeline handles ALL languages** - no need for separate imports per language!

---

## Supported Entities

The `translationsField` configuration is available for the following 8 loaders:

### 1. Product Loader

**Translatable Fields**: `name`, `slug`, `description`

```typescript
.load('product', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "translations": {
    "de": {
      "name": "Premium-Widget",
      "slug": "premium-widget",
      "description": "Hochwertige Qualität"
    },
    "en": {
      "name": "Premium Widget",
      "slug": "premium-widget",
      "description": "High quality"
    },
    "fr": {
      "name": "Widget Premium",
      "slug": "widget-premium",
      "description": "Haute qualité"
    }
  }
}
```

**Fallback Behavior**:
- If `translationsField` is NOT set, the loader uses `nameField`, `slugField`, `descriptionField` to create a SINGLE translation in the current request context language
- If `translationsField` IS set AND translations are missing `name`/`slug`, the loader falls back to the top-level `nameField`/`slugField` values for the first translation

---

### 2. Variant Loader

**Translatable Fields**: `name`

```typescript
.load('variant', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "sku": "WIDGET-001",
  "price": 99.99,
  "translations": {
    "de": { "name": "Premium-Widget (klein)" },
    "en": { "name": "Premium Widget (small)" },
    "fr": { "name": "Widget Premium (petit)" }
  }
}
```

**Fallback**: If `name` is missing in translations, uses top-level `nameField` value.

---

### 3. Collection Loader

**Translatable Fields**: `name`, `slug`, `description`

```typescript
.load('collection', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "translations": {
    "de": {
      "name": "Elektronik",
      "slug": "elektronik",
      "description": "Alle elektronischen Produkte"
    },
    "en": {
      "name": "Electronics",
      "slug": "electronics",
      "description": "All electronic products"
    }
  }
}
```

---

### 4. Facet Loader

**Translatable Fields**: `name`

```typescript
.load('facet', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "code": "brand",
  "translations": {
    "de": { "name": "Marke" },
    "en": { "name": "Brand" },
    "fr": { "name": "Marque" }
  }
}
```

**Fallback**: If translations are missing, uses top-level `nameField` (defaults to `code` if name is missing).

---

### 5. FacetValue Loader

**Translatable Fields**: `name`

```typescript
.load('facet-value', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "facetCode": "brand",
  "code": "acme",
  "translations": {
    "de": { "name": "ACME GmbH" },
    "en": { "name": "ACME Corp" },
    "fr": { "name": "ACME SA" }
  }
}
```

---

### 6. Promotion Loader

**Translatable Fields**: `name`, `description`

```typescript
.load('promotion', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "code": "SUMMER2024",
  "translations": {
    "de": {
      "name": "Sommeraktion 2024",
      "description": "20% Rabatt auf alle Artikel"
    },
    "en": {
      "name": "Summer Sale 2024",
      "description": "20% off all items"
    }
  }
}
```

---

### 7. Shipping Method Loader

**Translatable Fields**: `name`, `description`

```typescript
.load('shipping-method', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "code": "express",
  "translations": {
    "de": {
      "name": "Expressversand",
      "description": "Zustellung innerhalb von 24 Stunden"
    },
    "en": {
      "name": "Express Shipping",
      "description": "Delivery within 24 hours"
    }
  }
}
```

---

### 8. Payment Method Loader

**Translatable Fields**: `name`, `description`

```typescript
.load('payment-method', {
  translationsField: 'translations'
})
```

**Input Format**:
```typescript
{
  "code": "paypal",
  "translations": {
    "de": {
      "name": "PayPal",
      "description": "Bezahlen Sie sicher mit PayPal"
    },
    "en": {
      "name": "PayPal",
      "description": "Pay securely with PayPal"
    }
  }
}
```

---

## Translation Data Formats

The `translationsField` supports **two formats**:

### 1. Object Map (Recommended)

**Best for**: JSON/XML files, API responses

```typescript
{
  "translations": {
    "de": {
      "name": "Premium-Widget",
      "slug": "premium-widget",
      "description": "Hochwertige Qualität"
    },
    "en": {
      "name": "Premium Widget",
      "slug": "premium-widget",
      "description": "High quality"
    }
  }
}
```

**How it's parsed**:
- Keys are language codes (`de`, `en`, `fr`, etc.)
- Values are objects with translatable fields
- Plugin internally converts to array format: `[{languageCode: 'de', ...}, {languageCode: 'en', ...}]`

---

### 2. Array of Objects

**Best for**: Precise control, programmatic generation

```typescript
{
  "translations": [
    {
      "languageCode": "de",
      "name": "Premium-Widget",
      "slug": "premium-widget",
      "description": "Hochwertige Qualität"
    },
    {
      "languageCode": "en",
      "name": "Premium Widget",
      "slug": "premium-widget",
      "description": "High quality"
    }
  ]
}
```

**Requirements**:
- Each object MUST have a `languageCode` field
- Invalid entries (missing `languageCode`) are silently skipped

---

## Translation Fallback Logic

### Primary Source: translationsField

If `translationsField` is configured AND the record contains valid translations:

```typescript
// Input record
{
  "name": "Fallback Name",  // ← Ignored
  "translations": {
    "de": { "name": "German Name" },  // ← Used
    "en": { "name": "English Name" }  // ← Used
  }
}
```

✅ Result: 2 translations created (German + English), top-level `name` ignored

---

### Secondary Source: Top-Level Fields

If `translationsField` is NOT configured OR translations are empty:

```typescript
// Input record
{
  "name": "Single Language Name",
  "description": "Single Language Description"
}
```

✅ Result: 1 translation created in the current request context language (e.g., `en`)

---

### Partial Translation Handling

If translations are provided but missing `name`/`slug`, the loader falls back to top-level fields:

```typescript
// Input record
{
  "name_en": "Premium Widget",       // ← Fallback for missing translation names
  "slug_en": "premium-widget",       // ← Fallback for missing translation slugs
  "translations": {
    "de": { "description": "Nur Beschreibung" },  // ← Missing name/slug
    "en": { "description": "Only description" }   // ← Missing name/slug
  }
}
```

✅ Result:
- German translation: `name` = "Premium Widget", `slug` = "premium-widget", `description` = "Nur Beschreibung"
- English translation: `name` = "Premium Widget", `slug` = "premium-widget", `description` = "Only description"

**This prevents empty name/slug fields which would cause validation errors.**

---

## Adding New Languages

### Option 1: Add to Existing Translations

Update your source data to include the new language:

```typescript
{
  "translations": {
    "de": { "name": "Premium-Widget" },
    "en": { "name": "Premium Widget" },
    "fr": { "name": "Widget Premium" },  // ← New language
    "es": { "name": "Widget Premium" }   // ← Another new language
  }
}
```

Run the same pipeline → Vendure will create/update translations for all 4 languages.

---

### Option 2: Separate Import Per Language

If your source data only has one language at a time:

```typescript
// Pipeline 1: Import English translations
datahub.pipeline('import-products-en')
  .extract('csv', { path: '/data/products-en.csv' })
  .load('product', {
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description'
  })
  .run();

// Pipeline 2: Import German translations
datahub.pipeline('import-products-de')
  .extract('csv', { path: '/data/products-de.csv' })
  .load('product', {
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    channel: 'default-channel'  // Important: use same channel
  })
  .run();
```

**Important**:
- Use the SAME `slug` to match existing products
- Set `strategy: 'UPDATE'` to prevent creating duplicates
- Translations are merged (not replaced)

---

## Common Pitfalls

### ❌ WRONG: Top-Level Name with translationsField

```typescript
{
  "name": "English Name",  // ← This will be IGNORED
  "translations": {
    "de": { "name": "German Name" }  // ← Only this is used
  }
}
```

**Problem**: When `translationsField` is set, top-level fields are IGNORED (except as fallback for missing translation fields).

**Fix**: Include ALL languages in `translations`:

```typescript
{
  "translations": {
    "de": { "name": "German Name" },
    "en": { "name": "English Name" }  // ← Include English here
  }
}
```

---

### ❌ WRONG: Missing languageCode in Array

```typescript
{
  "translations": [
    { "name": "German Name" }  // ← Missing languageCode!
  ]
}
```

**Problem**: Invalid translation entries are silently skipped.

**Fix**: Always include `languageCode`:

```typescript
{
  "translations": [
    { "languageCode": "de", "name": "German Name" }  // ✅ Correct
  ]
}
```

---

### ❌ WRONG: Empty Translations Object

```typescript
{
  "name": "Fallback Name",
  "translations": {}  // ← Empty object = no translations
}
```

**Result**: No translations created from `translations` field → falls back to top-level `nameField`.

**Fix**: Either provide translations OR remove the `translationsField` config:

```typescript
// Option 1: Provide translations
{
  "name": "Fallback Name",
  "translations": {
    "en": { "name": "English Name" }
  }
}

// Option 2: Remove translationsField config
.load('product', {
  nameField: 'name',
  slugField: 'slug'
  // Don't set translationsField
})
```

---

### ❌ WRONG: Inconsistent Language Codes

```typescript
{
  "translations": {
    "german": { "name": "German Name" },  // ← Invalid code
    "en": { "name": "English Name" }
  }
}
```

**Problem**: Vendure expects 2-letter ISO language codes (`de`, `en`, `fr`, `es`, etc.)

**Fix**: Use valid ISO 639-1 codes:

```typescript
{
  "translations": {
    "de": { "name": "German Name" },  // ✅ Correct
    "en": { "name": "English Name" }
  }
}
```

**Common Valid Codes**:
- `en` - English
- `de` - German
- `fr` - French
- `es` - Spanish
- `it` - Italian
- `nl` - Dutch
- `pt` - Portuguese
- `pl` - Polish
- `ja` - Japanese
- `zh` - Chinese

---

### ❌ WRONG: CSV with Complex JSON

```csv
translations
"{""de"":{""name"":""German""},""en"":{""name"":""English""}}"
```

**Problem**: Escaped JSON in CSV is hard to read/write/maintain.

**Fix 1**: Use JSON or XML instead of CSV:

```json
{
  "translations": {
    "de": { "name": "German Name" },
    "en": { "name": "English Name" }
  }
}
```

**Fix 2**: Use separate language columns in CSV:

```csv
name_de,slug_de,description_de,name_en,slug_en,description_en
"German Name","german-name","German Desc","English Name","english-name","English Desc"
```

Then transform to translations format:

```typescript
.transform('SCRIPT', {
  expression: `
    return {
      ...record,
      translations: {
        de: { name: record.name_de, slug: record.slug_de, description: record.description_de },
        en: { name: record.name_en, slug: record.slug_en, description: record.description_en }
      }
    };
  `
})
.load('product', {
  translationsField: 'translations'
})
```

---

## Real-World Example: Multi-Language Product Import

**Source Data** (JSON):
```json
[
  {
    "sku": "WIDGET-001",
    "price": 99.99,
    "enabled": true,
    "translations": {
      "de": {
        "name": "Premium-Widget",
        "slug": "premium-widget",
        "description": "<h1>Premium-Widget</h1><p>Hochwertige Qualität für anspruchsvolle Kunden.</p>"
      },
      "en": {
        "name": "Premium Widget",
        "slug": "premium-widget",
        "description": "<h1>Premium Widget</h1><p>High quality for demanding customers.</p>"
      },
      "fr": {
        "name": "Widget Premium",
        "slug": "widget-premium",
        "description": "<h1>Widget Premium</h1><p>Haute qualité pour les clients exigeants.</p>"
      }
    },
    "facetValueCodes": ["category-electronics", "brand-acme"],
    "assetUrls": [
      "https://cdn.example.com/images/widget-001-1.jpg",
      "https://cdn.example.com/images/widget-001-2.jpg"
    ],
    "featuredAssetUrl": "https://cdn.example.com/images/widget-001-featured.jpg"
  }
]
```

**Pipeline**:
```typescript
datahub.pipeline('import-multilang-products')
  .extract('json', {
    path: '/data/products-multilang.json'
  })
  .load('product', {
    translationsField: 'translations',  // ← Enable multi-language
    skuField: 'sku',
    priceField: 'price',
    enabledField: 'enabled',
    strategy: 'UPSERT'  // Update if exists, create if not
  })
  .run();
```

**Result**:
✅ Product created with 3 translations (German, English, French)
✅ Single SKU shared across all languages
✅ Facet values assigned
✅ Assets created and linked

**Export the same product**:
```typescript
datahub.pipeline('export-multilang-products')
  .extract('vendure', {
    entityType: 'PRODUCT',
    query: { take: 100 }
  })
  .export('json', {
    path: '/data/products-export.json'
  })
  .run();
```

**Exported Data**:
```json
[
  {
    "id": "1",
    "sku": "WIDGET-001",
    "price": 9999,
    "enabled": true,
    "translations": [
      {
        "languageCode": "de",
        "name": "Premium-Widget",
        "slug": "premium-widget",
        "description": "<h1>Premium-Widget</h1><p>Hochwertige Qualität für anspruchsvolle Kunden.</p>"
      },
      {
        "languageCode": "en",
        "name": "Premium Widget",
        "slug": "premium-widget",
        "description": "<h1>Premium Widget</h1><p>High quality for demanding customers.</p>"
      },
      {
        "languageCode": "fr",
        "name": "Widget Premium",
        "slug": "widget-premium",
        "description": "<h1>Widget Premium</h1><p>Haute qualité pour les clients exigeants.</p>"
      }
    ]
  }
]
```

✅ **Round-trip compatible**: Exported data can be re-imported with the same pipeline!

---

## Performance Tips

### 1. Use Object Map Format for Large Imports

**Faster parsing**:
```typescript
{
  "translations": {
    "de": { "name": "..." },
    "en": { "name": "..." }
  }
}
```

**vs**

```typescript
{
  "translations": [
    { "languageCode": "de", "name": "..." },
    { "languageCode": "en", "name": "..." }
  ]
}
```

Both work, but object map is slightly faster because the plugin doesn't need to validate `languageCode` fields.

---

### 2. Batch Imports with Multiple Languages

**Good** (Single batch with all languages):
```typescript
.load('product', {
  translationsField: 'translations',
  batchSize: 100  // Process 100 products × 3 languages = 300 translations
})
```

**Bad** (Separate imports per language):
```typescript
// Pipeline 1: English
.load('product', { nameField: 'name_en' })

// Pipeline 2: German
.load('product', { nameField: 'name_de' })

// Pipeline 3: French
.load('product', { nameField: 'name_fr' })
```

**Why**: Single batch is 3× faster (no need to lookup products 3 times).

---

### 3. Minimize Translation Fields

Only include fields that actually differ by language:

**Good**:
```typescript
{
  "sku": "WIDGET-001",  // ← Same across languages (top-level)
  "price": 99.99,       // ← Same across languages (top-level)
  "translations": {
    "de": { "name": "...", "description": "..." },  // ← Different per language
    "en": { "name": "...", "description": "..." }
  }
}
```

**Bad** (Redundant data):
```typescript
{
  "translations": {
    "de": {
      "name": "...",
      "sku": "WIDGET-001",  // ← Redundant (SKU is not translatable)
      "price": 99.99        // ← Redundant (price is currency-specific, not language)
    }
  }
}
```

---

## FAQ

### Q: Can I update only one language without affecting others?

**A**: Yes, but you need to include ALL languages in the update:

```typescript
// Vendure behavior: Translations are REPLACED, not merged
// When you update a product with new translations, existing translations are kept ONLY if included

// WRONG (will lose German translation):
{
  "slug": "premium-widget",
  "translations": {
    "en": { "name": "Updated English Name" }  // ← German translation is REMOVED
  }
}

// CORRECT (keeps both languages):
{
  "slug": "premium-widget",
  "translations": {
    "de": { "name": "Premium-Widget" },        // ← Keep German
    "en": { "name": "Updated English Name" }   // ← Update English
  }
}
```

**Best Practice**: Always export → modify → import to preserve all languages.

---

### Q: What happens if I don't set translationsField?

**A**: The loader creates a SINGLE translation in the current request context language:

```typescript
.load('product', {
  nameField: 'name',
  slugField: 'slug'
  // translationsField NOT set
})
```

Result: Product has 1 translation (e.g., English if context language is `en`).

---

### Q: Can I mix translationsField with top-level nameField?

**A**: Yes, top-level fields act as **fallback** for missing translation fields:

```typescript
{
  "name_fallback": "Fallback Name",
  "translations": {
    "de": { "slug": "german-slug" }  // ← Missing name
  }
}
```

Config:
```typescript
.load('product', {
  nameField: 'name_fallback',
  translationsField: 'translations'
})
```

Result: German translation gets `name: "Fallback Name"`, `slug: "german-slug"`.

---

### Q: How do I know which languages are supported in my Vendure store?

**A**: Check your Vendure config:

```typescript
// vendure-config.ts
export const config: VendureConfig = {
  defaultLanguageCode: LanguageCode.en,
  availableLanguageCodes: [
    LanguageCode.en,
    LanguageCode.de,
    LanguageCode.fr
  ]
};
```

The Data Hub plugin accepts ANY `languageCode` in translations, but Vendure will only display languages configured in `availableLanguageCodes`.

---

### Q: Can I export products with translations?

**A**: Yes! The Vendure extractor automatically includes ALL translations:

```typescript
.extract('vendure', {
  entityType: 'PRODUCT'
})
.export('json', {
  path: '/data/products-export.json'
})
```

Exported data format:
```json
{
  "translations": [
    { "languageCode": "de", "name": "..." },
    { "languageCode": "en", "name": "..." }
  ]
}
```

✅ **Round-trip compatible**: You can re-import this data using `translationsField: 'translations'`.

---

## See Also

- [Multi-Channel Guide](./multi-channel.md) - Assign products to multiple sales channels
- [Multi-Currency Guide](./multi-currency.md) - Price products in multiple currencies
- [Multi-Entity Mode Guide](./multi-entity.md) - Handle nested entity arrays (addresses, facet values, etc.)
- [Loader Reference](../reference/loaders.md) - Complete list of all 16 loaders with field schemas
