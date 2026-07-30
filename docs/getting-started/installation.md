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

The plugin registers database tables for pipelines, runs, connections, secrets,
schemas, destinations, feeds, logs, checkpoints, and runtime state. Generate and
run a migration from the host Vendure application:

```bash
npx vendure migrate
```

Production installations must keep TypeORM synchronization disabled. See the
[migration guide](../deployment/migrations.md) for generation and review steps.

## Verify Installation

1. Start your Vendure server
2. Open the Admin UI
3. Look for "Data Hub" in the left navigation menu

Seeing the Data Hub menu confirms that the dashboard extension loaded. Also
verify the host migration, authenticated Admin API, worker queues, and one
representative pipeline before treating the installation as operational.

## Configuration Options

The `DataHubPlugin.init()` method accepts these options:

```typescript
DataHubPlugin.init({
    // Enable or disable the plugin
    enabled: true,

    // Register built-in adapters (extractors, operators, loaders)
    // Set to false if you only want custom adapters
    registerBuiltinAdapters: true,

    // 0..365 days; 0 disables cleanup (default: 30)
    retentionDaysRuns: 30,

    // 0..365 days; 0 disables cleanup (default: 90)
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

    // Optional OpenTelemetry Collector base URL.
    // /v1/metrics and /v1/traces are appended automatically.
    telemetry: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? {
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        serviceName: 'vendure-data-hub',
        environment: process.env.NODE_ENV,
        headers: process.env.OTEL_EXPORTER_OTLP_API_KEY
            ? { 'x-api-key': process.env.OTEL_EXPORTER_OTLP_API_KEY }
            : undefined,
    } : undefined,
})
```

Telemetry export is disabled when `telemetry` is omitted or
`telemetry.enabled` is `false`. It uses OTLP/HTTP JSON and native Node.js
networking, so no telemetry SDK or vendor agent is required. Configure the same
collector settings on every Vendure API server and worker whose process-local
metrics and spans should be visible. Collector headers should come from
environment variables or another deployment secret source.

## Code-First Configuration

You can define pipelines, secrets, and connections directly in code. Pipelines and connections are synced to the database on startup; code-first secrets stay in memory and take precedence during runtime resolution.

### Secrets

Define secrets in code. Use `provider: 'ENV'` to read from environment variables:

```typescript
DataHubPlugin.init({
    secrets: [
        // Read from environment variable
        { code: 'supplier-api-key', provider: 'ENV', value: 'SUPPLIER_API_KEY' },
        { code: 'supplier-db-password', provider: 'ENV', value: 'SUPPLIER_DB_PASSWORD' },

        // Environment-variable names must use A-Z, 0-9, and underscores
        { code: 'test-secret', provider: 'ENV', value: 'TEST_SECRET' },
    ],
})
```

ENV values are variable names, not fallback expressions. Code-first INLINE values remain plaintext in TypeScript, JSON, or YAML and are rejected in production even when DATAHUB_MASTER_KEY is configured. Use ENV for deployed code-first configuration and provide the referenced variable to every API server and worker.

### Connections

Define external connections (databases, APIs):

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'supplier-db',
            type: 'POSTGRES',
            settings: {
                host: '${DB_HOST}',        // Reads from DB_HOST env var
                port: 5432,
                database: 'supplier',
                username: '${DB_USER}',
                passwordSecretCode: 'supplier-db-password',
            },
        },
        {
            code: 'erp-api',
            type: 'HTTP',
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
    .load('import', { adapterCode: 'productUpsert', strategy: 'UPSERT', slugField: 'slug' })
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

### Connector Pipelines

Pimcore uses configuration-aware generated pipelines rather than generic
import-wizard cards. Its `connectionCode` may reference a saved `HTTP`, `REST`,
or `GRAPHQL` connection with `baseUrl`; authentication remains Secret-backed.
Follow the canonical [Pimcore connector setup](../../connectors/pimcore/README.md#configuration)
for registration, schema mapping, endpoint verification, and generated
pipelines. Connector registration never persists pipelines implicitly.

## Pipeline Scripts

Register named script functions that can modify records at the 18 data-processing
hook stages. Lifecycle and error stages accept observation actions instead:

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
    .load('import', { adapterCode: 'productUpsert', strategy: 'UPSERT', slugField: 'slug', skuField: 'sku' })
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

When configPath is set, the file is required startup configuration. Missing, unreadable, unsupported, malformed, or non-object JSON/YAML aborts startup. Secrets from the file are validated and published in memory before secret consumers initialize; they are not persisted. Inline plugin secret options are applied after file secrets and therefore win on cross-source code collisions. Duplicate secret codes within either source are rejected.

Do not put production INLINE secret values in this file. A master key protects database-backed INLINE values only; it cannot encrypt plaintext already stored in YAML or JSON.

Example `data-hub-config.yaml`:

```yaml
secrets:
  - code: api-key
    provider: ENV
    value: API_KEY
  - code: supplier-db-password
    provider: ENV
    value: SUPPLIER_DB_PASSWORD

connections:
  - code: supplier-db
    type: POSTGRES
    settings:
      host: ${DB_HOST}
      port: 5432
      database: supplier
      username: ${DB_USER}
      passwordSecretCode: supplier-db-password

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
