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

### Dependencies

```typescript
.dependsOn('other-pipeline-code', 'another-pipeline')
```

Pipelines that must complete before this one can run.

### Hooks

Pipeline lifecycle hooks using SCREAMING_SNAKE_CASE stage names:

```typescript
.hooks({
    // Pipeline lifecycle
    PIPELINE_STARTED: async (ctx) => { ... },
    PIPELINE_COMPLETED: async (ctx, result) => { ... },
    PIPELINE_FAILED: async (ctx, error) => { ... },

    // Step lifecycle (per-step hooks)
    BEFORE_EXTRACT: async (ctx) => { ... },
    AFTER_EXTRACT: async (ctx, records) => { ... },
    BEFORE_TRANSFORM: async (ctx, records) => { ... },
    AFTER_TRANSFORM: async (ctx, records) => { ... },
    BEFORE_VALIDATE: async (ctx, records) => { ... },
    AFTER_VALIDATE: async (ctx, records) => { ... },
    BEFORE_ENRICH: async (ctx, records) => { ... },
    AFTER_ENRICH: async (ctx, records) => { ... },
    BEFORE_ROUTE: async (ctx, records) => { ... },
    AFTER_ROUTE: async (ctx, records) => { ... },
    BEFORE_LOAD: async (ctx, records) => { ... },
    AFTER_LOAD: async (ctx, result) => { ... },

    // Error handling
    ON_ERROR: async (ctx, error) => { ... },
    ON_RETRY: async (ctx, attempt, error) => { ... },
    ON_DEAD_LETTER: async (ctx, record, error) => { ... },
})
```

**Hook Actions** - Hooks can also be configured as action objects:

```typescript
.hooks({
    PIPELINE_COMPLETED: {
        type: 'WEBHOOK',
        url: 'https://api.example.com/notify',
        method: 'POST',
        retries: 3,
    },
    ON_ERROR: {
        type: 'EMIT',
        event: 'pipeline.error',
    },
    AFTER_LOAD: {
        type: 'TRIGGER_PIPELINE',
        pipelineCode: 'post-import-sync',
    },
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
    webhookPath: '/product-sync',
    authentication: 'HMAC',
    requireIdempotencyKey: true,
    idempotencyKeyHeader: 'X-Request-ID',
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

### validate

Validate records:

```typescript
.validate('step-key', {
    mode: 'FAIL_FAST' | 'ACCUMULATE',
    rules: ValidationRuleConfig[],
    schemaRef?: SchemaRefConfig,
    throughput?: Throughput,
})
```

**Example:**
```typescript
.validate('check-data', {
    mode: 'accumulate',
    rules: [
        { type: 'business', spec: { field: 'sku', required: true } },
        { type: 'business', spec: { field: 'price', min: 0 } },
    ],
})
```

### enrich

Add data from external lookups:

```typescript
.enrich('step-key', {
    adapterCode: string,
    config?: JsonObject,
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
    strategy?: 'CREATE' | 'UPDATE' | 'UPSERT' | 'SOFT_DELETE' | 'HARD_DELETE',
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
    parentSlugField?: string,
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
    entityType: 'PRODUCT',
    operation: 'UPSERT',
    lookupFields: ['slug'],
    conflictResolution: 'SOURCE_WINS',
})
```

**Variant Loader:**
```typescript
.load('import-variants', {
    entityType: 'PRODUCT_VARIANT',
    operation: 'UPDATE',
    lookupFields: ['sku'],
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
    adapterCode: 'googleMerchant' | 'metaCatalog' | 'customFeed',
    feedType?: 'GOOGLE_SHOPPING' | 'META_CATALOG' | 'AMAZON' | 'PINTEREST' | 'BING' | 'CUSTOM',
    format?: 'XML' | 'CSV' | 'TSV' | 'JSON' | 'NDJSON',
    // Feed-specific options...
})
```

**Google Feed:**
```typescript
.feed('google-shopping', {
    adapterCode: 'feed-generator',
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
    adapterCode: 'search-sink',
    sinkType?: 'ELASTICSEARCH' | 'OPENSEARCH' | 'MEILISEARCH' | 'ALGOLIA' | 'TYPESENSE' | 'CUSTOM',
    indexName: string,
    // Sink-specific options...
})
```

**Elasticsearch:**
```typescript
.sink('index-products', {
    adapterCode: 'search-sink',
    sinkType: 'ELASTICSEARCH',
    host: 'localhost',
    port: 9200,
    indexName: 'products',
    idField: 'id',
    bulkSize: 500,
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
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'sku', required: true } },
            { type: 'business', spec: { field: 'price', min: 0 } },
        ],
    })

    .load('upsert-products', {
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['slug'],
        conflictResolution: 'SOURCE_WINS',
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
