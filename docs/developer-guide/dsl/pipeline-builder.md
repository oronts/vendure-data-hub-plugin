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
    defaultChannel: 'default',
    defaultLanguage: 'en',
})
.capabilities({
    allowConcurrent: false,
    resumable: true,
})
```

### Dependencies

```typescript
.dependsOn('other-pipeline-code', 'another-pipeline')
```

Pipelines that must complete before this one can run.

### Hooks

```typescript
.hooks({
    onStart: async (ctx) => { ... },
    onComplete: async (ctx, result) => { ... },
    onError: async (ctx, error) => { ... },
})
```

## Step Methods

### trigger

Define how the pipeline starts:

```typescript
.trigger('start', {
    type: 'manual' | 'schedule' | 'webhook' | 'event' | 'file' | 'message',
    // Type-specific options...
})
```

**Manual Trigger:**
```typescript
.trigger('start', { type: 'manual' })
```

**Schedule Trigger:**
```typescript
.trigger('schedule', {
    type: 'schedule',
    cron: '0 2 * * *',
    timezone: 'UTC',
})
```

**Webhook Trigger:**
```typescript
.trigger('webhook', {
    type: 'webhook',
    path: '/product-sync',
    signature: 'hmac-sha256',
    idempotencyKey: 'X-Request-ID',
})
```

**Event Trigger:**
```typescript
.trigger('on-order', {
    type: 'event',
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
    adapterCode: 'rest',
    endpoint: 'https://api.example.com/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    query: { limit: 100 },
    itemsField: 'data.items',
    pageParam: 'page',
    maxPages: 10,
    bearerTokenSecretCode: 'api-key',
})
```

**GraphQL:**
```typescript
.extract('query-graphql', {
    adapterCode: 'graphql',
    endpoint: 'https://api.example.com/graphql',
    query: `query { products { id name } }`,
    itemsField: 'data.products',
})
```

**File:**
```typescript
.extract('parse-file', {
    adapterCode: 'csv',
    csvPath: '/uploads/products.csv',
    delimiter: ',',
    hasHeader: true,
})
```

**Vendure Query:**
```typescript
.extract('query-vendure', {
    adapterCode: 'vendure-query',
    entity: 'Product',
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
    mode: 'fail-fast' | 'accumulate',
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
    strategy?: 'create' | 'update' | 'upsert' | 'source-wins' | 'vendure-wins' | 'merge',
    channel?: string,
    channelStrategy?: 'assign' | 'replace' | 'skip',
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
    adapterCode: 'productUpsert',
    strategy: 'source-wins',
    channel: '__default_channel__',
    skuField: 'sku',
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
})
```

**Variant Loader:**
```typescript
.load('import-variants', {
    adapterCode: 'variantUpsert',
    channel: '__default_channel__',
    skuField: 'sku',
    priceField: 'price',
    stockField: 'stock',
})
```

### export

Send data to external destinations:

```typescript
.export('step-key', {
    adapterCode: string,
    target?: 'file' | 'api' | 'webhook' | 's3' | 'sftp' | 'email',
    format?: 'csv' | 'json' | 'xml' | 'xlsx' | 'ndjson',
    // Target-specific options...
})
```

**File Export:**
```typescript
.export('write-file', {
    adapterCode: 'file-export',
    target: 'file',
    format: 'csv',
    path: '/exports',
    filename: 'products.csv',
})
```

**S3 Export:**
```typescript
.export('upload-s3', {
    adapterCode: 's3-export',
    target: 's3',
    bucket: 'my-bucket',
    prefix: 'exports/',
    format: 'json',
    connectionCode: 'aws-s3',
})
```

### feed

Generate product feeds:

```typescript
.feed('step-key', {
    adapterCode: 'feed-generator',
    feedType?: 'google-merchant' | 'meta-catalog' | 'amazon' | 'custom',
    format?: 'xml' | 'csv' | 'tsv' | 'json' | 'jsonl',
    // Feed-specific options...
})
```

**Google Feed:**
```typescript
.feed('google-shopping', {
    adapterCode: 'feed-generator',
    feedType: 'google-merchant',
    format: 'xml',
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
    sinkType?: 'elasticsearch' | 'meilisearch' | 'algolia' | 'typesense',
    indexName: string,
    // Sink-specific options...
})
```

**Elasticsearch:**
```typescript
.sink('index-products', {
    adapterCode: 'search-sink',
    sinkType: 'elasticsearch',
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
        batchSize: 100,      // Records per batch
        concurrency: 4,      // Parallel batches
        rateLimit: 10,       // Max ops per second
        retryCount: 3,       // Retries on failure
        retryDelay: 1000,    // Delay between retries (ms)
    }
}
```

## Complete Example

```typescript
import { createPipeline, DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

const productSync = createPipeline()
    .name('Daily Product Sync')
    .description('Sync products from ERP every day')
    .version(1)
    .capabilities({ resumable: true })

    .trigger('schedule', {
        type: 'schedule',
        cron: '0 2 * * *',
        timezone: 'UTC',
    })

    .extract('fetch-erp', {
        adapterCode: 'rest',
        connectionCode: 'erp-api',
        endpoint: '/products',
        itemsField: 'data',
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
        adapterCode: 'productUpsert',
        strategy: 'source-wins',
        channel: '__default_channel__',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
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
