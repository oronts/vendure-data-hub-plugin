# Quick Start

Create your first data pipeline in 5 minutes.

## Scenario

We'll build a pipeline that:
1. Fetches products from an external API
2. Maps the fields to Vendure format
3. Creates or updates products in Vendure

## Using the Visual Builder

### Step 1: Create a Pipeline

1. Open the Admin UI
2. Navigate to **Data Hub > Pipelines**
3. Click **Create Pipeline**
4. Enter:
   - Code: `product-import`
   - Name: `Product Import`
5. Click **Create**

### Step 2: Add a Trigger

1. In the pipeline editor, drag a **Trigger** node onto the canvas
2. Configure:
   - Key: `start`
   - Type: `MANUAL`

### Step 3: Add an Extract Step

1. Drag an **Extract** node onto the canvas
2. Configure:
   - Key: `fetch-products`
   - Adapter: `HTTP API`
   - Endpoint: `https://fakestoreapi.com/products`
   - Method: `GET`
3. Connect the trigger to this step

### Step 4: Add a Transform Step

1. Drag a **Transform** node onto the canvas
2. Configure:
   - Key: `map-fields`
3. Add operators:
   - `rename`: from `title` to `name`
   - `template`: target `slug`, template `${id}-${title}`
   - `set`: path `enabled`, value `true`
4. Connect the extract step to this step

### Step 5: Add a Load Step

1. Drag a **Load** node onto the canvas
2. Configure:
   - Key: `create-products`
   - Loader: `Product`
   - Strategy: `UPSERT`
   - Name Field: `name`
   - Slug Field: `slug`
3. Connect the transform step to this step

### Step 6: Save and Run

1. Click **Save**
2. Click **Run Pipeline**
3. Monitor the execution in **Data Hub > Runs**

## Using Code-First DSL

Create the same pipeline using TypeScript:

```typescript
// vendure-config.ts
import { VendureConfig } from '@vendure/core';
import { DataHubPlugin, createPipeline } from '@oronts/vendure-data-hub-plugin';

const productImportPipeline = createPipeline()
    .name('Product Import')
    .description('Import products from Fake Store API')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://fakestoreapi.com/products',
        method: 'GET',
    })
    .transform('map-fields', {
        operators: [
            { op: 'rename', args: { from: 'title', to: 'name' } },
            { op: 'rename', args: { from: 'id', to: 'sku' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .load('create-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
        conflictStrategy: 'SOURCE_WINS',
    })
    .edge('start', 'fetch-products')
    .edge('fetch-products', 'map-fields')
    .edge('map-fields', 'create-products')
    .build();

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            enabled: true,
            pipelines: [{
                code: 'product-import',
                name: 'Product Import',
                definition: productImportPipeline,
            }],
        }),
    ],
};
```

## Running the Pipeline

### Via Admin UI

1. Go to **Data Hub > Pipelines**
2. Find your pipeline
3. Click **Run**

### Via GraphQL

```graphql
mutation {
    runDataHubPipeline(id: "1") {
        id
        status
    }
}
```

### Via Webhook

If configured with a webhook trigger, POST to:
```
POST /data-hub/webhook/product-import
```

## Viewing Results

### Run History

Go to **Data Hub > Runs** to see:
- Start and end times
- Records processed
- Records failed
- Execution logs

### Imported Products

Check **Catalog > Products** to see the imported products.

## Common Patterns

### Import from CSV

```typescript
const csvImport = createPipeline()
    .name('CSV Import')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('parse-csv', {
        adapterCode: 'file',
        path: '/uploads/products.csv',
        format: 'CSV',
        delimiter: ',',
        hasHeader: true,
    })
    .load('import', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })
    .edge('start', 'parse-csv')
    .edge('parse-csv', 'import')
    .build();
```

### Scheduled Sync

```typescript
const scheduledSync = createPipeline()
    .name('Scheduled Sync')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',  // Daily at 2 AM
        timezone: 'UTC',
    })
    .extract('fetch', { adapterCode: 'httpApi', url: 'https://api.example.com/products' })
    .load('sync', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })
    .edge('schedule', 'fetch')
    .edge('fetch', 'sync')
    .build();
```

### Export Products

```typescript
const productExport = createPipeline()
    .name('Product Export')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset',
        batchSize: 100,
    })
    .transform('prepare', {
        operators: [
            { op: 'flatten', args: { source: 'variants' } },
        ],
    })
    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://api.example.com/products',
        method: 'POST',
    })
    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')
    .build();
```

## Next Steps

- [Core Concepts](./concepts.md) - Understand pipelines, steps, and edges
- [Extractors Reference](../reference/extractors.md) - All available data sources
- [Operators Reference](../reference/operators.md) - All transform operators
- [Loaders Reference](../reference/loaders.md) - All entity loaders
