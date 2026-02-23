# Step Types Reference

Complete reference for all pipeline step types.

## Overview

Every pipeline is composed of steps connected by edges. Each step has a **type**
that determines its role in the data flow. The `StepType` enum defines the
following 11 step types:

| Step Type | Purpose |
|-----------|---------|
| `TRIGGER` | Starts pipeline execution |
| `EXTRACT` | Pulls data from external sources |
| `TRANSFORM` | Modifies records with operators |
| `VALIDATE` | Validates records against rules |
| `ENRICH` | Adds data from external lookups |
| `ROUTE` | Splits data flow by conditions |
| `LOAD` | Creates or updates Vendure entities |
| `EXPORT` | Sends data to external destinations |
| `FEED` | Generates product feeds |
| `SINK` | Indexes data to search engines and queues |
| `GATE` | Human-in-the-loop approval gate |

---

## TRIGGER

Defines how a pipeline starts. Every pipeline must have exactly one trigger step
as its root node.

**Trigger types:** `MANUAL`, `SCHEDULE`, `WEBHOOK`, `EVENT`, `FILE`, `MESSAGE`

See [Pipeline Builder - trigger](../developer-guide/dsl/pipeline-builder.md#trigger) for full configuration.

---

## EXTRACT

Pulls data from external sources into the pipeline. Supports HTTP APIs, GraphQL
endpoints, files, databases, S3, FTP, CDC, and Vendure entity queries.

See [Extractors Reference](./extractors.md) for all extractor adapters and their configuration.

---

## TRANSFORM

Modifies records using one or more operators. Supports 61 built-in operators
across 11 categories (data, string, numeric, date, logic, JSON, enrichment,
aggregation, file, validation, and scripting).

Optionally supports per-record retry via `retryPerRecord` configuration.

See [Operators Reference](./operators.md) for all operators and their arguments.

---

## VALIDATE

Validates records against business rules and schemas. Supports `FAIL_FAST`
(stop on first error) and `ACCUMULATE` (collect all errors) modes.

See [Pipeline Builder - validate](../developer-guide/dsl/pipeline-builder.md#validate) for configuration.

---

## ENRICH

Adds data from external lookups to records. Uses adapter-based enrichment
with configurable lookup sources.

See [Pipeline Builder - enrich](../developer-guide/dsl/pipeline-builder.md#enrich) for configuration.

---

## ROUTE

Splits data flow based on field conditions. Each branch defines a set of
conditions using comparison operators (`eq`, `ne`, `gt`, `lt`, `in`,
`contains`, `regex`, etc.). An optional `defaultTo` branch handles
unmatched records.

See [Pipeline Builder - route](../developer-guide/dsl/pipeline-builder.md#route) for configuration.

---

## LOAD

Creates, updates, or deletes Vendure entities. Supports 22 entity types
including products, variants, customers, collections, facets, orders,
promotions, assets, and more.

**Strategies:** `CREATE`, `UPDATE`, `UPSERT`, `MERGE`, `SOFT_DELETE`, `HARD_DELETE`

See [Loaders Reference](./loaders.md) for all loader adapters and their configuration.

---

## EXPORT

Sends data to external destinations including files, S3, SFTP, HTTP, and email.

**Formats:** `CSV`, `JSON`, `XML`, `XLSX`, `NDJSON`, `PARQUET`

**Targets:** `FILE`, `API`, `WEBHOOK`, `S3`, `SFTP`, `EMAIL`

See [Pipeline Builder - export](../developer-guide/dsl/pipeline-builder.md#export) for configuration.

---

## FEED

Generates product feeds for marketing platforms.

**Feed types:** `GOOGLE_SHOPPING`, `META_CATALOG`, `AMAZON`, `CUSTOM`

See [Feed Generators Reference](./feeds.md) for all feed adapters and their configuration.

---

## SINK

Indexes data to search engines and publishes to message queues.

**Sink types:** `ELASTICSEARCH`, `OPENSEARCH`, `MEILISEARCH`, `ALGOLIA`, `TYPESENSE`, `WEBHOOK`, `CUSTOM`

See [Sinks Reference](./sinks.md) for all sink adapters and their configuration.

---

## GATE

Adds a human-in-the-loop approval gate that pauses pipeline execution until
approval is granted. Gates are useful for reviewing data before it is loaded
into Vendure, especially for large or high-risk imports.

### Configuration

```typescript
.gate('step-key', {
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT',
    timeoutSeconds?: number,
    errorThresholdPercent?: number,
    notifyWebhook?: string,
    notifyEmail?: string,
    previewCount?: number,
})
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `approvalType` | string | Yes | Approval mode (see below) |
| `timeoutSeconds` | number | No | Auto-approve after N seconds (`TIMEOUT` mode) |
| `errorThresholdPercent` | number | No | Auto-approve if error rate below threshold, 0-100 (`THRESHOLD` mode) |
| `notifyWebhook` | string | No | Webhook URL to call when gate is reached |
| `notifyEmail` | string | No | Email address to notify when gate is reached |
| `previewCount` | number | No | Number of records to include in the gate preview (default: 10) |

### Approval Types

| Type | Behavior |
|------|----------|
| `MANUAL` | Pipeline pauses until a user explicitly approves or rejects via the dashboard or API |
| `THRESHOLD` | Auto-approves if the upstream error rate is below `errorThresholdPercent`; otherwise pauses for manual review |
| `TIMEOUT` | Auto-approves after `timeoutSeconds` if no manual action is taken |

### Examples

**Manual approval with email notification:**

```typescript
.gate('review-before-load', {
    approvalType: 'MANUAL',
    notifyEmail: 'admin@example.com',
    previewCount: 25,
})
```

**Threshold-based auto-approval:**

```typescript
.gate('error-check', {
    approvalType: 'THRESHOLD',
    errorThresholdPercent: 5,
    notifyWebhook: 'https://hooks.example.com/gate-reached',
})
```

**Timeout-based auto-approval:**

```typescript
.gate('timed-review', {
    approvalType: 'TIMEOUT',
    timeoutSeconds: 3600,
    notifyEmail: 'team@example.com',
    previewCount: 50,
})
```

### Pipeline Example with Gate

```typescript
createPipeline()
    .name('Reviewed Product Import')
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-erp', { adapterCode: 'httpApi', /* ... */ })
    .transform('map-fields', { operators: [ /* ... */ ] })
    .validate('check-data', { errorHandlingMode: 'ACCUMULATE', rules: [ /* ... */ ] })
    .gate('review-before-load', {
        approvalType: 'MANUAL',
        notifyEmail: 'data-team@example.com',
        previewCount: 20,
    })
    .load('upsert-products', { adapterCode: 'productUpsert', strategy: 'UPSERT', matchField: 'slug' })
    .edge('start', 'fetch-erp')
    .edge('fetch-erp', 'map-fields')
    .edge('map-fields', 'check-data')
    .edge('check-data', 'review-before-load')
    .edge('review-before-load', 'upsert-products')
    .build();
```
