# Pimcore Connector

Enterprise integration for syncing products, categories, assets, and facets from **Pimcore PIM/DAM** to **Vendure Commerce**.

## Overview

The Pimcore Connector provides pre-built, production-ready pipelines for synchronizing your Pimcore product information management system with Vendure's commerce engine.

### Architecture

```
┌─────────────────┐                          ┌─────────────────┐
│     Pimcore     │                          │     Vendure     │
│    PIM / DAM    │                          │    Commerce     │
│                 │                          │                 │
│  ┌───────────┐  │   DataHub Connector      │  ┌───────────┐  │
│  │ Products  │  │ ─────────────────────►   │  │ Products  │  │
│  │ Categories│  │   GraphQL Extraction     │  │ Collections│  │
│  │ Assets    │  │   Transform & Validate   │  │ Assets    │  │
│  │ Attributes│  │   Vendure Loaders        │  │ Facets    │  │
│  └───────────┘  │                          │  └───────────┘  │
└─────────────────┘                          └─────────────────┘
```

### What Gets Synced

| Pimcore Entity | Vendure Entity | Pipeline |
|---------------|----------------|----------|
| Products + Variants | Products + Variants | `productSync` |
| Categories | Collections | `categorySync` |
| Assets (Images) | Assets | `assetSync` |
| Select Options | Facets + Values | `facetSync` |

## Installation

The connector is included in the DataHub plugin. No separate installation required.

## Configuration

### Basic Setup

```typescript
// vendure-config.ts
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

export const config: VendureConfig = {
  plugins: [
    DataHubPlugin.init({
      connectors: [
        PimcoreConnector({
          connection: {
            // Pimcore DataHub GraphQL endpoint
            endpoint: 'https://pimcore.company.com/pimcore-datahub-webservices/shop',
            // Reference to DataHub secret (recommended)
            apiKeySecretCode: 'pimcore-api-key',
            // Or direct API key (not recommended for production)
            // apiKey: process.env.PIMCORE_API_KEY,
          },
        }),
      ],
    }),
  ],
};
```

### Full Configuration

```typescript
PimcoreConnector({
  // Connection settings
  connection: {
    endpoint: 'https://pimcore.company.com/pimcore-datahub-webservices/shop',
    apiKeySecretCode: 'pimcore-api-key',
    headers: {
      'X-Custom-Header': 'value',
    },
    timeoutMs: 30000,
  },

  // Target Vendure channel
  vendureChannel: 'b2c-shop',

  // Languages for translations
  defaultLanguage: 'en',
  languages: ['en', 'de', 'fr'],

  // Sync options
  sync: {
    deltaSync: true,           // Only sync changed records
    batchSize: 100,            // Records per page
    maxPages: 100,             // Safety limit
    includeUnpublished: false, // Skip unpublished items
    includeVariants: true,     // Include product variants
    pathFilter: '/Products/B2C/', // Only sync items under this path
  },

  // Field mappings (customize to match your Pimcore schema)
  mapping: {
    product: {
      skuField: 'itemNumber',      // Your SKU field name
      nameField: 'productName',    // Your name field name
      slugField: 'urlKey',         // Your slug field name
      descriptionField: 'longDescription',
      assetsField: 'productImages',
      categoriesField: 'productCategories',
      variantsField: 'children',
      enabledField: 'isActive',
      customFields: {
        'pimcoreBrand': 'brand',
        'pimcoreMaterial': 'material',
      },
    },
    category: {
      nameField: 'categoryName',
      slugField: 'urlPath',
      descriptionField: 'categoryDescription',
      parentField: 'parentCategory',
      positionField: 'sortOrder',
    },
  },

  // Pipeline-specific settings
  pipelines: {
    productSync: {
      enabled: true,
      name: 'B2C Product Sync',
      schedule: '0 */4 * * *',    // Every 4 hours
      syncAssets: true,
      syncCategories: true,
      syncVariants: true,
      deleteOrphans: false,
    },
    categorySync: {
      enabled: true,
      schedule: '0 2 * * *',      // Daily at 2 AM
      maxDepth: 5,
      rootPath: '/Categories/Shop/',
    },
    assetSync: {
      enabled: true,
      schedule: '0 3 * * *',      // Daily at 3 AM
      folderPath: '/Product Images/',
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    facetSync: {
      enabled: true,
      schedule: '0 1 * * 0',      // Weekly on Sunday at 1 AM
      attributeGroups: ['color', 'size', 'material'],
    },
  },
})
```

## Pipelines

### Product Sync Pipeline

The canonical product truth pipeline. Syncs products and variants from Pimcore to Vendure.

**Trigger Options:**
- Manual (via dashboard or API)
- Scheduled (cron expression)
- Webhook (for real-time sync)

**Data Flow:**
```
Pimcore GraphQL → Validate → Transform → Delta Filter → Vendure Products
                                                    ↓
                                              Vendure Variants
                                                    ↓
                                              Attach Assets
```

**Webhook Setup:**
```bash
# In Pimcore, configure webhook to call:
POST /api/data-hub/webhooks/pimcore-product-sync
Headers:
  X-API-Key: your-webhook-key
Body:
  { "id": 123, "action": "update" }
```

### Category Sync Pipeline

Syncs the category tree as Vendure collections with proper parent-child relationships.

**Features:**
- Hierarchical tree preservation
- Position/sort order sync
- Localized names and descriptions
- Category images as collection featured assets

### Asset Sync Pipeline

Bulk imports images and documents from Pimcore DAM to Vendure.

**Features:**
- MIME type filtering
- Folder path filtering
- Alt text extraction from Pimcore metadata
- Dimension preservation (width, height)

### Facet Sync Pipeline

Syncs Pimcore select options (attributes) as Vendure facets and facet values.

**Features:**
- Attribute to facet mapping
- Option values as facet values
- Localized facet names

## Secrets Configuration

The connector requires these secrets:

| Secret Code | Description |
|------------|-------------|
| `pimcore-api-key` | Pimcore DataHub API key |
| `pimcore-webhook-key` | Webhook authentication key (optional) |

### Secret Providers

DataHub supports multiple secret providers:

| Provider | Description | Use Case |
|----------|-------------|----------|
| `inline` | Stored in database | Development, or production with encryption |
| `env` | Read from environment variable | Production deployments, CI/CD |

### Option 1: Environment Variables (Recommended for Production)

```typescript
DataHubPlugin.init({
  secrets: [
    // Reads from PIMCORE_API_KEY env var at runtime
    { code: 'pimcore-api-key', provider: 'env', value: 'PIMCORE_API_KEY' },
    { code: 'pimcore-webhook-key', provider: 'env', value: 'PIMCORE_WEBHOOK_KEY' },
  ],
  connectors: [PimcoreConnector({ /* ... */ })],
})
```

Then set environment variables:
```bash
export PIMCORE_API_KEY="your-actual-api-key"
export PIMCORE_WEBHOOK_KEY="your-webhook-secret"
```

### Option 2: Env with Fallback (Development)

```typescript
// Fallback syntax: 'ENV_VAR|fallback_value'
secrets: [
  { code: 'pimcore-api-key', provider: 'env', value: 'PIMCORE_API_KEY|dev-test-key' },
]
```

Uses `dev-test-key` if `PIMCORE_API_KEY` is not set.

### Option 3: Inline with Encryption (Secure Storage)

For storing secrets directly in the database with encryption:

```bash
# Generate master key (run once, store securely)
export DATAHUB_MASTER_KEY=$(openssl rand -hex 32)
```

```typescript
DataHubPlugin.init({
  secrets: [
    // Encrypted at rest with AES-256-GCM when DATAHUB_MASTER_KEY is set
    { code: 'pimcore-api-key', provider: 'inline', value: 'your-api-key' },
  ],
})
```

### Option 4: Dashboard UI

Create secrets via the DataHub dashboard:

1. Go to **DataHub → Settings → Secrets**
2. Click **Create Secret**
3. Enter code: `pimcore-api-key`
4. Select provider: `inline` or `env`
5. Enter value (actual key or env var name)

Secrets created via dashboard are stored in the database and can be encrypted.

## Pimcore DataHub Setup

### 1. Create DataHub Configuration

In Pimcore Admin → Settings → DataHub:

1. Create new configuration (e.g., "shop")
2. Set type to "GraphQL"
3. Configure schema for your product class

### 2. Configure Product Schema

Example Product class fields to expose:

```yaml
# Pimcore Product Class
fields:
  - name: sku
    type: input
  - name: name
    type: localizedInput
  - name: description
    type: localizedWysiwyg
  - name: price
    type: numeric
  - name: images
    type: manyToManyObjectRelation
  - name: categories
    type: manyToManyObjectRelation
  - name: published
    type: checkbox
```

### 3. Generate API Key

In DataHub configuration → Security:

1. Generate new API key
2. Copy key to DataHub secrets

## Custom Extractors

The connector provides a custom extractor for Pimcore DataHub GraphQL:

```typescript
// Use in custom pipelines
createPipeline()
  .extract('fetch-custom', {
    adapterCode: 'pimcoreGraphQL',
    'connection.endpoint': 'https://pimcore.company.com/...',
    'connection.apiKeySecretCode': 'pimcore-api-key',
    entityType: 'product',
    className: 'CustomProduct',
    first: 50,
    filter: '{"path": {"$like": "/Custom/%"}}',
    // Custom GraphQL query (optional)
    query: `
      query MyCustomQuery($first: Int) {
        getCustomProductListing(first: $first) {
          edges {
            node {
              id
              myCustomField
            }
          }
        }
      }
    `,
  })
```

## Transform Utilities

The connector exports utility functions for custom transformations:

```typescript
import {
  extractLocalizedValue,
  buildTranslations,
  generateSlug,
  transformProduct,
  transformCategory,
  transformAsset,
} from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

// Extract value from localized field
const name = extractLocalizedValue(product.name, 'de', 'en');

// Build translations array
const translations = buildTranslations(
  { name: product.name, description: product.description },
  ['name', 'description'],
  ['en', 'de', 'fr']
);

// Generate URL-safe slug
const slug = generateSlug('Bürkle GmbH Product');
// => 'buerkle-gmbh-product'
```

## Monitoring & Troubleshooting

### View Pipeline Status

In DataHub Dashboard → Pipelines, find:
- "Pimcore Product Sync"
- "Pimcore Category Sync"
- "Pimcore Asset Sync"
- "Pimcore Facet Sync"

### Common Issues

**1. Authentication Failed**
```
Error: Pimcore API request failed: 401 Unauthorized
```
- Check API key is correct
- Verify DataHub secret is configured
- Ensure API key has required permissions

**2. No Products Found**
```
Warning: No data returned for getProductListing
```
- Verify Pimcore DataHub configuration includes Product class
- Check path filter matches actual product paths
- Ensure products are published (if `includeUnpublished: false`)

**3. Missing Fields**
```
Error: Product name is required
```
- Check field mapping matches your Pimcore schema
- Verify field names are correct (case-sensitive)

### Enable Debug Logging

```typescript
DataHubPlugin.init({
  logLevel: 'debug',
  connectors: [/* ... */],
})
```

## Migration from Existing Sync

If migrating from a custom Pimcore sync:

1. Run initial full sync with `deltaSync: false`
2. Verify products in Vendure Admin
3. Enable `deltaSync: true` for incremental updates
4. Configure scheduled triggers
5. Set up webhooks for real-time sync

## Extending the Connector

The connector is designed for customization. You can extend field mappings, add validation rules, customize transforms, and add triggers without modifying the core code.

### Adding New Field Mappings

Map additional Pimcore fields to Vendure by extending the mapping configuration:

```typescript
PimcoreConnector({
  connection: { /* ... */ },
  mapping: {
    product: {
      // Standard fields
      skuField: 'itemNumber',
      nameField: 'productName',

      // Map Pimcore fields to Vendure custom fields
      customFields: {
        // Vendure custom field name : Pimcore field name
        'pimcoreBrand': 'brand',
        'pimcoreMaterial': 'material',
        'pimcoreWeight': 'technicalSpecs.weight',
        'pimcoreColor': 'attributes.color.name',
      },
    },
    category: {
      nameField: 'categoryName',
      // Add custom category fields
      customFields: {
        'pimcoreSeoTitle': 'seoTitle',
        'pimcoreSeoDescription': 'seoDescription',
      },
    },
  },
})
```

### Adding Validation Rules

Add custom validation to your sync pipelines:

```typescript
import { createCategorySyncPipeline } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

// Extend the base category sync with custom validation
const config = { /* your config */ };
const basePipeline = createCategorySyncPipeline(config);

const extendedPipeline = createPipeline()
  .from(basePipeline)
  .validate('custom-validation', {
    mode: 'accumulate',
    rules: [
      // Require SEO title for top-level categories
      {
        type: 'business',
        spec: {
          field: 'seoTitle',
          required: true,
          when: { field: 'parentId', operator: 'isNull' },
          error: 'Top-level categories require SEO title',
        },
      },
      // Validate slug format
      {
        type: 'format',
        spec: {
          field: 'slug',
          pattern: '^[a-z0-9-]+$',
          error: 'Slug must be lowercase alphanumeric with dashes',
        },
      },
      // Validate price range
      {
        type: 'range',
        spec: {
          field: 'price',
          min: 0,
          max: 1000000,
          error: 'Price must be between 0 and 1,000,000',
        },
      },
    ],
  })
  .build();
```

### Adding Transform Operators

Transform data before loading into Vendure:

```typescript
// In your pipeline definition
pipeline.transform('custom-transforms', {
  operators: [
    // Template: Build computed fields
    { op: 'template', args: { template: '${brand} - ${name}', target: 'fullName' } },

    // Slugify: Create URL-safe slugs
    { op: 'slugify', args: { source: 'name', target: 'slug' } },

    // Coalesce: Use first non-empty value
    { op: 'coalesce', args: { fields: ['slug', 'urlKey', 'key'], target: 'finalSlug' } },

    // When: Conditional logic
    {
      op: 'when',
      args: {
        conditions: [{ field: 'stock', cmp: 'lt', value: 10 }],
        action: 'set',
        setValue: { lowStock: true },
      },
    },

    // ToNumber: Convert strings to numbers
    { op: 'toNumber', args: { source: 'price' } },

    // Map: Restructure data
    {
      op: 'map',
      args: {
        mapping: {
          sku: 'itemNumber',
          name: 'productName',
          price: 'priceInCents',
        },
      },
    },

    // Rename: Rename fields
    { op: 'rename', args: { from: 'oldField', to: 'newField' } },

    // Set: Set static values
    { op: 'set', args: { path: 'source', value: 'pimcore' } },

    // Remove: Remove fields
    { op: 'remove', args: { paths: ['internalId', 'tempField'] } },
  ],
});
```

### Adding Triggers

Configure multiple trigger types for your pipelines:

```typescript
PimcoreConnector({
  connection: { /* ... */ },
  pipelines: {
    productSync: {
      enabled: true,
      // Scheduled trigger (cron)
      schedule: '0 */4 * * *', // Every 4 hours

      // Webhook trigger is auto-configured with code: pimcore-product-sync
      // POST /api/data-hub/webhooks/pimcore-product-sync
    },
  },
})

// For custom triggers, extend the pipeline:
import { createProductSyncPipeline } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

const pipeline = createProductSyncPipeline(config);

// Add event trigger
pipeline.trigger('on-product-event', {
  type: 'event',
  eventType: 'ProductEvent',
  filter: { action: 'created' },
});

// Add additional webhook with JWT auth
pipeline.trigger('secure-webhook', {
  type: 'webhook',
  webhookCode: 'pimcore-secure-sync',
  authentication: 'jwt',
  jwtSecretCode: 'pimcore-jwt-secret',
});
```

### Custom GraphQL Queries

Override the default GraphQL queries for complex schemas:

```typescript
import { pimcoreGraphQLExtractor } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const customProductQuery = `
  query GetProducts($first: Int, $after: String, $filter: String) {
    getMyCustomProductListing(first: $first, after: $after, filter: $filter) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id key fullPath published
          ... on MyCustomProduct {
            sku
            name { en de fr }
            customAttribute
            nestedData { field1 field2 }
          }
        }
      }
    }
  }
`;

const customPipeline = createPipeline()
  .name('Custom Pimcore Product Sync')
  .extract('fetch', {
    adapterCode: 'pimcoreGraphQL',
    'connection.endpoint': 'https://pimcore.example.com/datahub/shop',
    'connection.apiKeySecretCode': 'pimcore-api-key',
    entityType: 'product',
    query: customProductQuery,
    first: 100,
  })
  // ... rest of pipeline
  .build();
```

### Extending with Custom Loaders

Create pipelines that load to custom destinations:

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

// Sync to external system
const externalSyncPipeline = createPipeline()
  .name('Pimcore to External ERP')
  .extract('fetch-pimcore', {
    adapterCode: 'pimcoreGraphQL',
    'connection.endpoint': 'https://pimcore.example.com/datahub/shop',
    'connection.apiKeySecretCode': 'pimcore-api-key',
    entityType: 'product',
  })
  .transform('prepare', {
    operators: [
      { op: 'map', args: { mapping: { erpSku: 'sku', erpName: 'name' } } },
    ],
  })
  .load('send-to-erp', {
    adapterCode: 'restPost',
    endpoint: 'https://erp.example.com/api/products',
    method: 'POST',
    headers: { 'Authorization': 'Bearer {{secret:erp-token}}' },
  })
  .build();
```

### Available Transform Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `template` | Build string from template | `{ op: 'template', args: { template: '${a}-${b}', target: 'c' } }` |
| `slugify` | Create URL-safe slug | `{ op: 'slugify', args: { source: 'name', target: 'slug' } }` |
| `coalesce` | First non-empty value | `{ op: 'coalesce', args: { fields: ['a', 'b'], target: 'c' } }` |
| `when` | Conditional logic | `{ op: 'when', args: { conditions: [...], action: 'set' } }` |
| `toNumber` | Convert to number | `{ op: 'toNumber', args: { source: 'price' } }` |
| `map` | Restructure fields | `{ op: 'map', args: { mapping: { new: 'old' } } }` |
| `rename` | Rename field | `{ op: 'rename', args: { from: 'old', to: 'new' } }` |
| `set` | Set static value | `{ op: 'set', args: { path: 'field', value: 'val' } }` |
| `remove` | Remove fields | `{ op: 'remove', args: { paths: ['a', 'b'] } }` |
| `flatten` | Flatten nested arrays | `{ op: 'flatten', args: { source: 'variants' } }` |
| `deltaFilter` | Filter unchanged records | `{ op: 'deltaFilter', args: { hashFields: ['sku', 'name'] } }` |

## Support

- GitHub Issues: [oronts/data-hub-plugin](https://github.com/oronts/data-hub-plugin/issues)
- Documentation: [oronts.com/data-hub/connectors/pimcore](https://oronts.com/data-hub/connectors/pimcore)
