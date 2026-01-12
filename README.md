<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/assets/images/logo/favicon.png" alt="Oronts" width="80" height="80">
  </a>
</p>

<h1 align="center">@oronts/vendure-data-hub-plugin</h1>

<p align="center">
  <strong>Enterprise ETL & Data Integration for Vendure E-commerce</strong>
</p>

<p align="center">
  <a href="https://github.com/oronts/data-hub-plugin/actions/workflows/ci.yml"><img src="https://github.com/oronts/data-hub-plugin/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@oronts/vendure-data-hub-plugin"><img src="https://img.shields.io/npm/v/@oronts/vendure-data-hub-plugin.svg" alt="npm version"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-Commercial-red.svg" alt="License"></a>
  <a href="https://www.vendure.io/"><img src="https://img.shields.io/badge/vendure-%5E3.0.0-blue" alt="Vendure version"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#extractors">Extractors</a> •
  <a href="#operators">Operators</a> •
  <a href="#loaders">Loaders</a> •
  <a href="#hooks">Hooks</a> •
  <a href="#documentation">Docs</a>
</p>

---

A full-featured ETL (Extract, Transform, Load) plugin for [Vendure](https://www.vendure.io/) e-commerce. Build data pipelines to import products, sync inventory, generate product feeds, index to search engines, and integrate with external systems.

## Features

- **Visual Pipeline Builder** - Drag-and-drop workflow editor with live validation
- **Code-First DSL** - TypeScript API for defining pipelines programmatically
- **7 Data Extractors** - REST API, GraphQL, CSV, JSON, Vendure Query, In-Memory, Generator
- **14 Entity Loaders** - Products, Variants, Customers, Orders, Collections, Promotions, Stock, Assets, Tax, Channels, Payment Methods, and more
- **45+ Transform Operators** - String, numeric, date, JSON, array, validation, conditional, and custom script operations
- **4 Feed Generators** - Google Merchant, Meta Catalog, Amazon, Custom (XML/CSV/JSON/TSV)
- **4 Search Sinks** - Elasticsearch, MeiliSearch, Algolia, Typesense
- **18 Hook Stages** - Interceptors and scripts to modify data at any pipeline stage
- **Scheduling** - Cron expressions, intervals, webhooks, and Vendure event triggers
- **Checkpoint Recovery** - Resume failed pipelines from last successful record
- **Real-time Monitoring** - Logs, analytics, error tracking, and dead letter queue

## Screenshots

<p align="center">
  <img src="docs/images/08-pipeline-editor-workflow.png" alt="Visual Pipeline Editor" width="800">
  <br>
  <em>Visual Pipeline Editor - Drag-and-drop workflow builder</em>
</p>

<details>
<summary><strong>View More Screenshots</strong></summary>

<p align="center">
  <img src="docs/images/06-pipelines-list.png" alt="Pipelines List" width="800">
  <br>
  <em>Pipeline Management - Overview of all data pipelines</em>
</p>

<p align="center">
  <img src="docs/images/01-adapters-catalog.png" alt="Adapters Catalog" width="800">
  <br>
  <em>Adapters Catalog - Extractors, Operators, and Loaders</em>
</p>

<p align="center">
  <img src="docs/images/05-logs-analytics.png" alt="Logs & Analytics" width="800">
  <br>
  <em>Logs & Analytics - Real-time monitoring and pipeline health</em>
</p>

<p align="center">
  <img src="docs/images/04-hooks-events.png" alt="Hooks & Events" width="800">
  <br>
  <em>Hooks & Events - Test hooks and view pipeline events</em>
</p>

<p align="center">
  <img src="docs/images/02-connections-list.png" alt="Connections" width="800">
  <br>
  <em>Connections - Manage external system credentials</em>
</p>

<p align="center">
  <img src="docs/images/09-queues-overview.png" alt="Queues" width="800">
  <br>
  <em>Queues - Monitor pipeline execution and dead letters</em>
</p>

</details>

## Installation

```bash
npm install @oronts/vendure-data-hub-plugin
```

## Quick Start

### Basic Setup

```typescript
// vendure-config.ts
import { VendureConfig } from '@vendure/core';
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            enabled: true,
        }),
    ],
};
```

The plugin adds a "Data Hub" section to your admin dashboard for creating and managing pipelines.

### Code-First Pipeline

Define pipelines in TypeScript:

```typescript
import { DataHubPlugin, createPipeline } from '@oronts/vendure-data-hub-plugin';

const productImport = createPipeline()
    .name('Product Import')
    .description('Import products from supplier API')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'manual' })
    .extract('fetch-products', {
        adapterCode: 'rest',
        endpoint: 'https://api.supplier.com/products',
        method: 'GET',
        itemsField: 'data.products',
        pageParam: 'page',
        maxPages: 100,
        bearerTokenSecretCode: 'supplier-api-key',
    })
    .transform('prepare', {
        operators: [
            { op: 'validateRequired', args: { fields: ['sku', 'name', 'price'] } },
            { op: 'trim', args: { path: 'name' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'currency', args: { source: 'price', target: 'priceInCents', decimals: 2 } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .load('upsert', {
        adapterCode: 'productUpsert',
        strategy: 'source-wins',
        channel: '__default_channel__',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
    })
    .edge('start', 'fetch-products')
    .edge('fetch-products', 'prepare')
    .edge('prepare', 'upsert')
    .build();

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            pipelines: [{
                code: 'product-import',
                name: 'Product Import',
                definition: productImport,
            }],
        }),
    ],
};
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable or disable the plugin |
| `registerBuiltinAdapters` | `boolean` | `true` | Register built-in extractors, operators, loaders |
| `retentionDaysRuns` | `number` | `30` | Days to keep pipeline run history |
| `retentionDaysErrors` | `number` | `90` | Days to keep error records |
| `pipelines` | `CodeFirstPipeline[]` | `[]` | Define pipelines in code |
| `secrets` | `CodeFirstSecret[]` | `[]` | Define secrets in code |
| `connections` | `CodeFirstConnection[]` | `[]` | Define connections in code |
| `adapters` | `AdapterDefinition[]` | `[]` | Register custom adapters |
| `debug` | `boolean` | `false` | Enable debug logging |

---

## Extractors

### Available Extractors

| Extractor | Code | Description |
|-----------|------|-------------|
| REST API | `rest` | Fetch from REST APIs with pagination, auth, and field mapping |
| GraphQL | `graphql` | Query GraphQL endpoints with cursor/Relay pagination |
| CSV | `csv` | Parse CSV files or inline CSV data with configurable delimiter |
| JSON | `json` | Parse JSON files or inline JSON data with items path |
| Vendure Query | `vendure-query` | Query Vendure entities (Product, ProductVariant, Customer, Order, Collection, Facet, FacetValue, Promotion, Asset) |
| In-Memory | `inMemory` | Process data arrays passed directly (for webhooks/API calls) |
| Generator | `generator` | Generate test data using templates with placeholders |

### REST API Extractor

```typescript
.extract('fetch', {
    adapterCode: 'rest',
    endpoint: 'https://api.example.com/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    query: { limit: 100, active: true },
    itemsField: 'data.items',           // Path to array in response
    pageParam: 'page',                   // Pagination parameter
    nextPageField: 'meta.nextPage',      // Path to next page indicator
    maxPages: 100,                       // Safety limit
    bearerTokenSecretCode: 'api-key',    // Auth from secrets
})
```

### Vendure Query Extractor

Query Vendure entities directly:

```typescript
.extract('products', {
    adapterCode: 'vendure-query',
    entity: 'Product',                   // Product, Variant, Customer, Order, Collection, Facet, Asset
    relations: 'variants,featuredAsset,facetValues',
    batchSize: 100,
    flattenTranslations: true,           // Flatten translations to top-level
})
```

### Generator Extractor (Testing)

```typescript
.extract('test-data', {
    adapterCode: 'generator',
    count: 100,
    template: {
        id: '{{index}}',
        name: 'Product {{index}}',
        sku: 'TEST-{{index}}',
        price: '{{random 1000 9999}}',
    },
})
```

---

## Operators

Transform operators organized by category. All operators take `args` with their configuration.

### Data Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `set` | Set field to static value | `{ op: 'set', args: { path: 'enabled', value: true } }` |
| `copy` | Copy field value | `{ op: 'copy', args: { source: 'id', target: 'externalId' } }` |
| `rename` | Rename field | `{ op: 'rename', args: { from: 'product_name', to: 'name' } }` |
| `remove` | Delete field | `{ op: 'remove', args: { path: 'tempField' } }` |
| `map` | Remap multiple fields | `{ op: 'map', args: { mapping: { name: 'title', desc: 'body' } } }` |
| `lookup` | Map value from dictionary | `{ op: 'lookup', args: { source: 'code', map: { 'A': 'Active' }, target: 'status' } }` |
| `template` | String templates | `{ op: 'template', args: { template: '${firstName} ${lastName}', target: 'fullName' } }` |
| `enrich` | Add/default fields | `{ op: 'enrich', args: { defaults: { currency: 'USD' } } }` |

### String Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `trim` | Remove whitespace | `{ op: 'trim', args: { path: 'name' } }` |
| `uppercase` | Convert to uppercase | `{ op: 'uppercase', args: { path: 'sku' } }` |
| `lowercase` | Convert to lowercase | `{ op: 'lowercase', args: { path: 'email' } }` |
| `slugify` | URL-safe slug | `{ op: 'slugify', args: { source: 'name', target: 'slug' } }` |
| `split` | Split to array | `{ op: 'split', args: { source: 'tags', delimiter: ',', target: 'tagArray' } }` |
| `join` | Join array to string | `{ op: 'join', args: { source: 'parts', delimiter: '-', target: 'code' } }` |
| `concat` | Concatenate fields | `{ op: 'concat', args: { sources: ['first', 'last'], separator: ' ', target: 'name' } }` |
| `replace` | Replace text | `{ op: 'replace', args: { path: 'desc', search: '\n', replacement: '<br>', all: true } }` |
| `extractRegex` | Extract with regex | `{ op: 'extractRegex', args: { source: 'sku', pattern: '([A-Z]+)', target: 'prefix' } }` |
| `replaceRegex` | Regex replace | `{ op: 'replaceRegex', args: { path: 'text', pattern: '\\s+', replacement: ' ' } }` |
| `stripHtml` | Remove HTML tags | `{ op: 'stripHtml', args: { source: 'htmlContent', target: 'plainText' } }` |
| `truncate` | Truncate to length | `{ op: 'truncate', args: { source: 'description', length: 100, suffix: '...' } }` |

### Numeric Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `math` | Math operations | `{ op: 'math', args: { operation: 'multiply', source: 'price', operand: 100, target: 'cents' } }` |
| `toNumber` | Parse to number | `{ op: 'toNumber', args: { source: 'priceStr', target: 'price', default: 0 } }` |
| `toString` | Convert to string | `{ op: 'toString', args: { source: 'id', target: 'idStr' } }` |
| `currency` | To minor units | `{ op: 'currency', args: { source: 'price', target: 'priceInCents', decimals: 2 } }` |
| `toCents` | Decimal to cents | `{ op: 'toCents', args: { source: 'price', target: 'priceInCents' } }` |
| `round` | Round number | `{ op: 'round', args: { source: 'value', decimals: 2 } }` |
| `unit` | Unit conversion | `{ op: 'unit', args: { source: 'weightKg', target: 'weightG', from: 'kg', to: 'g' } }` |
| `parseNumber` | Locale-aware parse | `{ op: 'parseNumber', args: { source: 'euro', target: 'num', locale: 'de-DE' } }` |
| `formatNumber` | Format number | `{ op: 'formatNumber', args: { source: 'price', target: 'display', style: 'currency', currency: 'USD' } }` |

Math operations: `add`, `subtract`, `multiply`, `divide`, `modulo`, `power`, `round`, `floor`, `ceil`, `abs`

### Date Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `dateParse` | Parse date string | `{ op: 'dateParse', args: { source: 'dateStr', target: 'date', format: 'YYYY-MM-DD' } }` |
| `dateFormat` | Format to string | `{ op: 'dateFormat', args: { source: 'createdAt', target: 'display', format: 'DD/MM/YYYY HH:mm' } }` |
| `dateAdd` | Add/subtract time | `{ op: 'dateAdd', args: { source: 'orderDate', target: 'dueDate', amount: 7, unit: 'days' } }` |
| `dateDiff` | Calculate difference | `{ op: 'dateDiff', args: { startDate: 'orderDate', endDate: 'deliveredAt', unit: 'days', target: 'duration' } }` |
| `now` | Current timestamp | `{ op: 'now', args: { target: 'processedAt', format: 'ISO' } }` |

### Array Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `flatten` | Flatten nested arrays | `{ op: 'flatten', args: { source: 'nested', target: 'flat', depth: 1 } }` |
| `unique` | Remove duplicates | `{ op: 'unique', args: { source: 'items', key: 'id', target: 'uniqueItems' } }` |
| `first` | Get first element | `{ op: 'first', args: { source: 'items', target: 'firstItem' } }` |
| `last` | Get last element | `{ op: 'last', args: { source: 'items', target: 'lastItem' } }` |
| `count` | Count elements | `{ op: 'count', args: { source: 'items', target: 'itemCount' } }` |
| `expand` | Explode to records | `{ op: 'expand', args: { source: 'variants' } }` |

### JSON Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `pick` | Keep only fields | `{ op: 'pick', args: { fields: ['id', 'name', 'sku'] } }` |
| `omit` | Remove fields | `{ op: 'omit', args: { fields: ['_internal', 'tempId'] } }` |
| `parseJson` | Parse JSON string | `{ op: 'parseJson', args: { source: 'metaJson', target: 'meta' } }` |
| `stringifyJson` | Stringify object | `{ op: 'stringifyJson', args: { source: 'data', target: 'dataJson' } }` |

### Conditional Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `when` | Filter records | `{ op: 'when', args: { conditions: [{ field: 'stock', cmp: 'gt', value: 0 }], action: 'keep' } }` |
| `ifThenElse` | Conditional value | `{ op: 'ifThenElse', args: { condition: { field: 'type', cmp: 'eq', value: 'digital' }, thenValue: true, elseValue: false, target: 'isDigital' } }` |
| `switch` | Multi-case mapping | `{ op: 'switch', args: { source: 'code', cases: [{ value: 'A', result: 'Active' }], default: 'Unknown', target: 'status' } }` |

Comparison operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `matches` (regex)

### Validation Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `validateRequired` | Check required fields | `{ op: 'validateRequired', args: { fields: ['sku', 'name', 'price'] } }` |
| `validateFormat` | Regex validation | `{ op: 'validateFormat', args: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$' } }` |

### Advanced Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `coalesce` | First non-null | `{ op: 'coalesce', args: { fields: ['name', 'title', 'label'], target: 'displayName' } }` |
| `default` | Default if null | `{ op: 'default', args: { path: 'stock', value: 0 } }` |
| `hash` | Hash value | `{ op: 'hash', args: { source: 'data', target: 'checksum', algorithm: 'sha256' } }` |
| `uuid` | Generate UUID | `{ op: 'uuid', args: { target: 'id', version: 'v4' } }` |
| `deltaFilter` | Change detection | `{ op: 'deltaFilter', args: { idPath: 'sku', includePaths: ['price', 'stock'] } }` |
| `aggregate` | Aggregate values | `{ op: 'aggregate', args: { operation: 'sum', source: 'amount', target: 'total' } }` |
| `script` | Custom JavaScript | See Script Operator section below |

### Script Operator

Execute custom JavaScript for complex transformations:

```typescript
// Single record mode
.transform('enrich', {
    operators: [{
        op: 'script',
        args: {
            code: `
                const margin = (record.price - record.cost) / record.price * 100;
                return { ...record, margin: Math.round(margin * 100) / 100 };
            `,
        },
    }],
})

// Batch mode - access all records
.transform('rank', {
    operators: [{
        op: 'script',
        args: {
            batch: true,
            code: `
                const sorted = records.sort((a, b) => b.sales - a.sales);
                return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
            `,
        },
    }],
})

// Filter mode - return null to exclude
.transform('filter', {
    operators: [{
        op: 'script',
        args: {
            code: `return record.stock > 0 ? record : null;`,
        },
    }],
})
```

---

## Loaders

### Available Loaders

| Loader | Code | Description |
|--------|------|-------------|
| Product Upsert | `productUpsert` | Create/update products with variants, prices, tax, and stock |
| Variant Upsert | `variantUpsert` | Update product variants by SKU with multi-currency prices |
| Customer Upsert | `customerUpsert` | Create/update customers with addresses and group assignments |
| Stock Adjust | `stockAdjust` | Adjust inventory levels by SKU and stock location |
| Collection Upsert | `collectionUpsert` | Create/update collections with parent relationships |
| Promotion Upsert | `promotionUpsert` | Create/update promotions with conditions and actions |
| Order Note | `orderNote` | Add public or private notes to orders |
| Order Transition | `orderTransition` | Transition order state (e.g., to Shipped) |
| Apply Coupon | `applyCoupon` | Apply coupon codes to orders |
| Asset Attach | `assetAttach` | Attach assets as featured image to products/collections |
| Tax Rate Upsert | `taxRateUpsert` | Create/update tax rates with category and zone |
| Payment Method Upsert | `paymentMethodUpsert` | Configure payment methods with handlers |
| Channel Upsert | `channelUpsert` | Create/update channels with currencies and languages |
| REST Post | `restPost` | Send data to external REST APIs (webhooks, integrations) |

### Product Loader

```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'source-wins',             // source-wins, vendure-wins, merge
    channel: '__default_channel__',
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    skuField: 'sku',
    priceField: 'priceInCents',
    taxCategoryCode: 'standard',
    stockField: 'stock',
    trackInventory: true,
})
```

### Stock Adjust Loader

```typescript
.load('update-stock', {
    adapterCode: 'stockAdjust',
    skuField: 'sku',
    stockField: 'quantity',
    locationField: 'warehouseId',
    mode: 'absolute',                    // absolute or delta
})
```

### Customer Loader

```typescript
.load('import-customers', {
    adapterCode: 'customerUpsert',
    emailField: 'email',
    firstNameField: 'firstName',
    lastNameField: 'lastName',
    phoneField: 'phone',
    addressField: 'addresses',           // Array of address objects
    groupMode: 'add',                    // add, replace, or remove
    groupsField: 'customerGroups',
})
```

### REST Post Loader (Exports)

```typescript
.load('send-to-webhook', {
    adapterCode: 'restPost',
    endpoint: 'https://webhook.example.com/products',
    method: 'POST',
    batchMode: 'array',                  // array or single
    maxBatchSize: 100,
    headers: { 'X-API-Key': '${secret:api-key}' },
    auth: 'bearer',
    bearerTokenSecretCode: 'api-key',
    retries: 3,
    timeoutMs: 30000,
})
```

---

## Hooks

Hooks let you run code at 18 different pipeline stages. Two types:
- **Interceptors**: Modify the record array (return modified records)
- **Observation hooks**: Side effects only (webhooks, events, logging)

### Hook Stages

**Data Processing:**
- `beforeExtract`, `afterExtract`
- `beforeTransform`, `afterTransform`
- `beforeValidate`, `afterValidate`
- `beforeEnrich`, `afterEnrich`
- `beforeRoute`, `afterRoute`
- `beforeLoad`, `afterLoad`

**Pipeline Lifecycle:**
- `pipelineStarted`, `pipelineCompleted`, `pipelineFailed`
- `onError`, `onRetry`, `onDeadLetter`

### Hook Types

| Type | Purpose | Can Modify Records |
|------|---------|-------------------|
| `interceptor` | Inline JavaScript code | Yes |
| `script` | Pre-registered functions | Yes |
| `webhook` | HTTP POST notification | No |
| `emit` | Vendure domain event | No |
| `triggerPipeline` | Start another pipeline | No |

### Interceptor Hooks

Inline JavaScript that can modify records:

```typescript
const pipeline = createPipeline()
    .name('With Interceptors')
    .hooks({
        afterExtract: [{
            type: 'interceptor',
            name: 'Add metadata',
            code: `
                return records.map(r => ({
                    ...r,
                    extractedAt: new Date().toISOString(),
                    source: 'api',
                }));
            `,
        }],
        beforeTransform: [{
            type: 'interceptor',
            name: 'Filter low stock',
            code: `return records.filter(r => r.stock > 0);`,
            failOnError: true,
        }],
        beforeLoad: [{
            type: 'interceptor',
            name: 'Final validation',
            code: `
                return records.filter(r => {
                    if (!r.sku || !r.name) {
                        console.warn('Skipping invalid record:', r.id);
                        return false;
                    }
                    return true;
                });
            `,
        }],
    })
    // ... steps
    .build();
```

### Script Hooks

Reference pre-registered functions (type-safe, reusable):

```typescript
// Register scripts at startup
hookService.registerScript('addCustomerSegment', async (records, context, args) => {
    const threshold = args?.spendThreshold || 1000;
    return records.map(r => ({
        ...r,
        segment: r.totalSpent > threshold ? 'premium' : 'standard',
    }));
});

// Use in pipeline
const pipeline = createPipeline()
    .hooks({
        afterTransform: [{
            type: 'script',
            scriptName: 'addCustomerSegment',
            args: { spendThreshold: 5000 },
        }],
    })
    .build();
```

### Webhook Hooks

Notify external systems:

```typescript
.hooks({
    pipelineCompleted: [{
        type: 'webhook',
        url: 'https://slack.webhook.example.com/notify',
        headers: { 'Content-Type': 'application/json' },
        secret: 'webhook-signing-key',
        signatureHeader: 'X-Signature',
        retryConfig: {
            maxAttempts: 5,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            backoffMultiplier: 2,
        },
    }],
    pipelineFailed: [{
        type: 'webhook',
        url: 'https://pagerduty.example.com/alert',
    }],
})
```

### Trigger Pipeline Hooks

Chain pipelines together:

```typescript
.hooks({
    afterLoad: [{
        type: 'triggerPipeline',
        pipelineCode: 'reindex-search',  // Runs with loaded records as seed
    }],
})
```

---

## Product Feeds

Generate feeds for advertising platforms.

### Google Merchant Center

```typescript
.feed('google-feed', {
    adapterCode: 'feed-generator',
    feedType: 'google-merchant',
    format: 'xml',                       // xml or tsv
    targetCountry: 'US',
    contentLanguage: 'en',
    currency: 'USD',
    includeVariants: true,
    includeOutOfStock: false,
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'price',
    imageField: 'featuredAsset.preview',
    brandField: 'customFields.brand',
    gtinField: 'customFields.gtin',
})
```

### Meta/Facebook Catalog

```typescript
.feed('meta-catalog', {
    adapterCode: 'feed-generator',
    feedType: 'meta-catalog',
    format: 'csv',
    catalogId: 'your-catalog-id',
    businessId: 'your-business-id',
})
```

### Amazon Feed

```typescript
.feed('amazon-feed', {
    adapterCode: 'feed-generator',
    feedType: 'amazon',
    marketplace: 'US',                   // US, UK, DE, FR, CA
    feedCategory: 'product',             // product, inventory, pricing
})
```

### Custom Feed

```typescript
.feed('custom-feed', {
    adapterCode: 'feed-generator',
    feedType: 'custom',
    format: 'json',                      // xml, csv, json, tsv
    rootElement: 'products',
    itemElement: 'product',
    fieldMapping: {
        product_id: 'id',
        product_name: 'name',
        product_price: 'priceFormatted',
    },
})
```

---

## Search Engine Sync

Index products to search engines.

### Elasticsearch

```typescript
.sink('elasticsearch', {
    adapterCode: 'search-sink',
    sinkType: 'elasticsearch',
    nodes: ['http://localhost:9200'],
    indexName: 'products',
    idField: 'id',
    bulkSize: 500,
    upsert: true,
    refresh: 'wait_for',
})
```

### MeiliSearch

```typescript
.sink('meilisearch', {
    adapterCode: 'search-sink',
    sinkType: 'meilisearch',
    host: 'http://localhost:7700',
    apiKey: '${secret:meilisearch-key}',
    indexName: 'products',
    primaryKey: 'id',
    searchableAttributes: ['name', 'description', 'sku'],
    filterableAttributes: ['category', 'brand', 'price'],
    sortableAttributes: ['price', 'createdAt'],
})
```

### Algolia

```typescript
.sink('algolia', {
    adapterCode: 'search-sink',
    sinkType: 'algolia',
    applicationId: 'your-app-id',
    apiKeySecretCode: 'algolia-admin-key',
    indexName: 'products',
    idField: 'objectID',
})
```

### Typesense

```typescript
.sink('typesense', {
    adapterCode: 'search-sink',
    sinkType: 'typesense',
    host: 'localhost',
    port: 8108,
    protocol: 'http',
    apiKeySecretCode: 'typesense-key',
    collectionName: 'products',
})
```

---

## Scheduling & Triggers

### Manual Trigger

```typescript
.trigger('start', { type: 'manual' })
```

### Cron Schedule

```typescript
.trigger('schedule', {
    type: 'schedule',
    cron: '0 2 * * *',                   // Daily at 2 AM
    timezone: 'America/New_York',
})
```

Common patterns:
- `0 * * * *` - Every hour
- `0 0 * * *` - Daily at midnight
- `0 2 * * *` - Daily at 2 AM
- `0 0 * * 0` - Weekly on Sunday
- `0 0 1 * *` - Monthly on the 1st

### Webhook Trigger

```typescript
.trigger('webhook', {
    type: 'webhook',
    authentication: 'API_KEY',      // 'NONE' | 'API_KEY' | 'HMAC' | 'BASIC' | 'JWT'
    apiKeySecretCode: 'my-api-key', // Secret code storing the API key
    apiKeyHeaderName: 'x-api-key',  // Header name for API key (default: x-api-key)
    rateLimit: 100,                 // Requests per minute per IP (0 = unlimited)
    requireIdempotencyKey: true,    // Require X-Idempotency-Key header
})
```

**Authentication Types:**

| Type | Description | Configuration |
|------|-------------|---------------|
| `NONE` | No authentication (not recommended) | - |
| `API_KEY` | API key in header | `apiKeySecretCode`, `apiKeyHeaderName`, `apiKeyPrefix` |
| `HMAC` | HMAC-SHA256 signature | `secretCode`, `hmacHeaderName`, `hmacAlgorithm` |
| `BASIC` | HTTP Basic Auth | `basicSecretCode` (stores `username:password`) |
| `JWT` | JWT Bearer token | `jwtSecretCode`, `jwtHeaderName` |

**Example - HMAC Authentication:**
```typescript
.trigger('webhook', {
    type: 'webhook',
    authentication: 'HMAC',
    secretCode: 'hmac-secret',        // Secret code storing HMAC key
    hmacHeaderName: 'x-signature',    // Header name (default: x-datahub-signature)
    hmacAlgorithm: 'sha256',          // sha256 or sha512
})
```

**Endpoint:** `POST /data-hub/webhook/{pipeline-code}`

**Security Features:**
- Timing-safe comparison for all credential checks
- Configurable rate limiting per pipeline
- IP-based rate limiting with sliding window
- JWT expiration validation

### Event Trigger

```typescript
.trigger('on-order', {
    type: 'event',
    event: 'OrderPlacedEvent',
    filter: { state: 'ArrangingPayment' },
})
```

---

## Admin UI Features

The plugin includes a full-featured admin dashboard:

### Pipeline Editor
- **Simple Mode**: JSON text editor with syntax highlighting
- **Visual Mode**: Drag-and-drop workflow builder with node palette
- Live validation with error highlighting
- Step tester for testing individual steps

### Dry Run
- Execute pipeline without persisting changes
- View record diffs (before/after transformations)
- Metrics summary (processed, succeeded, failed, skipped)
- Step-by-step execution details

### Monitoring
- Real-time execution logs with filtering
- Analytics dashboard with metrics
- Per-pipeline health stats
- Error rate tracking

### Queue Management
- View pending, running, and failed jobs
- Dead letter queue for quarantined records
- Retry failed records with payload patching

### Hooks Testing
- Test any of the 18 hook stages
- View recent events
- Hook configuration viewer

---

## Secrets & Connections

### Code-First Secrets

```typescript
DataHubPlugin.init({
    secrets: [
        { code: 'api-key', provider: 'env', value: 'SUPPLIER_API_KEY' },
        { code: 'ftp-pass', provider: 'inline', value: 'secret123' },
    ],
})
```

### Code-First Connections

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'supplier-db',
            type: 'postgres',
            name: 'Supplier Database',
            settings: {
                host: '${DB_HOST}',
                port: 5432,
                database: 'supplier',
                username: '${DB_USER}',
                password: '${DB_PASSWORD}',
            },
        },
        {
            code: 'sftp-server',
            type: 'sftp',
            name: 'Supplier SFTP',
            settings: {
                host: 'sftp.supplier.com',
                port: 22,
                username: '${SFTP_USER}',
                privateKeySecretCode: 'sftp-key',
            },
        },
    ],
})
```

---

## Custom Adapters

### Custom Operator

```typescript
import { OperatorDefinition } from '@oronts/vendure-data-hub-plugin';

const currencyConvert: OperatorDefinition = {
    code: 'currencyConvert',
    type: 'operator',
    name: 'Currency Convert',
    description: 'Convert between currencies',
    pure: true,
    schema: {
        fields: [
            { key: 'field', type: 'string', required: true },
            { key: 'from', type: 'string', required: true },
            { key: 'to', type: 'string', required: true },
            { key: 'targetField', type: 'string', required: false },
        ],
    },
    handler: async (record, args) => {
        const rate = getExchangeRate(args.from, args.to);
        const value = record[args.field] * rate;
        return { ...record, [args.targetField || args.field]: value };
    },
};

DataHubPlugin.init({
    adapters: [currencyConvert],
})
```

### Custom Extractor

```typescript
import { ExtractorDefinition } from '@oronts/vendure-data-hub-plugin';

const myExtractor: ExtractorDefinition = {
    code: 'my-extractor',
    type: 'extractor',
    name: 'My Custom Source',
    schema: {
        fields: [
            { key: 'endpoint', type: 'string', required: true },
        ],
    },
    handler: async (ctx, config, executorCtx) => {
        const response = await fetch(config.endpoint);
        const data = await response.json();
        return data.items;
    },
};
```

### Custom Loader

```typescript
import { LoaderDefinition } from '@oronts/vendure-data-hub-plugin';

const webhookNotify: LoaderDefinition = {
    code: 'webhookNotify',
    type: 'loader',
    name: 'Webhook Notify',
    schema: {
        fields: [
            { key: 'endpoint', type: 'string', required: true },
            { key: 'batchMode', type: 'string', required: false },
        ],
    },
    handler: async (ctx, config, records) => {
        await fetch(config.endpoint, {
            method: 'POST',
            body: JSON.stringify(records),
        });
        return { succeeded: records.length, failed: 0 };
    },
};
```

---

## Permissions

| Permission | Description |
|------------|-------------|
| `CreateDataHubPipeline` | Create pipelines |
| `ReadDataHubPipeline` | View pipelines |
| `UpdateDataHubPipeline` | Modify pipelines |
| `DeleteDataHubPipeline` | Delete pipelines |
| `RunDataHubPipeline` | Execute pipelines |
| `PublishDataHubPipeline` | Publish pipeline versions |
| `ReviewDataHubPipeline` | Review/approve pipelines |
| `CreateDataHubSecret` | Create secrets |
| `ReadDataHubSecret` | View secrets (values masked) |
| `UpdateDataHubSecret` | Modify secrets |
| `DeleteDataHubSecret` | Delete secrets |
| `ManageDataHubConnections` | Manage connections |
| `ManageDataHubAdapters` | Configure adapters |
| `ViewDataHubRuns` | View execution history |
| `RetryDataHubRecord` | Retry failed records |
| `ViewQuarantine` | View dead letter queue |
| `EditQuarantine` | Manage quarantined records |
| `ReplayRecord` | Replay processed records |
| `UpdateDataHubSettings` | Modify plugin settings |

---

## Pipeline Capabilities

Require specific Vendure permissions to run a pipeline:

```typescript
const importPipeline = createPipeline()
    .capabilities({ requires: ['UpdateCatalog', 'UpdateStock'] })
    // ...

const exportPipeline = createPipeline()
    .capabilities({ requires: ['ReadCustomer', 'ReadOrder'] })
    // ...
```

---

## Error Handling

### Pipeline-Level

```typescript
const pipeline = createPipeline()
    .context({
        errorHandling: {
            strategy: 'continue',        // continue, stop, dead-letter
            maxRetries: 3,
            retryDelayMs: 1000,
        },
    })
    .build();
```

### Step-Level

```typescript
.load('import', {
    adapterCode: 'productUpsert',
    errorHandling: {
        mode: 'queue',                   // stop, continue, queue, dead-letter
        retryAttempts: 3,
        retryDelayMs: 1000,
    },
})
```

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Vendure | ^3.0.0 |
| Node.js | >=18.0.0 |

## Documentation

- [Getting Started](./docs/getting-started/README.md)
- [User Guide](./docs/user-guide/README.md)
- [Developer Guide](./docs/developer-guide/README.md)
- [API Reference](./docs/reference/README.md)
- [Deployment](./docs/deployment/README.md)

---

## License

**Commercial plugin** - Free for non-commercial use.

### Free Use
- Personal projects, learning, evaluation
- Open-source non-commercial projects

### Commercial License Required
- Business/commercial use
- E-commerce stores generating revenue
- Client projects, agency work
- SaaS platforms

Contact **office@oronts.com** for licensing.

---

## Consulting & Custom Development

<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/assets/images/logo/favicon.png" alt="Oronts" width="60" height="60">
  </a>
</p>

**Oronts** provides custom development and integration services:

- Data Hub customization and integrations
- Full-stack Vendure development
- E-commerce platform implementation
- AI-powered automation

**Contact:** office@oronts.com | [oronts.com](https://oronts.com)

---

**Author:** [Oronts](https://oronts.com) - AI-powered automation, e-commerce platforms, cloud infrastructure.

**Contributors:** Refaat Al Ktifan (Refaat@alktifan.com)
