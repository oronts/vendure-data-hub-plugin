# DSL Schema Reference

Complete TypeScript interface reference for the Data Hub DSL (Domain-Specific Language).

## Table of Contents

- [Pipeline Definition](#pipeline-definition)
- [Pipeline Context](#pipeline-context)
- [Step Definitions](#step-definitions)
  - [Trigger Step](#trigger-step)
  - [Extract Step](#extract-step)
  - [Transform Step](#transform-step)
  - [Validate Step](#validate-step)
  - [Enrich Step](#enrich-step)
  - [Route Step](#route-step)
  - [Load Step](#load-step)
  - [Export Step](#export-step)
  - [Feed Step](#feed-step)
  - [Sink Step](#sink-step)
  - [Gate Step](#gate-step)
- [Common Configuration Types](#common-configuration-types)
- [Hook Types](#hook-types)
- [Operator Types](#operator-types)

## Pipeline Definition

The root interface for a complete pipeline configuration.

```typescript
interface PipelineDefinition {
    /** Schema version (always 1) */
    version: number;

    /** Pipeline metadata */
    name?: string;
    description?: string;

    /** Execution context and defaults */
    context?: PipelineContext;

    /** Capabilities and permissions required */
    capabilities?: PipelineCapabilities;

    /** Other pipelines that must complete before this one */
    dependsOn?: string[];

    /** Lifecycle hooks for custom logic */
    hooks?: PipelineHooks;

    /** All steps in the pipeline */
    steps: PipelineStepDefinition[];

    /** Edges defining data flow between steps */
    edges: PipelineEdge[];
}
```

### PipelineCapabilities

```typescript
interface PipelineCapabilities {
    /** Data write scopes required */
    writes?: Array<'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'PROMOTIONS' | 'INVENTORY' | 'CUSTOM'>;

    /** Additional Vendure permissions required */
    requires?: string[];

    /** Safe for streaming mode execution */
    streamSafe?: boolean;
}
```

### PipelineEdge

```typescript
interface PipelineEdge {
    /** Source step key */
    from: string;

    /** Destination step key */
    to: string;

    /** Branch name for route steps */
    branch?: string;
}
```

## Pipeline Context

Global execution settings that apply to all steps unless overridden.

```typescript
interface PipelineContext {
    /** Default channel code */
    channel?: string;

    /** Default language code for translatable content */
    contentLanguage?: string;

    /** Channel handling strategy */
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI';

    /** Specific channel IDs to operate on (for MULTI strategy) */
    channelIds?: string[];

    /** Validation strictness */
    validationMode?: 'STRICT' | 'LENIENT';

    /** Field to use as idempotency key */
    idempotencyKeyField?: string;

    /** Execution mode */
    runMode?: 'SYNC' | 'ASYNC' | 'BATCH' | 'STREAM';

    /** Default throughput configuration */
    throughput?: Throughput;

    /** Error handling configuration */
    errorHandling?: ErrorHandlingConfig;

    /** Checkpointing configuration for resumable execution */
    checkpointing?: CheckpointingConfig;

    /** Parallel execution configuration */
    parallelExecution?: ParallelExecutionConfig;
}
```

### ErrorHandlingConfig

```typescript
interface ErrorHandlingConfig {
    /** Maximum retry attempts per operation */
    maxRetries?: number;

    /** Initial delay between retries (ms) */
    retryDelayMs?: number;

    /** Maximum delay between retries (ms) */
    maxRetryDelayMs?: number;

    /** Exponential backoff multiplier */
    backoffMultiplier?: number;

    /** Enable dead letter queue for failed records */
    deadLetterQueue?: boolean;

    /** Send alerts when records enter dead letter queue */
    alertOnDeadLetter?: boolean;

    /** Error rate threshold (0-100) that triggers alerts */
    errorThresholdPercent?: number;
}
```

### CheckpointingConfig

```typescript
interface CheckpointingConfig {
    /** Enable checkpointing */
    enabled?: boolean;

    /** Checkpoint creation strategy */
    strategy?: 'COUNT' | 'TIMESTAMP' | 'INTERVAL';

    /** Records between checkpoints (COUNT strategy) */
    intervalRecords?: number;

    /** Milliseconds between checkpoints (INTERVAL strategy) */
    intervalMs?: number;

    /** Timestamp field (TIMESTAMP strategy) */
    field?: string;
}
```

### ParallelExecutionConfig

```typescript
interface ParallelExecutionConfig {
    /** Enable parallel step execution */
    enabled?: boolean;

    /** Maximum concurrent steps (2-16, default: 4) */
    maxConcurrentSteps?: number;

    /** Error handling policy */
    errorPolicy?: 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT';
}
```

## Step Definitions

All steps share a common base structure:

```typescript
interface PipelineStepDefinition {
    /** Unique step identifier */
    key: string;

    /** Step type */
    type: StepType;

    /** Step-specific configuration */
    config: StepConfig;

    /** Human-readable label */
    label?: string;

    /** Help text */
    description?: string;

    /** Whether step is disabled */
    disabled?: boolean;
}

type StepType =
    | 'TRIGGER'
    | 'EXTRACT'
    | 'TRANSFORM'
    | 'VALIDATE'
    | 'ENRICH'
    | 'ROUTE'
    | 'LOAD'
    | 'EXPORT'
    | 'FEED'
    | 'SINK'
    | 'GATE';
```

### Trigger Step

Defines how the pipeline starts.

```typescript
interface TriggerConfig {
    /** Trigger type */
    type: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'EVENT' | 'FILE' | 'MESSAGE';

    // SCHEDULE trigger
    /** Cron expression */
    cron?: string;
    /** Timezone (IANA format, e.g., 'America/New_York') */
    timezone?: string;

    // WEBHOOK trigger
    /** Webhook URL path */
    path?: string;
    /** Signature verification method */
    signature?: 'hmac-sha256' | 'hmac-sha1' | 'none';
    /** Secret code for signature verification */
    secretCode?: string;
    /** Request header for idempotency key */
    idempotencyKey?: string;

    // EVENT trigger
    /** Vendure event class name */
    event?: string;
    /** Event filter criteria */
    filter?: Record<string, any>;

    // FILE trigger
    /** File path pattern (glob supported) */
    filePattern?: string;
    /** Poll interval in seconds (min: 30) */
    pollIntervalSeconds?: number;
    /** Minimum file age in seconds before processing */
    minFileAge?: number;
    /** Recursive directory watching */
    recursive?: boolean;

    // MESSAGE trigger
    /** Queue type */
    queueType?: 'RABBITMQ' | 'SQS' | 'REDIS_STREAMS';
    /** Connection code */
    connectionCode?: string;
    /** Queue/topic name */
    queueName?: string;
    /** Consumer group name (Redis Streams) */
    consumerGroup?: string;
    /** Acknowledgment mode */
    ackMode?: 'AUTO' | 'MANUAL';
    /** Prefetch count */
    prefetchCount?: number;
}
```

### Extract Step

Pull data from external sources.

```typescript
interface ExtractStepConfig {
    /** Extractor adapter code */
    adapterCode: string;

    /** Connection reference */
    connectionCode?: string;

    // HTTP/GraphQL extractors
    /** API endpoint URL */
    url?: string;
    /** HTTP method */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body */
    body?: string | JsonObject;
    /** JSON path to extract data */
    dataPath?: string;
    /** Authentication */
    bearerTokenSecretCode?: string;
    apiKeySecretCode?: string;
    basicAuthSecretCode?: string;
    /** Pagination configuration */
    pagination?: PaginationConfig;

    // File extractors
    /** File path */
    path?: string;
    /** File format */
    format?: 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'TSV';
    /** CSV delimiter */
    delimiter?: string;
    /** CSV has header row */
    hasHeader?: boolean;
    /** JSON array path */
    arrayPath?: string;
    /** XML root element */
    rootElement?: string;

    // Database extractors
    /** SQL query */
    query?: string;
    /** Database table name */
    table?: string;
    /** Incremental sync configuration */
    incremental?: IncrementalConfig;

    // Vendure extractors
    /** Entity type to query */
    entity?: VendureEntityType;
    /** Relations to load */
    relations?: string;
    /** Language code for translations */
    languageCode?: string;
    /** Query batch size */
    batchSize?: number;

    /** Throughput configuration */
    throughput?: Throughput;

    /** Execute asynchronously */
    async?: boolean;

    /** Additional adapter-specific config */
    [key: string]: any;
}
```

#### PaginationConfig

```typescript
interface PaginationConfig {
    /** Pagination type */
    type: 'PAGE' | 'OFFSET' | 'CURSOR' | 'LINK';

    /** Records per page */
    limit?: number;

    /** Starting page number */
    startPage?: number;

    /** Maximum pages to fetch */
    maxPages?: number;

    /** Page parameter name (default: 'page') */
    pageParam?: string;

    /** Limit parameter name (default: 'limit') */
    limitParam?: string;

    /** Offset parameter name (default: 'offset') */
    offsetParam?: string;

    /** Cursor parameter name */
    cursorParam?: string;

    /** JSON path to next cursor value */
    cursorPath?: string;

    /** JSON path to next link URL */
    nextLinkPath?: string;

    /** JSON path to has-more indicator */
    hasMorePath?: string;
}
```

#### IncrementalConfig

```typescript
interface IncrementalConfig {
    /** Enable incremental extraction */
    enabled: boolean;

    /** Field to track (e.g., 'updated_at') */
    field: string;

    /** Comparison operator */
    operator?: '>' | '>=' | '<' | '<=';

    /** Initial value for first run */
    initialValue?: string | number | Date;

    /** Whether to include the checkpoint value in next run */
    inclusive?: boolean;
}
```

### Transform Step

Modify records using operators.

```typescript
interface TransformStepConfig {
    /** Ordered list of operators to apply */
    operators: OperatorConfig[];

    /** Throughput configuration */
    throughput?: Throughput;

    /** Execute operators asynchronously */
    async?: boolean;

    /** Per-record retry configuration */
    retryPerRecord?: RetryPerRecordConfig;
}
```

#### OperatorConfig

```typescript
interface OperatorConfig {
    /** Operator type */
    op: string;

    /** Operator-specific arguments */
    args: Record<string, any>;

    /** Conditional execution */
    condition?: FilterCondition | FilterCondition[];
}
```

#### RetryPerRecordConfig

```typescript
interface RetryPerRecordConfig {
    /** Maximum retry attempts per record */
    maxRetries: number;

    /** Delay between retries (ms) */
    retryDelayMs?: number;

    /** Backoff strategy */
    backoff?: 'FIXED' | 'EXPONENTIAL';

    /** Error patterns to retry */
    retryableErrors?: string[];
}
```

### Validate Step

Validate records against rules.

```typescript
interface ValidateStepConfig {
    /** Error handling mode */
    errorHandlingMode: 'FAIL_FAST' | 'ACCUMULATE';

    /** Validation rules */
    rules?: ValidationRuleConfig[];

    /** Schema reference for validation */
    schemaRef?: SchemaRefConfig;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

#### ValidationRuleConfig

```typescript
interface ValidationRuleConfig {
    /** Rule type */
    type: 'business' | 'schema' | 'custom';

    /** Rule specification */
    spec: {
        /** Field to validate */
        field?: string;

        /** Field is required */
        required?: boolean;

        /** Field type */
        type?: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url';

        /** Minimum value/length */
        min?: number;

        /** Maximum value/length */
        max?: number;

        /** Regular expression pattern */
        pattern?: string;

        /** Allowed values */
        enum?: any[];

        /** Custom validation function code */
        validate?: string;

        /** Error message template */
        message?: string;
    };
}
```

#### SchemaRefConfig

```typescript
interface SchemaRefConfig {
    /** Schema format */
    type: 'json-schema' | 'ajv' | 'yup' | 'zod';

    /** Inline schema definition */
    schema?: JsonObject;

    /** External schema URL */
    url?: string;

    /** Schema validation options */
    options?: Record<string, any>;
}
```

### Enrich Step

Add data to records from external lookups or static values.

```typescript
interface EnrichStepConfig {
    /** Enricher adapter code (optional if using built-in) */
    adapterCode?: string;

    /** Enrichment source type */
    sourceType?: 'STATIC' | 'HTTP' | 'VENDURE';

    /** Default values (set only if field is missing) */
    defaults?: Record<string, JsonValue>;

    /** Always set these values */
    set?: Record<string, JsonValue>;

    /** Computed fields using template expressions */
    computed?: Record<string, string>;

    // HTTP lookup
    /** Lookup endpoint URL */
    endpoint?: string;
    /** Field to use for lookup */
    matchField?: string;
    /** Target field for enriched data */
    targetField?: string;

    // Vendure lookup
    /** Entity type to lookup */
    entity?: VendureEntityType;

    /** Additional config */
    config?: JsonObject;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

### Route Step

Split data flow based on conditions.

```typescript
interface RouteStepConfig {
    /** Route branches */
    branches: RouteBranchConfig[];

    /** Default branch for unmatched records */
    defaultTo?: string;
}
```

#### RouteBranchConfig

```typescript
interface RouteBranchConfig {
    /** Branch name (used in edge definition) */
    name: string;

    /** Conditions to match this branch */
    when: FilterCondition[];

    /** Branch label */
    label?: string;
}
```

#### FilterCondition

```typescript
interface FilterCondition {
    /** Field to compare */
    field: string;

    /** Comparison operator */
    cmp: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex' | 'exists';

    /** Comparison value */
    value?: any;

    /** Negate the condition */
    not?: boolean;

    /** Case-insensitive comparison */
    caseInsensitive?: boolean;
}
```

### Load Step

Create or update Vendure entities.

```typescript
interface LoadStepConfig {
    /** Loader adapter code */
    adapterCode: string;

    /** Load strategy */
    strategy?: 'CREATE' | 'UPDATE' | 'UPSERT' | 'MERGE' | 'SOFT_DELETE' | 'HARD_DELETE';

    /** Channel for operation */
    channel?: string;

    /** Channel handling strategy */
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI';

    /** Validation mode */
    validationMode?: 'STRICT' | 'LENIENT';

    /** Conflict resolution strategy */
    conflictStrategy?: 'SOURCE_WINS' | 'VENDURE_WINS' | 'MERGE' | 'MANUAL_QUEUE';

    // Field mappings (loader-specific)
    /** Field to match for UPDATE/UPSERT */
    matchField?: string;
    /** Name field */
    nameField?: string;
    /** Slug field */
    slugField?: string;
    /** Description field */
    descriptionField?: string;
    /** SKU field */
    skuField?: string;
    /** Price field */
    priceField?: string;
    /** Email field */
    emailField?: string;
    /** First name field */
    firstNameField?: string;
    /** Last name field */
    lastNameField?: string;
    /** Phone number field */
    phoneNumberField?: string;
    /** Code field */
    codeField?: string;
    /** Parent field */
    parentField?: string;
    /** Position field */
    positionField?: string;
    /** Stock quantity field */
    stockOnHandField?: string;
    /** Stock location field */
    stockLocationField?: string;
    /** URL field */
    urlField?: string;
    /** Enabled field */
    enabledField?: string;

    /** Additional loader config */
    config?: JsonObject;

    /** Throughput configuration */
    throughput?: Throughput;

    /** Execute asynchronously */
    async?: boolean;
}
```

### Export Step

Send data to external destinations.

```typescript
interface ExportStepConfig {
    /** Exporter adapter code */
    adapterCode: string;

    /** Export target type */
    target?: 'FILE' | 'API' | 'WEBHOOK' | 'S3' | 'SFTP' | 'EMAIL';

    /** Export format */
    format?: 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON';

    // File export
    /** Output path */
    path?: string;
    /** Output filename */
    filename?: string;

    // S3 export
    /** S3 bucket */
    bucket?: string;
    /** S3 key prefix */
    prefix?: string;
    /** Connection code */
    connectionCode?: string;

    // API/Webhook export
    /** Endpoint URL */
    url?: string;
    /** HTTP method */
    method?: 'POST' | 'PUT' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** API key secret */
    apiKeySecretCode?: string;

    // Format options
    /** CSV delimiter */
    delimiter?: string;
    /** Include header row */
    includeHeader?: boolean;
    /** Pretty-print JSON */
    pretty?: boolean;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

### Feed Step

Generate product feeds for e-commerce platforms.

```typescript
interface FeedStepConfig {
    /** Feed adapter code */
    adapterCode: string;

    /** Feed type */
    feedType?: 'GOOGLE_SHOPPING' | 'META_CATALOG' | 'AMAZON' | 'PINTEREST' | 'CUSTOM';

    /** Output format */
    format?: 'XML' | 'CSV' | 'TSV' | 'JSON' | 'NDJSON';

    /** Output file path */
    outputPath?: string;

    // Common feed fields
    /** Target country code */
    targetCountry?: string;
    /** Content language */
    contentLanguage?: string;
    /** Currency code */
    currency?: string;

    // Field mappings
    /** Title field */
    titleField?: string;
    /** Description field */
    descriptionField?: string;
    /** Price field */
    priceField?: string;
    /** Image field */
    imageField?: string;
    /** Link field */
    linkField?: string;
    /** Brand field */
    brandField?: string;
    /** GTIN field */
    gtinField?: string;
    /** MPN field */
    mpnField?: string;
    /** Condition field */
    conditionField?: string;
    /** Availability field */
    availabilityField?: string;

    /** Additional feed config */
    config?: JsonObject;
}
```

### Sink Step

Index data to search engines or message queues.

```typescript
interface SinkStepConfig {
    /** Sink adapter code */
    adapterCode: string;

    /** Sink type */
    sinkType?: 'ELASTICSEARCH' | 'OPENSEARCH' | 'MEILISEARCH' | 'ALGOLIA' | 'TYPESENSE' | 'RABBITMQ' | 'SQS' | 'REDIS_STREAMS' | 'WEBHOOK' | 'CUSTOM';

    // Search engine sinks
    /** Index name */
    indexName?: string;
    /** Host */
    host?: string;
    /** Port */
    port?: number;
    /** ID field */
    idField?: string;
    /** Bulk batch size */
    bulkSize?: number;
    /** Connection code */
    connectionCode?: string;

    // Message queue sinks
    /** Queue/topic name */
    queueName?: string;
    /** Exchange name (RabbitMQ) */
    exchangeName?: string;
    /** Routing key (RabbitMQ) */
    routingKey?: string;
    /** Message group ID (SQS) */
    messageGroupId?: string;

    // Webhook sink
    /** Webhook URL */
    url?: string;
    /** HTTP method */
    method?: 'POST' | 'PUT';
    /** Headers */
    headers?: Record<string, string>;
    /** API key secret */
    apiKeySecretCode?: string;

    /** Additional sink config */
    config?: JsonObject;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

### Gate Step

Add human-in-the-loop approval gates.

```typescript
interface GateStepConfig {
    /** Approval type */
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';

    /** Auto-approve timeout (seconds) */
    timeoutSeconds?: number;

    /** Error threshold percent (0-100) */
    errorThresholdPercent?: number;

    /** Webhook notification URL */
    notifyWebhook?: string;

    /** Email notification address */
    notifyEmail?: string;

    /** Number of records to preview */
    previewCount?: number;
}
```

## Common Configuration Types

### Throughput

Rate limiting and performance tuning.

```typescript
interface Throughput {
    /** Records per batch */
    batchSize?: number;

    /** Parallel batch processing */
    concurrency?: number;

    /** Maximum requests per second */
    rateLimitRps?: number;

    /** Drain strategy when queue is full */
    drainStrategy?: 'BACKOFF' | 'SHED' | 'QUEUE';

    /** Pause on high error rate */
    pauseOnErrorRate?: {
        /** Error rate threshold (0-1) */
        threshold: number;
        /** Check interval (seconds) */
        intervalSec: number;
    };
}
```

### VendureEntityType

```typescript
type VendureEntityType =
    | 'PRODUCT'
    | 'PRODUCT_VARIANT'
    | 'CUSTOMER'
    | 'CUSTOMER_GROUP'
    | 'ORDER'
    | 'COLLECTION'
    | 'FACET'
    | 'FACET_VALUE'
    | 'ASSET'
    | 'PROMOTION'
    | 'SHIPPING_METHOD'
    | 'PAYMENT_METHOD'
    | 'TAX_CATEGORY'
    | 'TAX_RATE'
    | 'COUNTRY'
    | 'ZONE'
    | 'CHANNEL'
    | 'TAG'
    | 'STOCK_LOCATION'
    | 'INVENTORY';
```

## Hook Types

Lifecycle hooks for custom logic at specific pipeline stages.

```typescript
interface PipelineHooks {
    // Pipeline-level hooks
    PIPELINE_STARTED?: HookAction[];
    PIPELINE_COMPLETED?: HookAction[];
    PIPELINE_FAILED?: HookAction[];
    ON_ERROR?: HookAction[];

    // Step-level hooks (before/after each step type)
    BEFORE_TRIGGER?: HookAction[];
    AFTER_TRIGGER?: HookAction[];
    BEFORE_EXTRACT?: HookAction[];
    AFTER_EXTRACT?: HookAction[];
    BEFORE_TRANSFORM?: HookAction[];
    AFTER_TRANSFORM?: HookAction[];
    BEFORE_VALIDATE?: HookAction[];
    AFTER_VALIDATE?: HookAction[];
    BEFORE_ENRICH?: HookAction[];
    AFTER_ENRICH?: HookAction[];
    BEFORE_LOAD?: HookAction[];
    AFTER_LOAD?: HookAction[];
    BEFORE_EXPORT?: HookAction[];
    AFTER_EXPORT?: HookAction[];
    BEFORE_SINK?: HookAction[];
    AFTER_SINK?: HookAction[];
}
```

### HookAction

```typescript
type HookAction =
    | InterceptorHookAction
    | ScriptHookAction
    | WebhookHookAction
    | EmitHookAction
    | TriggerPipelineHookAction
    | LogHookAction;

interface InterceptorHookAction {
    type: 'INTERCEPTOR';
    /** Interceptor name */
    name: string;
    /** JavaScript code to transform records */
    code: string;
    /** Fail pipeline if interceptor throws */
    failOnError?: boolean;
}

interface ScriptHookAction {
    type: 'SCRIPT';
    /** Pre-registered script function name */
    scriptName: string;
    /** Arguments to pass to script */
    args?: Record<string, any>;
}

interface WebhookHookAction {
    type: 'WEBHOOK';
    /** Webhook URL */
    url: string;
    /** Request headers */
    headers?: Record<string, string>;
    /** Retry configuration */
    retryConfig?: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
}

interface EmitHookAction {
    type: 'EMIT';
    /** Event name to emit */
    event: string;
    /** Event payload */
    payload?: JsonObject;
}

interface TriggerPipelineHookAction {
    type: 'TRIGGER_PIPELINE';
    /** Pipeline code to trigger */
    pipelineCode: string;
    /** Parameters to pass */
    parameters?: JsonObject;
}

interface LogHookAction {
    type: 'LOG';
    /** Log level */
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    /** Log message */
    message: string;
}
```

## Operator Types

See [Operators Reference](./operators.md) for the complete list of 61 built-in operators and their configurations.

Common operator patterns:

```typescript
// Field operations
{ op: 'rename', args: { from: 'old_name', to: 'new_name' } }
{ op: 'remove', args: { path: 'field_to_delete' } }
{ op: 'set', args: { path: 'field', value: 'constant' } }
{ op: 'copy', args: { from: 'source', to: 'destination' } }

// String operations
{ op: 'uppercase', args: { path: 'name' } }
{ op: 'trim', args: { path: 'description' } }
{ op: 'slugify', args: { source: 'name', target: 'slug' } }
{ op: 'template', args: { template: '${brand} - ${name}', target: 'title' } }

// Number operations
{ op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } }
{ op: 'round', args: { source: 'price', precision: 2, target: 'price' } }

// Date operations
{ op: 'parseDate', args: { source: 'created_at', format: 'YYYY-MM-DD', target: 'createdDate' } }
{ op: 'formatDate', args: { source: 'date', format: 'MM/DD/YYYY', target: 'formattedDate' } }

// Array operations
{ op: 'split', args: { source: 'tags', delimiter: ',', target: 'tagArray' } }
{ op: 'join', args: { source: 'categories', delimiter: ' > ', target: 'breadcrumb' } }

// Object operations
{ op: 'flatten', args: { source: 'nested.object', target: 'flat' } }
{ op: 'pick', args: { fields: ['id', 'name', 'sku'] } }

// Conditional operations
{ op: 'coalesce', args: { sources: ['preferredName', 'name', 'title'], target: 'displayName' } }
{ op: 'default', args: { path: 'enabled', value: true } }
```

## Type Utilities

Useful TypeScript utility types for working with pipelines:

```typescript
import type {
    PipelineDefinition,
    PipelineStepDefinition,
    ExtractStepConfig,
    TransformStepConfig,
    LoadStepConfig,
    JsonObject,
    JsonValue,
} from '@oronts/vendure-data-hub-plugin';

// Extract config type from a step definition
type StepConfig<T extends PipelineStepDefinition> = T['config'];

// Helper to create typed step configs
function createExtractConfig(config: ExtractStepConfig): ExtractStepConfig {
    return config;
}

function createTransformConfig(config: TransformStepConfig): TransformStepConfig {
    return config;
}

function createLoadConfig(config: LoadStepConfig): LoadStepConfig {
    return config;
}
```

## Complete Example

Here's a complete pipeline definition demonstrating all major features:

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const pipeline = createPipeline()
    .name('Advanced Product Sync')
    .description('Comprehensive product synchronization with validation and routing')
    .version(1)

    // Global context
    .context({
        channel: 'default',
        contentLanguage: 'en',
        channelStrategy: 'EXPLICIT',
        validationMode: 'STRICT',
        runMode: 'BATCH',
        throughput: {
            batchSize: 100,
            concurrency: 4,
            rateLimitRps: 10,
        },
        errorHandling: {
            maxRetries: 3,
            retryDelayMs: 1000,
            backoffMultiplier: 2,
            deadLetterQueue: true,
            errorThresholdPercent: 5,
        },
        checkpointing: {
            enabled: true,
            strategy: 'COUNT',
            intervalRecords: 1000,
        },
    })

    // Capabilities
    .capabilities({
        writes: ['CATALOG'],
        streamSafe: true,
    })

    // Lifecycle hooks
    .hooks({
        PIPELINE_STARTED: [{
            type: 'LOG',
            level: 'INFO',
            message: 'Starting product sync',
        }],
        AFTER_EXTRACT: [{
            type: 'INTERCEPTOR',
            name: 'Add metadata',
            code: 'return records.map(r => ({ ...r, _imported: new Date() }));',
        }],
        PIPELINE_COMPLETED: [{
            type: 'WEBHOOK',
            url: 'https://api.example.com/notifications/sync-complete',
            retryConfig: {
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                backoffMultiplier: 2,
            },
        }],
    })

    // Steps
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',
        timezone: 'UTC',
    })

    .extract('fetch-api', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        method: 'GET',
        dataPath: 'data.products',
        pagination: {
            type: 'PAGE',
            limit: 100,
            maxPages: 50,
        },
        incremental: {
            enabled: true,
            field: 'updated_at',
            operator: '>',
        },
    })

    .transform('normalize', {
        operators: [
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100' } },
            { op: 'set', args: { path: 'enabled', value: true } },
            { op: 'template', args: { template: '${brand} - ${name}', target: 'fullName' } },
        ],
        retryPerRecord: {
            maxRetries: 3,
            backoff: 'EXPONENTIAL',
        },
    })

    .validate('check-data', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'sku', required: true, pattern: '^[A-Z0-9-]+$' } },
            { type: 'business', spec: { field: 'price', required: true, min: 0 } },
        ],
    })

    .enrich('add-defaults', {
        defaults: { currency: 'USD', taxCategory: 'standard' },
        computed: { displayName: '${brand} ${name}' },
    })

    .route('by-category', {
        branches: [
            {
                name: 'premium',
                when: [{ field: 'price', cmp: 'gt', value: 1000 }],
            },
            {
                name: 'standard',
                when: [{ field: 'price', cmp: 'lte', value: 1000 }],
            },
        ],
    })

    .gate('review-premium', {
        approvalType: 'THRESHOLD',
        errorThresholdPercent: 5,
        notifyEmail: 'admin@example.com',
    })

    .load('upsert-premium', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
        conflictStrategy: 'SOURCE_WINS',
    })

    .load('upsert-standard', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
        conflictStrategy: 'MERGE',
    })

    .sink('index-search', {
        adapterCode: 'meilisearch',
        indexName: 'products',
        host: 'localhost',
        port: 7700,
        idField: 'id',
        bulkSize: 500,
    })

    // Edges
    .edge('schedule', 'fetch-api')
    .edge('fetch-api', 'normalize')
    .edge('normalize', 'check-data')
    .edge('check-data', 'add-defaults')
    .edge('add-defaults', 'by-category')
    .edge('by-category', 'review-premium', 'premium')
    .edge('by-category', 'upsert-standard', 'standard')
    .edge('review-premium', 'upsert-premium')
    .edge('upsert-premium', 'index-search')
    .edge('upsert-standard', 'index-search')

    .build();
```

## See Also

- [Pipeline Builder Guide](./pipeline-builder.md) - Fluent API documentation
- [Operators Reference](./operators.md) - All 61 built-in operators
- [DSL Examples](./examples.md) - Real-world pipeline examples
- [Architecture Overview](../architecture.md) - Understanding the execution model
