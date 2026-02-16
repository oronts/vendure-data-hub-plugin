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

    // Path to external config file (YAML or JSON)
    configPath: undefined,
})
```

## Code-First Configuration

You can define pipelines, secrets, and connections directly in code. These are synced to the database on startup.

### Secrets

Define secrets in code. Use `provider: 'env'` to read from environment variables:

```typescript
DataHubPlugin.init({
    secrets: [
        // Read from environment variable
        { code: 'supplier-api-key', provider: 'env', value: 'SUPPLIER_API_KEY' },

        // Inline value (not recommended for production)
        { code: 'test-secret', provider: 'inline', value: 'secret-value' },
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

## Next Steps

- [Quick Start](./quick-start.md) - Create your first pipeline
- [Core Concepts](./concepts.md) - Understand how pipelines work
