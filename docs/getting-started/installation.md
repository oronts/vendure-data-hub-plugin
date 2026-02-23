# Installation

## Install the Package

```bash
npm install @oronts/vendure-data-hub-plugin
```

## Add to Vendure Config

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

## Run Migrations

The plugin creates database tables for pipelines, runs, connections, secrets, and logs. Run migrations to create these tables:

```bash
npx vendure migrate
```

## Verify Installation

1. Start your Vendure server
2. Open the Admin UI
3. Look for "Data Hub" in the left navigation menu

If you see the Data Hub menu item, the plugin is installed correctly.

## Configuration Options

The `DataHubPlugin.init()` method accepts these options:

```typescript
DataHubPlugin.init({
    // Enable or disable the plugin
    enabled: true,

    // Register built-in adapters (extractors, operators, loaders)
    // Set to false if you only want custom adapters
    registerBuiltinAdapters: true,

    // Days to keep pipeline run history (default: 30)
    retentionDaysRuns: 30,

    // Days to keep error records (default: 90)
    retentionDaysErrors: 90,

    // Enable debug logging for pipeline execution
    debug: false,

    // Code-first pipelines (see Developer Guide)
    pipelines: [],

    // Code-first secrets
    secrets: [],

    // Code-first connections
    connections: [],

    // Custom import templates for the import wizard
    importTemplates: [],

    // Custom export templates for the export wizard
    exportTemplates: [],

    // Named script functions for pipeline hook actions
    scripts: {},

    // Path to external config file (YAML or JSON)
    configPath: undefined,
})
```

## Code-First Configuration

You can define pipelines, secrets, and connections directly in code. These are synced to the database on startup.

### Secrets

Define secrets in code. Use `provider: 'ENV'` to read from environment variables:

```typescript
DataHubPlugin.init({
    secrets: [
        // Read from environment variable
        { code: 'supplier-api-key', provider: 'ENV', value: 'SUPPLIER_API_KEY' },

        // Inline value (not recommended for production)
        { code: 'test-secret', provider: 'INLINE', value: 'secret-value' },
    ],
})
```

### Connections

Define external connections (databases, APIs):

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'supplier-db',
            type: 'postgres',
            name: 'Supplier Database',
            settings: {
                host: '${DB_HOST}',        // Reads from DB_HOST env var
                port: 5432,
                database: 'supplier',
                username: '${DB_USER}',
                password: '${DB_PASSWORD}',
            },
        },
        {
            code: 'erp-api',
            type: 'http',
            name: 'ERP API',
            settings: {
                baseUrl: 'https://erp.example.com/api',
                timeout: 30000,
            },
        },
    ],
})
```

### Pipelines

Define pipelines using the DSL (see [Developer Guide](../developer-guide/dsl/pipeline-builder.md)):

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const pipeline = createPipeline()
    .name('Product Sync')
    .trigger('start', { type: 'SCHEDULE', cron: '0 2 * * *' })
    .extract('fetch', { adapterCode: 'httpApi', url: 'https://api.example.com/products' })
    .load('import', { adapterCode: 'productUpsert', strategy: 'UPSERT', matchField: 'slug' })
    .edge('start', 'fetch')
    .edge('fetch', 'import')
    .build();

DataHubPlugin.init({
    pipelines: [{
        code: 'product-sync',
        name: 'Product Sync',
        enabled: true,
        definition: pipeline,
    }],
})
```

## Templates

Register custom templates for the import and export wizards:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

DataHubPlugin.init({
    importTemplates: [
        {
            id: 'my-product-import',
            name: 'My Product Import',
            description: 'Import products from our custom format',
            category: 'products',
            requiredFields: ['sku', 'name', 'price'],
            featured: true,
            tags: ['custom'],
            formats: ['CSV', 'JSON'],
            definition: {
                sourceType: 'FILE',
                targetEntity: 'Product',
                existingRecords: 'UPDATE',
                lookupFields: ['sku'],
                fieldMappings: [
                    { sourceField: 'sku', targetField: 'sku' },
                    { sourceField: 'name', targetField: 'name' },
                    { sourceField: 'price', targetField: 'price' },
                ],
            },
        },
    ],
    exportTemplates: [
        {
            id: 'my-product-export',
            name: 'My Product Export',
            description: 'Export products in custom JSON format',
            format: 'JSON',
            tags: ['custom'],
            definition: {
                sourceEntity: 'Product',
                formatOptions: { pretty: true },
            },
        },
    ],
})
```

The plugin ships with built-in templates for common scenarios (CSV imports, API syncs, Google Shopping feeds, etc.). Custom templates are merged with built-in ones and shown in the wizard UI.

### Connector Templates

Connectors (like Pimcore) ship their own wizard templates. Built-in export templates are served automatically by the `TemplateRegistryService`. Include connector templates alongside the import defaults:

```typescript
import { DataHubPlugin, DEFAULT_IMPORT_TEMPLATES } from '@oronts/vendure-data-hub-plugin';
import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';

DataHubPlugin.init({
    importTemplates: [
        ...DEFAULT_IMPORT_TEMPLATES,
        ...(PimcoreConnector.importTemplates ?? []),
    ],
    exportTemplates: [
        ...(PimcoreConnector.exportTemplates ?? []),
    ],
})
```

This makes the Pimcore connector's 4 import templates (Product, Category, Asset, Facet Sync) and 1 export template appear in the wizard alongside the built-in templates.

## Pipeline Scripts

Register named script functions that can modify records at any hook stage:

```typescript
import { DataHubPlugin, ScriptFunction } from '@oronts/vendure-data-hub-plugin';

DataHubPlugin.init({
    scripts: {
        'validate-sku': async (records, context) => {
            return records.filter(r => r.sku && String(r.sku).length > 0);
        },
        'enrich-pricing': async (records, context) => {
            return records.map(r => ({
                ...r,
                priceInCents: Number(r.price) * 100,
            }));
        },
        'add-import-metadata': async (records, context) => {
            return records.map(r => ({
                ...r,
                importedAt: Date.now(),
                pipelineId: context.pipelineId,
            }));
        },
    },
})
```

Then reference scripts in pipeline hook definitions:

```typescript
const pipeline = createPipeline()
    .name('Product Import')
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch', { adapterCode: 'httpApi', url: 'https://api.example.com/products' })
    .load('import', { adapterCode: 'productUpsert', strategy: 'UPSERT', matchField: 'sku' })
    .hooks({
        AFTER_EXTRACT: [{ type: 'SCRIPT', scriptName: 'validate-sku' }],
        BEFORE_LOAD: [{ type: 'SCRIPT', scriptName: 'enrich-pricing' }],
        AFTER_LOAD: [{ type: 'SCRIPT', scriptName: 'add-import-metadata' }],
    })
    .edge('start', 'fetch')
    .edge('fetch', 'import')
    .build();
```

## External Config File

For complex configurations, use an external YAML or JSON file:

```typescript
DataHubPlugin.init({
    configPath: './data-hub-config.yaml',
})
```

Example `data-hub-config.yaml`:

```yaml
secrets:
  - code: api-key
    provider: env
    value: API_KEY

connections:
  - code: supplier-db
    type: postgres
    name: Supplier Database
    settings:
      host: ${DB_HOST}
      port: 5432
      database: supplier

pipelines:
  - code: daily-sync
    name: Daily Product Sync
    enabled: true
    definition:
      version: 1
      steps:
        - key: trigger
          type: TRIGGER
          config:
            type: SCHEDULE
            cron: "0 2 * * *"
        - key: extract
          type: EXTRACT
          config:
            adapterCode: httpApi
            url: https://api.example.com/products
```

## Event Subscriptions

Data Hub emits domain events at every stage of the pipeline lifecycle (run started, completed, failed, step progress, gate approvals, webhook deliveries, etc.). You can subscribe to these events from any Vendure plugin to build monitoring dashboards, send notifications, or integrate with external systems. See the [Event Subscriptions guide](../developer-guide/extending/events.md) for the full event catalog and code examples.

## Next Steps

- [Quick Start](./quick-start.md) - Create your first pipeline
- [Core Concepts](./concepts.md) - Understand how pipelines work
