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

Modifies records using one or more operators. Supports 62 built-in operators
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
`contains`, `regex`, etc.).

> **Unmatched records:** In graph execution mode, records that don't match any
> branch condition are collected into a `default` branch. In linear execution
> mode, if no branch matches any records, the step returns an empty result and
> unmatched records are silently dropped. A warning is logged when records are
> dropped. To ensure all records are handled, add a catch-all branch with
> `{ name: 'fallback', when: [] }` (no conditions = always matches) as the
> last branch.

See [Pipeline Builder - route](../developer-guide/dsl/pipeline-builder.md#route) for configuration.

---

## LOAD

Creates, updates, or deletes Vendure entities. Supports 24 loader codes
including products, variants, customers, collections, facets, orders (upsert, notes, transitions, coupons),
promotions, assets, inventory, entity deletion, and more.

**Strategies:** `CREATE`, `UPDATE`, `UPSERT`

See [Loaders Reference](./loaders.md) for all loader adapters and their configuration.

---

## EXPORT

Formats records and delivers them to local storage, S3, SFTP, FTP/FTPS, HTTP,
or email.

**Formats:** `CSV`, `JSON`, `XML`, `NDJSON`

**Destinations:** `LOCAL`, `HTTP`, `S3`, `SFTP`, `FTP`, `EMAIL`

See [Pipeline Builder - export](../developer-guide/dsl/pipeline-builder.md#export) for configuration.

---

## FEED

Generates product feeds for marketing platforms.

**Feed types:** `GOOGLE_SHOPPING`, `META_CATALOG`, `AMAZON`, `CUSTOM`

See [Feed Generators Reference](./feeds.md) for all feed adapters and their configuration.

---

## SINK

Indexes data to search engines and publishes to message queues.

**Sink types:** `ELASTICSEARCH`, `OPENSEARCH`, `MEILISEARCH`, `ALGOLIA`, `TYPESENSE`, `QUEUE_PRODUCER`, `WEBHOOK`

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
| `timeoutSeconds` | integer | TIMEOUT | Auto-approve after 1-31,536,000 seconds |
| `errorThresholdPercent` | number | THRESHOLD | Auto-approve only when the error rate is strictly below 0-100 percent |
| `notifyWebhook` | string | No | Absolute HTTP or HTTPS URL to call when the gate is reached |
| `notifyEmail` | string | No | Valid email address to notify when the gate is reached |
| `previewCount` | integer | No | Records included in the gate preview, 1-100 (default: 10) |

### Approval Types

| Type | Behavior |
|------|----------|
| `MANUAL` | Pipeline pauses until a user explicitly approves or rejects via the dashboard or API |
| `THRESHOLD` | Auto-approves if the upstream error rate is below `errorThresholdPercent`; otherwise pauses for manual review |
| `TIMEOUT` | Auto-approves after `timeoutSeconds` if no manual action is taken |

At the threshold boundary, equality pauses: an error rate of 5 percent does not
auto-approve a threshold of 5. TIMEOUT deadlines are persisted on the run when
it enters `PAUSED`; the server processes due rows in bounded 30-second polling
cycles, so approval can occur shortly after the exact deadline. Manual approval
or rejection wins atomically and prevents later timeout processing.

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
    .load('upsert-products', { adapterCode: 'productUpsert', strategy: 'UPSERT', slugField: 'slug' })
    .edge('start', 'fetch-erp')
    .edge('fetch-erp', 'map-fields')
    .edge('map-fields', 'check-data')
    .edge('check-data', 'review-before-load')
    .edge('review-before-load', 'upsert-products')
    .build();
```
