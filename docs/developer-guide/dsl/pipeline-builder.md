# Pipeline Builder

The `createPipeline()` function returns a builder for constructing pipelines.

## Import

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';
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
    channel: 'default',
    contentLanguage: 'en',
    channelStrategy: 'EXPLICIT',  // 'EXPLICIT' | 'INHERIT' | 'MULTI'
    validationMode: 'STRICT',     // 'STRICT' | 'LENIENT'
    runMode: 'BATCH',             // 'SYNC' | 'ASYNC' | 'BATCH' | 'STREAM'
})
.capabilities({
    writes: ['CATALOG'],     // 'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'PROMOTIONS' | 'INVENTORY' | 'CUSTOM'
    requires: [],            // Required permissions
    streamSafe: true,        // Safe for streaming mode
})
```

### .parallel(config)

Enables parallel step execution for the pipeline. When enabled, independent steps
(those without data dependencies) run concurrently.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| maxConcurrentSteps | number | No | Maximum steps to run concurrently (default: 4, range: 2-16) |
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

Pipelines that must complete before this one can run.

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
    path: '/product-sync',
    signature: 'hmac-sha256',
    idempotencyKey: 'X-Request-ID',
})
```

**Event Trigger:**
```typescript
.trigger('on-order', {
    type: 'EVENT',
    event: 'OrderPlacedEvent',
    filter: { state: 'ArrangingPayment' },
})
```

### extract

Pull data from external sources:

```typescript
.extract('step-key', {
    adapterCode: string,
    // Adapter-specific options...
    throughput?: Throughput,
    async?: boolean,
})
```

**HTTP API:**
```typescript
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    dataPath: 'data.items',
    pagination: {
        type: 'PAGE',
        limit: 100,
        maxPages: 10,
    },
    bearerTokenSecretCode: 'api-key',
})
```

**GraphQL:**
```typescript
.extract('query-graphql', {
    adapterCode: 'graphql',
    url: 'https://api.example.com/graphql',
    query: `query { products { id name } }`,
    dataPath: 'data.products',
})
```

**File:**
```typescript
.extract('parse-file', {
    adapterCode: 'file',
    path: '/uploads/products.csv',
    format: 'CSV',
    delimiter: ',',
    hasHeader: true,
})
```

**Vendure Query:**
```typescript
.extract('query-vendure', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',  // UPPERCASE: PRODUCT, COLLECTION, FACET, CUSTOMER, ORDER, etc.
    relations: 'variants,featuredAsset,translations',
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
    schemaRef?: SchemaRefConfig,
    throughput?: Throughput,
})
```

**Example:**
```typescript
.validate('check-data', {
    errorHandlingMode: 'ACCUMULATE',
    rules: [
        { type: 'business', spec: { field: 'sku', required: true } },
        { type: 'business', spec: { field: 'price', min: 0 } },
    ],
})
```

### enrich

Add data from external lookups or static enrichment:

```typescript
.enrich('step-key', {
    adapterCode?: string,          // Custom enricher adapter (optional if using built-in)
    defaults?: Record<string, JsonValue>,   // Set fields only if missing
    set?: Record<string, JsonValue>,        // Always overwrite these fields
    computed?: Record<string, string>,      // Template expressions: '${field1} ${field2}'
    sourceType?: 'STATIC' | 'HTTP' | 'VENDURE',
    endpoint?: string,             // HTTP endpoint URL (for HTTP source type)
    matchField?: string,           // Field to match for lookups
    entity?: string,               // Vendure entity type (for VENDURE source type)
    config?: JsonObject,           // Additional adapter config
})
```

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
    validationMode?: ValidationMode,
    matchField?: string,
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
    matchField: 'slug',
    conflictStrategy: 'SOURCE_WINS',
})
```

**Variant Loader:**
```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    strategy: 'UPDATE',
    matchField: 'sku',
})
```

### export

Send data to external destinations:

```typescript
.export('step-key', {
    adapterCode: string,
    target?: 'FILE' | 'API' | 'WEBHOOK' | 'S3' | 'SFTP' | 'EMAIL',
    format?: 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON',
    // Target-specific options...
})
```

**File Export:**
```typescript
.export('write-file', {
    adapterCode: 'file-export',
    target: 'FILE',
    format: 'CSV',
    path: '/exports',
    filename: 'products.csv',
})
```

**S3 Export:**
```typescript
.export('upload-s3', {
    adapterCode: 's3-export',
    target: 'S3',
    bucket: 'my-bucket',
    prefix: 'exports/',
    format: 'JSON',
    connectionCode: 'aws-s3',
})
```

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
    outputPath: '/feeds/google.xml',
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
    adapterCode: 'elasticsearch' | 'meilisearch' | 'algolia' | 'typesense',
    sinkType?: 'ELASTICSEARCH' | 'OPENSEARCH' | 'MEILISEARCH' | 'ALGOLIA' | 'TYPESENSE' | 'CUSTOM',
    indexName: string,
    // Sink-specific options...
})
```

**Elasticsearch:**
```typescript
.sink('index-products', {
    adapterCode: 'elasticsearch',
    sinkType: 'ELASTICSEARCH',
    host: 'localhost',
    port: 9200,
    indexName: 'products',
    idField: 'id',
    bulkSize: 500,
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
| `timeoutSeconds` | number | No | Auto-approve after N seconds (`TIMEOUT` mode) |
| `errorThresholdPercent` | number | No | Auto-approve if error rate below threshold, 0-100 (`THRESHOLD` mode) |
| `notifyWebhook` | string | No | Webhook URL for gate notifications |
| `notifyEmail` | string | No | Email address for gate notifications |
| `previewCount` | number | No | Number of records to preview (default: 10) |

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
.edge('route', 'process-other')  // Default branch
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
        rateLimitRps: 10,       // Max requests per second
        drainStrategy: 'BACKOFF',  // 'BACKOFF' | 'SHED' | 'QUEUE'
        pauseOnErrorRate: {
            threshold: 0.5,     // Pause if error rate exceeds 50%
            intervalSec: 60,    // Check interval
        },
    },
    // Retry configuration (step-level, not in throughput)
    retries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
}
```

## Complete Example

```typescript
import { createPipeline, DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

const productSync = createPipeline()
    .name('Daily Product Sync')
    .description('Sync products from ERP every day')
    .version(1)
    .capabilities({ writes: ['CATALOG'], streamSafe: true })

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
        matchField: 'slug',
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
