# Pimcore Connector

Integration for syncing products, categories, and assets from **Pimcore PIM/DAM** to **Vendure Commerce**.

## Overview

The Pimcore Connector provides pre-built pipelines for synchronizing your Pimcore product information management system with Vendure's commerce engine.

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
│  └───────────┘  │                          │  └───────────┘  │
└─────────────────┘                          └─────────────────┘
```

### What Gets Synced

| Pimcore Entity | Vendure Entity | Pipeline |
|---------------|----------------|----------|
| Products + Variants | Products + Variants | `productSync` |
| Categories | Collections | `categorySync` |
| Assets (Images) | Assets | `assetSync` |

## Installation

The connector is included in the DataHub plugin. No separate installation required.

## Configuration

### Basic Setup

```typescript
// vendure-config.ts
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

const pimcore = PimcoreConnector({
  connectionCode: 'pimcore-graphql',
});

export const config: VendureConfig = {
  plugins: [
    DataHubPlugin.init({
      secrets: [
        { code: 'pimcore-api-key', provider: 'ENV', value: 'PIMCORE_API_KEY' },
      ],
      connections: [
        {
          code: 'pimcore-graphql',
          type: 'GRAPHQL',
          settings: {
            baseUrl: 'https://pimcore.company.com/pimcore-graphql-webservices/shop',
            auth: {
              type: 'API_KEY',
              secretCode: 'pimcore-api-key',
              headerName: 'apikey',
            },
          },
        },
      ],
      connectors: [pimcore],
      pipelines: pimcore.pipelines,
    }),
  ],
};
```

### Full Configuration

```typescript
const pimcore = PimcoreConnector({
  connectionCode: 'pimcore-graphql',
  timeoutMs: 30000,

  // Target Vendure channel
  vendureChannel: 'b2c-shop',

  // Localized value selected from Pimcore responses
  defaultLanguage: 'en',

  // Sync options
  sync: {
    deltaSync: true,           // Only sync changed records
    batchSize: 100,            // Records per page
    maxPages: 100,             // Safety limit
    includeUnpublished: false, // Request and retain unpublished object records
    includeVariants: true,     // Include product variants
    pathFilter: '/Products/B2C/', // Only sync items under this path
  },

  // Field mappings (customize to match your Pimcore schema)
  // Values must be plain GraphQL field names; the generated query selects them.
  mapping: {
    product: {
      skuField: 'itemNumber',      // Your SKU field name
      nameField: 'productName',    // Your name field name
      slugField: 'urlKey',         // Your slug field name
      descriptionField: 'longDescription',
      variantsField: 'children',
      enabledField: 'isActive',
    },
    category: {
      nameField: 'categoryName',
      slugField: 'urlPath',
      descriptionField: 'categoryDescription',
      parentField: 'parentCategory',
      positionField: 'sortOrder',
    },
    asset: {
      urlField: 'fullpath',
      filenameField: 'filename',
    },
  },

  // Pipeline-specific settings
  pipelines: {
    productSync: {
      enabled: true,
      name: 'B2C Product Sync',
      schedule: '0 */4 * * *',    // Every 4 hours
      syncVariants: true,
    },
    categorySync: {
      enabled: true,
      schedule: '0 2 * * *',      // Daily at 2 AM
      rootPath: '/Categories/Shop/',
    },
    assetSync: {
      enabled: true,
      schedule: '0 3 * * *',      // Daily at 3 AM
      folderPath: '/Product Images/',
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
  },
});

DataHubPlugin.init({
  connectors: [pimcore],
  pipelines: pimcore.pipelines,
});
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
```

**Webhook Setup:**
```bash
# In Pimcore, configure webhook to call:
POST /data-hub/webhook/pimcore-product-sync
Headers:
  X-DataHub-Signature: sha256=<HMAC-SHA256 of the raw request body>
  X-Idempotency-Key: <unique delivery identifier>
Body:
  { "id": 123, "action": "update" }
```

### Category Sync Pipeline

Syncs the category tree as Vendure collections with proper parent-child relationships.

**Features:**
- Hierarchical tree preservation
- Position/sort order sync
- Configurable default language selection

### Asset Sync Pipeline

Bulk imports images and documents from Pimcore DAM to Vendure.

**Features:**
- MIME type filtering
- Folder path filtering
- Configurable URL and filename source fields

## Dashboard Templates and Pipelines

Pimcore imports use the connector's generated pipelines instead of generic import-wizard templates. The generated definitions carry the configured saved connection, GraphQL queries, validation, transformations, delta filtering, and webhook security. A generic API template cannot safely reproduce that contract.

Pass both the configured connector and its pipelines to the plugin:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

const pimcore = PimcoreConnector({
    connectionCode: 'pimcore-graphql',
});

DataHubPlugin.init({
    connectors: [pimcore],
    pipelines: pimcore.pipelines,
});
```

By default, the enabled generated imports appear in the Pipelines area as Pimcore Product Sync, Pimcore Category Sync, and Pimcore Asset Sync. They are not shown as import-wizard cards.

### Available Export Template

| Template | Format | Description |
|----------|--------|-------------|
| Product Export for Pimcore | JSON | Export Vendure products as JSON for Pimcore PIM import |

### Using ConnectorRegistry

If you use `ConnectorRegistry` to manage multiple connectors, pass its configured connector instances and generated pipelines to the plugin:

```typescript
import { ConnectorRegistry, PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors';

const registry = new ConnectorRegistry();
registry.register(PimcoreConnector, pimcoreConfig);

DataHubPlugin.init({
    connectors: registry.getConnectors().map(({ connector, config }) => ({
        definition: connector,
        config,
    })),
    pipelines: registry.getAllPipelines(),
});
```

## Secrets Configuration

The saved connection owns the GraphQL authentication. The examples use these
Secret Codes:

| Secret Code | Description |
|------------|-------------|
| `pimcore-api-key` | Pimcore DataHub API key |
| `pimcore-webhook-key` | HMAC key required when using the generated product/category webhook triggers |

### Secret Providers

DataHub supports multiple secret providers:

| Provider | Description | Use Case |
|----------|-------------|----------|
| `INLINE` | Stored in database | Development, or production with encryption |
| `ENV` | Read from environment variable | Production deployments, CI/CD |

### Option 1: Environment Variables (Recommended for Production)

```typescript
const pimcore = PimcoreConnector({ /* ... */ });

DataHubPlugin.init({
  secrets: [
    // Reads from PIMCORE_API_KEY env var at runtime
    { code: 'pimcore-api-key', provider: 'ENV', value: 'PIMCORE_API_KEY' },
    { code: 'pimcore-webhook-key', provider: 'ENV', value: 'PIMCORE_WEBHOOK_KEY' },
  ],
  connections: [{
    code: 'pimcore-graphql',
    type: 'GRAPHQL',
    settings: {
      baseUrl: 'https://pimcore.company.com/pimcore-graphql-webservices/shop',
      auth: {
        type: 'API_KEY',
        secretCode: 'pimcore-api-key',
        headerName: 'apikey',
      },
    },
  }],
  connectors: [pimcore],
  pipelines: pimcore.pipelines,
});
```

Then set environment variables:
```bash
export PIMCORE_API_KEY="your-actual-api-key"
export PIMCORE_WEBHOOK_KEY="your-webhook-secret"
```

### Option 2: Dashboard-Managed Inline Secret

For encrypted database storage, configure the same master key on every API server and worker:

```bash
# Generate master key (run once, store securely)
export DATAHUB_MASTER_KEY=$(openssl rand -hex 32)
```

Then create the secret via the Data Hub dashboard:

1. Go to **DataHub → Settings → Secrets**
2. Click **Create Secret**
3. Enter code: `pimcore-api-key`
4. Select provider: `INLINE`
5. Enter the actual key

`ENV` references must contain exactly one variable name such as `PIMCORE_API_KEY`. Expressions such as `PIMCORE_API_KEY|dev-test-key` are rejected. Prefer `ENV` for code-first configuration so credentials are not embedded in deployed source or configuration files.

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

Pagination uses a non-negative numeric offset. `first` is the page size and
`after` is the initial offset; after each page the extractor advances by the
number of returned edges and persists that offset as its checkpoint. Custom
queries must therefore declare `$after: Int`, return `totalCount` and
`edges`, and alias the listing to `getProductListing`,
`getCategoryListing`, or `getAssetListing` for the selected entity type.

Generated product and category pipelines depend on `id`, `key`,
`fullpath`, and `published`. Asset sync depends on the configured URL field
(`fullpath` by default) and filename field. `connectionCode` must reference a
saved `HTTP`, `REST`, or `GRAPHQL` connection with `baseUrl`. The extractor
uses that connection's headers and Secret-backed authentication, and restricts
the initial request and every redirect to the saved endpoint origin.

```typescript
// Use in custom pipelines
createPipeline()
  .extract('fetch-custom', {
    adapterCode: 'pimcoreGraphQL',
    connectionCode: 'pimcore-graphql',
    entityType: 'product',
    first: 50,
    maxPages: 100,
    includeUnpublished: false,
    filter: '{"path": {"$like": "/Custom/%"}}',
    // Custom GraphQL query (optional)
    query: `
      query MyCustomQuery($first: Int, $after: Int) {
        getProductListing: getCustomProductListing(first: $first, after: $after) {
          totalCount
          edges {
            node {
              id key fullpath published
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
  debug: true,
  pipelines: [/* ... */],
});
```

## Migration from Existing Sync

If migrating from a custom Pimcore sync:

1. Run initial full sync with `deltaSync: false`
2. Verify products in Vendure Admin
3. Enable `deltaSync: true` for incremental updates
4. Configure scheduled triggers
5. Set up webhooks for real-time sync

## Extending the Connector

The connector is designed for customization. You can remap the supported source fields, add validation rules, customize transforms, and add triggers without modifying the core code.

### Adding New Field Mappings

Remap the source fields consumed by the generated pipelines:

```typescript
PimcoreConnector({
  connectionCode: 'pimcore-graphql',
  mapping: {
    product: {
      skuField: 'itemNumber',
      nameField: 'productName',
      descriptionField: 'longDescription',
      variantsField: 'children',
      enabledField: 'active',
    },
    category: {
      nameField: 'categoryName',
      slugField: 'urlPath',
      parentField: 'parentCategory',
      positionField: 'sortOrder',
    },
  },
});
```

### Adding Validation Rules

Add custom validation to your sync pipelines:

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const customPipeline = createPipeline()
  .name('Custom Category Sync')
  .description('Category sync with additional validation')
  .trigger('MANUAL', { type: 'MANUAL' })
  .extract('fetch-categories', {
    adapterCode: 'pimcoreGraphQL',
    connectionCode: 'pimcore-graphql',
    entityType: 'category',
  })
  .validate('custom-validation', {
    errorHandlingMode: 'ACCUMULATE',
    rules: [
      {
        type: 'business',
        spec: {
          field: 'seoTitle',
          required: true,
          when: { field: 'parentId', operator: 'isNull' },
          error: 'Top-level categories require SEO title',
        },
      },
      {
        type: 'format',
        spec: {
          field: 'slug',
          pattern: '^[a-z0-9-]+$',
          error: 'Slug must be lowercase alphanumeric with dashes',
        },
      },
    ],
  })
  .load('upsert-categories', {
    adapterCode: 'collectionUpsert',
    strategy: 'UPSERT',
    slugField: 'slug',
  })
  .edge('MANUAL', 'fetch-categories')
  .edge('fetch-categories', 'custom-validation')
  .edge('custom-validation', 'upsert-categories')
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
    { op: 'coalesce', args: { paths: ['slug', 'urlKey', 'key'], target: 'finalSlug' } },

    // IfThenElse: Conditional value assignment
    {
      op: 'ifThenElse',
      args: {
        condition: { field: 'stock', cmp: 'lt', value: 10 },
        thenValue: true,
        elseValue: false,
        target: 'lowStock',
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

    // Remove: Remove a field
    { op: 'remove', args: { path: 'internalId' } },
  ],
});
```

### Adding Triggers

Configure multiple trigger types for your pipelines:

```typescript
PimcoreConnector({
  connectionCode: 'pimcore-graphql',
  pipelines: {
    productSync: {
      enabled: true,
      // Scheduled trigger (cron)
      schedule: '0 */4 * * *', // Every 4 hours

      // Webhook trigger is auto-configured with code: pimcore-product-sync
      // POST /data-hub/webhook/pimcore-product-sync
    },
  },
});

import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const customPipeline = createPipeline()
  .name('Custom Pimcore Product Sync')
  .description('Product sync with custom triggers')
  .capabilities({ requires: ['UpdateCatalog'] })

  // Event trigger
  .trigger('on-product-event', {
    type: 'EVENT',
    event: 'ProductEvent',
  })

  // Webhook trigger with HMAC signature verification
  .trigger('secure-webhook', {
    type: 'WEBHOOK',
    authentication: 'HMAC',
    secretCode: 'pimcore-webhook-secret',
    hmacAlgorithm: 'SHA256',
    requireIdempotencyKey: true,
    idempotencyKeyHeader: 'x-idempotency-key',
  })

  .extract('fetch-products', {
    adapterCode: 'pimcoreGraphQL',
    connectionCode: 'pimcore-graphql',
    entityType: 'product',
  })
  // ... rest of pipeline steps
  .edge('on-product-event', 'fetch-products')
  .edge('secure-webhook', 'fetch-products')
  .build();
```

### Custom GraphQL Queries

Override the default GraphQL queries for complex schemas:

```typescript
import { pimcoreGraphQLExtractor } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const customProductQuery = `
  query GetProducts($first: Int, $after: Int, $filter: String) {
    getProductListing: getMyCustomProductListing(first: $first, after: $after, filter: $filter) {
      totalCount
      edges {
        node {
          id key fullpath published
          ... on object_MyCustomProduct {
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
    connectionCode: 'pimcore-graphql',
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
    connectionCode: 'pimcore-graphql',
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
    bearerTokenSecretCode: 'erp-token',
  })
  .build();
```

### Available Transform Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `template` | Build string from template | `{ op: 'template', args: { template: '${a}-${b}', target: 'c' } }` |
| `slugify` | Create URL-safe slug | `{ op: 'slugify', args: { source: 'name', target: 'slug' } }` |
| `coalesce` | First non-empty value | `{ op: 'coalesce', args: { paths: ['a', 'b'], target: 'c' } }` |
| `when` | Conditional filter (keep/drop) | `{ op: 'when', args: { conditions: [...], action: 'keep' } }` |
| `ifThenElse` | Conditional value assignment | `{ op: 'ifThenElse', args: { condition: {...}, thenValue: 'x', elseValue: 'y', target: 'f' } }` |
| `toNumber` | Convert to number | `{ op: 'toNumber', args: { source: 'price' } }` |
| `map` | Restructure fields | `{ op: 'map', args: { mapping: { new: 'old' } } }` |
| `rename` | Rename field | `{ op: 'rename', args: { from: 'old', to: 'new' } }` |
| `set` | Set static value | `{ op: 'set', args: { path: 'field', value: 'val' } }` |
| `remove` | Remove a field | `{ op: 'remove', args: { path: 'fieldName' } }` |
| `flatten` | Flatten nested arrays | `{ op: 'flatten', args: { source: 'variants' } }` |
| `copy` | Copy value to another field | `{ op: 'copy', args: { source: 'name', target: 'displayName' } }` |
| `hash` | Generate hash of a value | `{ op: 'hash', args: { source: 'sku', algorithm: 'sha256', target: 'skuHash' } }` |
| `uuid` | Generate a UUID | `{ op: 'uuid', args: { target: 'externalRef' } }` |
| **String** | | |
| `concat` | Concatenate field values | `{ op: 'concat', args: { sources: ['brand', 'name'], separator: ' - ', target: 'title' } }` |
| `extractRegex` | Extract via regex capture group | `{ op: 'extractRegex', args: { source: 'sku', pattern: '^(\\w+)-', target: 'prefix' } }` |
| `join` | Join array elements into string | `{ op: 'join', args: { source: 'tags', delimiter: ', ', target: 'tagString' } }` |
| `replace` | Replace substring | `{ op: 'replace', args: { path: 'name', search: '&', replacement: 'and' } }` |
| `replaceRegex` | Replace via regex pattern | `{ op: 'replaceRegex', args: { path: 'html', pattern: '<[^>]+>', replacement: '' } }` |
| `split` | Split string into array | `{ op: 'split', args: { source: 'categories', delimiter: '/', target: 'categoryParts' } }` |
| `stripHtml` | Strip HTML tags from text | `{ op: 'stripHtml', args: { source: 'description', target: 'plainDescription' } }` |
| `truncate` | Truncate string to max length | `{ op: 'truncate', args: { source: 'description', length: 255, target: 'shortDesc' } }` |
| `lowercase` | Convert to lowercase | `{ op: 'lowercase', args: { path: 'sku' } }` |
| `uppercase` | Convert to uppercase | `{ op: 'uppercase', args: { path: 'code' } }` |
| `trim` | Trim whitespace | `{ op: 'trim', args: { path: 'name' } }` |
| **Numeric** | | |
| `currency` | Format as currency string | `{ op: 'currency', args: { source: 'price', target: 'formattedPrice', decimals: 2 } }` |
| `formatNumber` | Format number with locale rules | `{ op: 'formatNumber', args: { source: 'weight', decimals: 2, target: 'formattedWeight' } }` |
| `math` | Arithmetic operations | `{ op: 'math', args: { source: 'price', operation: 'multiply', operand: 100, target: 'priceInCents' } }` |
| `parseNumber` | Parse localized number string | `{ op: 'parseNumber', args: { source: 'priceStr', locale: 'de-DE', target: 'price' } }` |
| `round` | Round a number | `{ op: 'round', args: { source: 'price', decimals: 2 } }` |
| `toCents` | Convert decimal price to cents | `{ op: 'toCents', args: { source: 'price', target: 'priceInCents' } }` |
| `toString` | Convert value to string | `{ op: 'toString', args: { source: 'productId', target: 'productIdStr' } }` |
| `unit` | Convert measurement units | `{ op: 'unit', args: { source: 'weight', from: 'kg', to: 'g', target: 'weightGrams' } }` |
| **Date** | | |
| `dateAdd` | Add duration to a date | `{ op: 'dateAdd', args: { source: 'createdAt', amount: 30, unit: 'days', target: 'expiresAt' } }` |
| `dateDiff` | Difference between two dates | `{ op: 'dateDiff', args: { startDate: 'createdAt', endDate: 'updatedAt', unit: 'days', target: 'ageDays' } }` |
| `dateFormat` | Format date to string | `{ op: 'dateFormat', args: { source: 'syncedAt', format: 'YYYY-MM-DD', target: 'syncDate' } }` |
| `dateParse` | Parse date string | `{ op: 'dateParse', args: { source: 'dateStr', format: 'DD.MM.YYYY', target: 'parsedDate' } }` |
| `now` | Set current timestamp | `{ op: 'now', args: { target: 'importedAt' } }` |
| **JSON** | | |
| `omit` | Remove keys from object | `{ op: 'omit', args: { fields: ['internal', 'debug'] } }` |
| `parseJson` | Parse JSON string to object | `{ op: 'parseJson', args: { source: 'metadataJson', target: 'metadata' } }` |
| `pick` | Keep only specified keys | `{ op: 'pick', args: { fields: ['sku', 'name', 'price'] } }` |
| `stringifyJson` | Serialize object to JSON string | `{ op: 'stringifyJson', args: { source: 'metadata', target: 'metadataStr' } }` |
| **Logic** | | |
| `switch` | Multi-branch conditional mapping | `{ op: 'switch', args: { source: 'type', cases: [{ value: 'A', result: 'TypeA' }, { value: 'B', result: 'TypeB' }], default: 'Other', target: 'category' } }` |
| **Enrichment** | | |
| `default` | Set default for empty fields | `{ op: 'default', args: { path: 'stock', value: 0 } }` |
| `enrich` | Enrich or default fields on records | `{ op: 'enrich', args: { set: { category: 'electronics' } } }` |
| `httpLookup` | Fetch data from external HTTP API | `{ op: 'httpLookup', args: { url: 'https://api.example.com/stock/{{sku}}', target: 'stockData' } }` |
| `lookup` | Look up value from a reference table | `{ op: 'lookup', args: { source: 'colorCode', map: { 'R': 'Red', 'G': 'Green', 'B': 'Blue' }, target: 'colorName' } }` |
| **Aggregation** | | |
| `aggregate` | Aggregate values across records | `{ op: 'aggregate', args: { op: 'avg', source: 'price', target: 'avgPrice' } }` |
| `count` | Count array elements or string characters | `{ op: 'count', args: { source: 'items', target: 'itemCount' } }` |
| `expand` | Expand array into multiple records | `{ op: 'expand', args: { path: 'variants', mergeParent: true } }` |
| `first` | Take first element of an array | `{ op: 'first', args: { source: 'variants', target: 'defaultVariant' } }` |
| `last` | Take last element of an array | `{ op: 'last', args: { source: 'variants', target: 'latestVariant' } }` |
| `unique` | Deduplicate values in an array | `{ op: 'unique', args: { source: 'tags' } }` |
| `multiJoin` | Join records with an inline dataset | `{ op: 'multiJoin', args: { leftKey: 'sku', rightKey: 'sku', rightData: [{ sku: 'A-1', price: 1999 }] } }` |
| **File** | | |
| `imageResize` | Resize a base64-encoded image | `{ op: 'imageResize', args: { sourceField: 'imageBase64', width: 800, height: 600, targetField: 'resizedBase64' } }` |
| `imageConvert` | Convert a base64-encoded image format | `{ op: 'imageConvert', args: { sourceField: 'imageBase64', format: 'webp', targetField: 'convertedBase64' } }` |
| `pdfGenerate` | Generate a multi-page plain-text PDF | `{ op: 'pdfGenerate', args: { template: 'Product: {{name}}', targetField: 'pdfBase64' } }` |
| **Validation** | | |
| `validateFormat` | Validate field matches a pattern | `{ op: 'validateFormat', args: { field: 'sku', pattern: '^[A-Z0-9-]+$', errorMessage: 'Invalid SKU' } }` |
| `validateRequired` | Ensure required fields are present | `{ op: 'validateRequired', args: { fields: ['sku', 'name', 'price'] } }` |
| **Script** | | |
| `script` | Run custom JavaScript transform | `{ op: 'script', args: { code: 'return { ...record, fullName: record.brand + " " + record.name }' } }` |
| **Other** | | |
| `deltaFilter` | Filter unchanged records | `{ op: 'deltaFilter', args: { idPath: 'sku', includePaths: ['name', 'price'] } }` |

## Support

For bug reports and feature requests, please open an issue in the project repository.
