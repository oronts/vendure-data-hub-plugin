# Pipeline Builder

The `createPipeline()` function returns a builder for constructing pipelines.

## Import

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';
## Typed Loader Factories

The typed factories expose every built-in loader under its canonical adapter
code and enforce each loader's required configuration fields.

```typescript
import {
    Loaders,
    deriveCapabilities,
    loadStep,
} from '@oronts/vendure-data-hub-plugin';

const steps = [
    loadStep('products', Loaders.productUpsert({
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'name',
    })),
];

const capabilities = deriveCapabilities(steps);
// { requires: ['UpdateCatalog'], writes: ['CATALOG'] }
```

Factory names match the adapter codes in the [Loaders Reference](../../reference/loaders.md).
```

## Builder Methods

### Metadata

```typescript
createPipeline()
    .name('Pipeline Name')
    .description('Pipeline description')
    .version(1)
```

| Method | Description |
|--------|-------------|
| `name(name: string)` | Human-readable name |
| `description(desc: string)` | Description |
| `version(v: number)` | Definition version |

### Context and Capabilities

```typescript
.context({
    channel: '__default_channel__', // Vendure channel token
    contentLanguage: 'en',
    channelStrategy: 'EXPLICIT',  // 'EXPLICIT' | 'INHERIT' | 'MULTI'
    channelIds: ['2'],            // Vendure channel IDs
    validationMode: 'STRICT',     // 'STRICT' | 'LENIENT'
})
.capabilities({
    writes: ['CATALOG'],     // 'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'PROMOTIONS' | 'INVENTORY' | 'CUSTOM'
    requires: [],            // Required permissions
})
```

Pipeline context values are defaults. Each step may define a `context` object
with `contentLanguage`, `channelStrategy`, `channelIds`, `validationMode`, or
`throughput` overrides. Resolution is step, then pipeline, then
the active Vendure request context. Missing validation and execution values
default to `STRICT`.
`EXPLICIT` and `MULTI` channel strategies require at least one effective
`channelIds` entry.

### .parallel(config)

Enables parallel step execution for the pipeline. When enabled, independent steps
(those without data dependencies) run concurrently.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| maxConcurrentSteps | number | No | Maximum steps to run concurrently (default: 4, range: 1-16) |
| errorPolicy | string | No | `'FAIL_FAST'` \| `'CONTINUE'` \| `'BEST_EFFORT'`. Default: `'FAIL_FAST'` |

**Error policies:**
- `FAIL_FAST` -- Stop all steps on first error (default)
- `CONTINUE` -- Continue other parallel steps, fail at end
- `BEST_EFFORT` -- Continue all steps, collect all errors

```typescript
createPipeline()
    .name('Parallel Import')
    .parallel({ maxConcurrentSteps: 4, errorPolicy: 'CONTINUE' })
    .extract('fetch-products', { /* ... */ })
    .extract('fetch-prices', { /* ... */ })
    .transform('merge', { /* ... */ })
    .load('upsert', { /* ... */ })
    .edge('fetch-products', 'merge')
    .edge('fetch-prices', 'merge')
    .edge('merge', 'upsert')
    .build();
```

### Dependencies

```typescript
.dependsOn('other-pipeline-code', 'another-pipeline')
```

`.dependsOn()` declares pipeline-code references used by dependency queries,
publish-time existence and cycle validation, and rename/delete protection. It
does not start, order, or wait for those pipelines. Use schedules, explicit
orchestration, or `TRIGGER_PIPELINE` hooks for runtime sequencing.

### Hooks

Pipeline lifecycle hooks using SCREAMING_SNAKE_CASE stage names. Each stage maps to an
array of `HookAction` objects. Six action types are supported: `INTERCEPTOR`, `SCRIPT`,
`WEBHOOK`, `EMIT`, `TRIGGER_PIPELINE`, and `LOG`.

**Interceptor Hooks** (modify records inline):

```typescript
.hooks({
    AFTER_EXTRACT: [{
        type: 'INTERCEPTOR',
        name: 'Add metadata',
        code: `return records.map(r => ({ ...r, source: 'api' }));`,
    }],
    BEFORE_LOAD: [{
        type: 'INTERCEPTOR',
        name: 'Filter invalid',
        code: `return records.filter(r => r.sku && r.name);`,
        failOnError: true,
    }],
})
```

**Script Hooks** (reference pre-registered functions):

```typescript
.hooks({
    AFTER_TRANSFORM: [{
        type: 'SCRIPT',
        scriptName: 'addCustomerSegment',
        args: { spendThreshold: 5000 },
    }],
})
```

**Modify records before search engine indexing:**

```typescript
.hooks({
    BEFORE_SINK: [{
        type: 'SCRIPT',
        scriptName: 'enrichForSearch',
        args: { boostFeatured: true },
    }],
})
```

**Webhook Hooks** (notify external systems):

```typescript
.hooks({
    PIPELINE_COMPLETED: [{
        type: 'WEBHOOK',
        url: 'https://api.example.com/notify',
        headers: { 'Content-Type': 'application/json' },
        retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            backoffMultiplier: 2,
        },
    }],
    PIPELINE_FAILED: [{
        type: 'WEBHOOK',
        url: 'https://pagerduty.example.com/alert',
    }],
})
```

**Other Hook Types:**

```typescript
.hooks({
    ON_ERROR: [{
        type: 'EMIT',
        event: 'pipeline.error',
    }],
    AFTER_LOAD: [{
        type: 'TRIGGER_PIPELINE',
        pipelineCode: 'post-import-sync',
        triggerKey: 'hook',
    }],
    PIPELINE_STARTED: [{
        type: 'LOG',
        level: 'INFO',
        message: 'Pipeline execution started',
    }],
})
```

## Step Methods

### trigger

Define how the pipeline starts:

```typescript
.trigger('start', {
    type: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'EVENT' | 'FILE' | 'MESSAGE',
    // Type-specific options...
})
```

**Manual Trigger:**
```typescript
.trigger('start', { type: 'MANUAL' })
```

**Schedule Trigger:**
```typescript
.trigger('schedule', {
    type: 'SCHEDULE',
    cron: '0 2 * * *',
    timezone: 'UTC',
})
```

**Webhook Trigger:**
```typescript
.trigger('webhook', {
    type: 'WEBHOOK',
    authentication: 'HMAC',
    secretCode: 'product-sync-webhook-secret',
    hmacAlgorithm: 'SHA256',
    requireIdempotencyKey: true,
    idempotencyKeyHeader: 'X-Request-ID',
})
```

**Event Trigger:**
```typescript
.trigger('on-order', {
    type: 'EVENT',
    event: 'OrderPlacedEvent',
})
```

The event selector is an exact Vendure class name. Filter the seeded records in
a downstream step when only some operations or states should continue.

### extract

Pull data from external sources:

```typescript
.extract('step-key', {
    adapterCode: string,
    // Adapter-specific options...
    throughput?: Throughput,
    async?: boolean,
    schemaRef?: { schemaId: string; version: string },
})
```

**HTTP API:**
```typescript
.extract('fetch-api', {
    adapterCode: 'httpApi',
    connectionCode: 'catalog-api',
    url: '/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    dataPath: 'data.items',
    pagination: {
        type: 'PAGE',
        limit: 100,
        maxPages: 10,
    },
    auth: {
        type: 'BEARER',
        secretCode: 'api-key',
    },
})
```

Authenticated HTTP extractors require a saved connection with a base URL. The
extractor accepts paths relative to that URL or absolute URLs on the same exact
origin; cross-origin requests and redirects are rejected before credentials
can be forwarded.

**GraphQL:**
```typescript
.extract('query-graphql', {
    adapterCode: 'graphql',
    url: 'https://api.example.com/graphql',
    query: `query { products { id name } }`,
    dataPath: 'data.products',
})
```

**Uploaded CSV:**
```typescript
.extract('parse-csv', {
    adapterCode: 'csv',
    fileId: 'products-upload-id',
    delimiter: ',',
    hasHeader: true,
    schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
})
```

**Vendure Query:**
```typescript
.extract('query-vendure', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',  // UPPERCASE: PRODUCT, COLLECTION, FACET, CUSTOMER, ORDER, etc.
    relations: ['variants', 'featuredAsset', 'translations'],
    languageCode: 'en',
    batchSize: 500,
})
```

### transform

Modify records:

```typescript
.transform('step-key', {
    operators: OperatorConfig[],
    throughput?: Throughput,
    async?: boolean,
    retryPerRecord?: RetryPerRecordConfig,
})
```

**Example:**
```typescript
.transform('map-fields', {
    operators: [
        { op: 'rename', args: { from: 'title', to: 'name' } },
        { op: 'set', args: { path: 'enabled', value: true } },
        { op: 'slugify', args: { source: 'name', target: 'slug' } },
    ],
})
```

#### retryPerRecord (optional)

Per-record retry configuration for transform operators. When set, individual
records that fail during transformation are retried independently rather than
failing the entire batch.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `maxRetries` | number | Yes | Max retries per record (default: 0) |
| `retryDelayMs` | number | No | Delay between retries in ms (default: 100) |
| `backoff` | string | No | `'FIXED'` \| `'EXPONENTIAL'` (default: `'FIXED'`) |
| `retryableErrors` | string[] | No | Error message patterns to retry (optional, retries all errors if omitted) |

```typescript
.transform('enrich-products', {
    operators: [
        { op: 'httpLookup', args: { url: 'https://api.example.com/{{sku}}', target: 'extra' } },
    ],
    retryPerRecord: {
        maxRetries: 3,
        retryDelayMs: 500,
        backoff: 'EXPONENTIAL',
        retryableErrors: ['ETIMEDOUT', 'ECONNRESET'],
    },
})
```

### validate

Validate records:

```typescript
.validate('step-key', {
    errorHandlingMode: 'FAIL_FAST' | 'ACCUMULATE',
    rules: ValidationRuleConfig[],
    throughput?: Throughput,
    schemaRef?: { schemaId: string; version: string },
})
```

**Example:**
```typescript
.validate('check-data', {
    errorHandlingMode: 'ACCUMULATE',
    schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
    rules: [
        { type: 'business', spec: { field: 'sku', required: true } },
        { type: 'business', spec: { field: 'price', min: 0 } },
    ],
})
```

`schemaRef` is stored on the pipeline step, not inside the adapter configuration.
The referenced version must exist before publication. Dry runs, step tests, and
live execution resolve the same immutable version.

### enrich

Add data from external lookups or static enrichment:

```typescript
.enrich('step-key', {
    adapterCode?: string,          // Custom enricher adapter (optional if using built-in)
    defaults?: Record<string, JsonValue>,   // Set fields only if missing
    set?: Record<string, JsonValue>,        // Always overwrite these fields
    computed?: Record<string, string>,      // Template expressions: '${field1} ${field2}'
    sourceType?: 'STATIC' | 'HTTP' | 'VENDURE',
    url?: string,                  // Required for HTTP; supports {{field.path}}
    keyField?: string,             // Record field used in cache identity
    target?: string,               // Field receiving the response
    entityType?: string,           // Required registered loader entity type
    sourceField?: string,          // Required input record field
    lookupField?: string,          // Required Vendure entity lookup field
    targetFields?: Record<string, string>,
})
```

Without `adapterCode`, STATIC requires a non-empty `defaults`, `set`, or
`computed` object. HTTP requires `url`. VENDURE requires `entityType`,
`sourceField`, and `lookupField`.

**Static Enrichment (no adapter needed):**
```typescript
.enrich('add-defaults', {
    defaults: { currency: 'USD', enabled: false },
    set: { importSource: 'api-sync' },
    computed: { fullTitle: '${brand} - ${name}' },
})
```

### route

Split data flow based on conditions:

```typescript
.route('step-key', {
    branches: RouteBranchConfig[],
    /** Target step key for unmatched records; a matching edge is required. */
    defaultTo?: string,
})
```

**Example:**
```typescript
.route('by-category', {
    branches: [
        {
            name: 'electronics',
            when: [{ field: 'category', cmp: 'eq', value: 'electronics' }],
        },
        {
            name: 'clothing',
            when: [{ field: 'category', cmp: 'eq', value: 'clothing' }],
        },
    ],
    defaultTo: 'other-products',
})
```

### load

Create or update Vendure entities:

```typescript
.load('step-key', {
    adapterCode: string,
    strategy?: 'CREATE' | 'UPDATE' | 'UPSERT' | 'MERGE' | 'SOFT_DELETE' | 'HARD_DELETE',
    channel?: string,
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI',
    channelIds?: string[],
    validationMode?: ValidationMode,
    nameField?: string,
    slugField?: string,
    descriptionField?: string,
    skuField?: string,
    priceField?: string,
    emailField?: string,
    firstNameField?: string,
    lastNameField?: string,
    phoneNumberField?: string,
    codeField?: string,
    parentField?: string,
    positionField?: string,
    stockOnHandField?: string,
    stockLocationField?: string,
    urlField?: string,
    enabledField?: string,
    config?: JsonObject,
    throughput?: Throughput,
    async?: boolean,
})
```

**Product Loader:**
```typescript
.load('import-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    slugField: 'slug',
    conflictStrategy: 'SOURCE_WINS',
})
```

**Variant Loader:**
```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',
    skuField: 'sku',
})
```

### export

Send data to external destinations:

```typescript
.export('step-key', {
    adapterCode: string,
    destinationType?: 'LOCAL' | 'HTTP' | 'S3' | 'SFTP' | 'FTP' | 'EMAIL',
    format?: 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON',
    // Destination-specific options...
})
```

**File Export:**
```typescript
.export('write-file', {
    adapterCode: 'csvExport',
    destinationType: 'LOCAL',
    directory: 'catalog',
    filenamePattern: 'products.csv',
    formulaMode: 'SPREADSHEET_SAFE',
})
```

CSV exports default to `SPREADSHEET_SAFE`, which prefixes formula-like cells
for human viewing in spreadsheet applications. Use `PRESERVE` only for
machine-to-machine exports that require byte-equivalent field values.

For local exports, `directory` is relative to `DATA_HUB_EXPORT_ROOT`; feed
`outputPath` uses the same root-relative contract. The root defaults to
`<cwd>/exports`. Absolute local paths and URLs are not valid directory values.

**S3 Export:**
```typescript
.export('upload-s3', {
    adapterCode: 'jsonExport',
    destinationType: 'S3',
    bucket: 'my-bucket',
    region: 'eu-central-1',
    prefix: 'exports/',
    accessKeyIdSecretCode: 'aws-access-key-id',
    secretAccessKeySecretCode: 'aws-secret-access-key',
})
```

HTTP destinations use `url`. Put only non-sensitive values in `headers`; use
`auth` or `headerSecretCodes` for credentials and sensitive header values.

### feed

Generate product feeds:

```typescript
.feed('step-key', {
    adapterCode: 'googleMerchant' | 'metaCatalog' | 'amazonFeed' | 'customFeed',
    feedType?: 'GOOGLE_SHOPPING' | 'META_CATALOG' | 'AMAZON' | 'CUSTOM',
    format?: 'XML' | 'CSV' | 'TSV' | 'JSON' | 'NDJSON',
    // Feed-specific options...
})
```

**Google Feed:**
```typescript
.feed('google-shopping', {
    adapterCode: 'googleMerchant',
    feedType: 'GOOGLE_SHOPPING',
    format: 'XML',
    outputPath: 'feeds/google.xml',
    targetCountry: 'US',
    contentLanguage: 'en',
    currency: 'USD',
    titleField: 'name',
    descriptionField: 'description',
    priceField: 'price',
    imageField: 'image',
})
```

### sink

Index data to search engines:

```typescript
.sink('step-key', {
    adapterCode: 'elasticsearch' | 'opensearch' | 'meilisearch' | 'algolia' | 'typesense',
    // Sink-specific options...
})
```

**Elasticsearch:**
```typescript
.sink('index-products', {
    adapterCode: 'elasticsearch',
    node: 'http://localhost:9200',
    indexName: 'products',
    idField: 'id',
    batchSize: 500,
})
```

### gate

Add a human-in-the-loop approval gate step. Gates pause pipeline execution until
approval is granted -- either manually, automatically when errors fall below a
threshold, or after a timeout.

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
| `approvalType` | string | Yes | `'MANUAL'` \| `'THRESHOLD'` \| `'TIMEOUT'` |
| `timeoutSeconds` | integer | TIMEOUT | Auto-approve after 1-31,536,000 seconds |
| `errorThresholdPercent` | number | THRESHOLD | Auto-approve only when the error rate is strictly below 0-100 percent |
| `notifyWebhook` | string | No | Absolute HTTP or HTTPS notification URL |
| `notifyEmail` | string | No | Valid notification email address |
| `previewCount` | integer | No | Records to preview, 1-100 (default: 10) |

A threshold equal to the observed error rate pauses. Timeout approval is durable
and is processed by the server's bounded gate maintenance cycle after the saved
deadline.

**Manual Gate:**
```typescript
.gate('review-import', {
    approvalType: 'MANUAL',
    notifyEmail: 'admin@example.com',
    previewCount: 25,
})
```

**Threshold Gate:**
```typescript
.gate('error-check', {
    approvalType: 'THRESHOLD',
    errorThresholdPercent: 5,
    notifyWebhook: 'https://hooks.example.com/gate',
})
```

**Timeout Gate:**
```typescript
.gate('timed-review', {
    approvalType: 'TIMEOUT',
    timeoutSeconds: 3600,
    notifyEmail: 'team@example.com',
})
```

### edge

Connect steps:

```typescript
.edge(from: string, to: string, branch?: string)
```

**Basic Connection:**
```typescript
.edge('extract', 'transform')
.edge('transform', 'load')
```

**Branching:**
```typescript
.edge('route', 'process-electronics', 'electronics')
.edge('route', 'process-clothing', 'clothing')
.edge('route', 'process-other', 'default')
```

### build

Finalize the pipeline:

```typescript
const definition = createPipeline()
    // ... configuration ...
    .build();

// Returns PipelineDefinition
```

## Throughput Configuration

Control execution performance:

```typescript
{
    throughput: {
        batchSize: 100,         // Records per batch
        concurrency: 4,         // Parallel batches
        rateLimitRps: 10,       // Max aggregate load-batch starts per second
        drainStrategy: 'BACKOFF',  // 'BACKOFF' | 'SHED' | 'QUEUE'
        pauseOnErrorRate: {
            threshold: 0.5,     // React at 50% failed records
            intervalSec: 60,    // Rolling error window and recovery delay
        },
    },
    // Retry configuration (step-level, not in throughput)
    retries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
}
```

Throughput limits are batch size `1-10,000`, concurrency `1-16`, rate limit
`0-1,000` batch starts per second, threshold greater than `0` and at most `1`,
and interval `0.1-3,600` seconds. Omitting the interval uses 1 second for
BACKOFF and 5 seconds for QUEUE.

## Complete Example

```typescript
import { createPipeline, DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

const productSync = createPipeline()
    .name('Daily Product Sync')
    .description('Sync products from ERP every day')
    .version(1)
    .capabilities({ writes: ['CATALOG'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',
        timezone: 'UTC',
    })

    .extract('fetch-erp', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        dataPath: 'data',
        throughput: { batchSize: 500 },
    })

    .transform('map-fields', {
        operators: [
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'price' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })

    .validate('check-data', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'sku', required: true } },
            { type: 'business', spec: { field: 'price', min: 0 } },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        slugField: 'slug',
        conflictStrategy: 'SOURCE_WINS',
        throughput: { batchSize: 50, concurrency: 2 },
    })

    .edge('schedule', 'fetch-erp')
    .edge('fetch-erp', 'map-fields')
    .edge('map-fields', 'check-data')
    .edge('check-data', 'upsert-products')

    .build();

export const config = {
    plugins: [
        DataHubPlugin.init({
            pipelines: [{
                code: 'product-sync',
                name: 'Daily Product Sync',
                enabled: true,
                definition: productSync,
            }],
        }),
    ],
};
```
