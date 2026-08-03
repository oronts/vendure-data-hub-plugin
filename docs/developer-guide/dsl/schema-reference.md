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

    /** Declared dependencies used for publication validation and rename/delete protection */
    dependsOn?: string[];

    /** Lifecycle hooks for custom logic */
    hooks?: PipelineHooks;

    /** All steps in the pipeline */
    steps: PipelineStepDefinition[];

    /** Edges defining data flow between steps */
    edges: PipelineEdge[];
}
```

Definitions must serialize to at most 1,048,576 UTF-8 bytes and may contain at
most 32 nested object or array levels, including the root. Circular code-first
objects are rejected before persistence. Keep large lookup datasets outside the
definition and reference them through a bounded source or custom adapter.

### PipelineCapabilities

```typescript
interface PipelineCapabilities {
    /** Data write scopes required */
    writes?: Array<'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'PROMOTIONS' | 'INVENTORY' | 'CUSTOM'>;

    /** Additional Vendure permissions required */
    requires?: string[];

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
    /** Default Vendure channel token */
    channel?: string;

    /** Default language code for translatable content */
    contentLanguage?: string;

    /** Channel handling strategy */
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI';

    /** Specific channel IDs to operate on (for EXPLICIT or MULTI strategy) */
    channelIds?: string[];

    /** Validation strictness */
    validationMode?: 'STRICT' | 'LENIENT';

    /** Field to use as idempotency key */
    idempotencyKeyField?: string;

    /** Default throughput configuration */
    throughput?: Throughput;

    /** Error handling configuration */
    errorHandling?: ErrorHandlingConfig;

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

}
```

Checkpoints are adapter-managed state. Extractors, exporters, file watchers, and
approval gates persist only the offsets or cursors they explicitly write. There
is no generic count-, timestamp-, or interval-based checkpoint scheduler.

### ParallelExecutionConfig

```typescript
interface ParallelExecutionConfig {
    /** Enable parallel step execution */
    enabled?: boolean;

    /** Maximum concurrent steps (1-16, default: 4) */
    maxConcurrentSteps?: number; // Integer from 1 to 16; default 4

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

    /** Overrides the pipeline context for this step */
    context?: StepContextOverride;
}

interface StepContextOverride {
    contentLanguage?: string;
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI';
    channelIds?: string[];
    validationMode?: 'STRICT' | 'LENIENT';
    throughput?: Throughput;
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

The effective context is resolved field by field. A step override takes
precedence over the pipeline context, which takes precedence over the active
Vendure request context. Missing channel IDs and content language inherit the
active request channel and language. `channelStrategy` and `validationMode`
default to `INHERIT` and `STRICT`. Throughput objects are
merged so a step can override one limit without discarding the pipeline
defaults. `EXPLICIT` and `MULTI` require at least one effective channel ID.
The pipeline-level `channel` value is a Vendure channel token, while
`channelIds` contains Vendure channel IDs.

### Trigger Step

Defines how the pipeline starts.

The public SDK export `TriggerConfig` is an alias of the canonical
`PipelineTrigger` type. Message and file-watch configuration is nested under
`message` and `fileWatch`; `event` contains the exact Vendure event class name.
Schedule and webhook fields use the documented top-level form.

```typescript
type TriggerConfig = PipelineTrigger;

interface PipelineTrigger {
    type: TriggerType;
    enabled?: boolean;
    event?: VendureEventType;
    message?: MessageTriggerConfig;
    fileWatch?: FileWatchTriggerConfig;

    // Flattened schedule convenience fields
    cron?: string;
    timezone?: string;
    intervalSec?: number;

    // Flattened webhook convenience fields
    authentication?: WebhookAuthType;
    secretCode?: string;
    apiKeySecretCode?: string;
    apiKeyHeaderName?: string;
    apiKeyPrefix?: string;
    basicSecretCode?: string;
    jwtSecretCode?: string;
    jwtHeaderName?: string;
    jwtIssuer?: string;
    jwtAudience?: string;
    hmacHeaderName?: string;
    hmacAlgorithm?: HmacAlgorithm;
    rateLimit?: number;
    rateLimitWindow?: number;
    idempotencyKeyHeader?: string;
    idempotencyTtlSec?: number;
    requireIdempotencyKey?: boolean;
}

type TriggerType =
    | 'MANUAL'
    | 'SCHEDULE'
    | 'WEBHOOK'
    | 'EVENT'
    | 'FILE'
    | 'MESSAGE';

interface ScheduleTriggerConfig {
    cron?: string;
    intervalSec?: number;
    timezone?: string;
}

interface WebhookTriggerConfig {
    authentication?: WebhookAuthType;
    secretCode?: string;
    apiKeySecretCode?: string;
    apiKeyHeaderName?: string;
    apiKeyPrefix?: string;
    basicSecretCode?: string;
    jwtSecretCode?: string;
    jwtHeaderName?: string;
    jwtIssuer?: string;
    jwtAudience?: string;
    hmacHeaderName?: string;
    hmacAlgorithm?: HmacAlgorithm;
    rateLimit?: number;
    rateLimitWindow?: number;
    requireIdempotencyKey?: boolean;
    idempotencyKeyHeader?: string;
    idempotencyTtlSec?: number;
}

interface FileWatchTriggerConfig {
    /** Remote directory for FTP/SFTP or object prefix for S3 */
    path: string;
    /** Optional glob matched against each discovered file name */
    pattern?: string;
    /** Include subdirectories; defaults to true */
    recursive?: boolean;
    /** Integer seconds from 0 to 604,800; defaults to 30 */
    minFileAge?: number;
    connectionCode: string;
    /** Integer milliseconds from 30,000 to 86,400,000; defaults to 300,000 */
    pollIntervalMs?: number;
}

interface MessageTriggerConfig {
    queueType: QueueTypeValue;
    connectionCode?: string;
    queueName: string;
    consumerGroup?: string;
    batchSize?: number;
    ackMode?: AckMode;
    maxRetries?: number;
    deadLetterQueue?: string;
    pollIntervalMs?: number;
    concurrency?: number;
    autoStart?: boolean;
    prefetch?: number;
}

type WebhookAuthType = 'NONE' | 'BASIC' | 'API_KEY' | 'HMAC' | 'JWT';
type HmacAlgorithm = 'SHA256' | 'SHA512';
type QueueTypeValue = 'RABBITMQ_AMQP' | 'SQS' | 'REDIS_STREAMS' | 'INTERNAL';
type AckMode = 'MANUAL';

type VendureEventType =
    | 'ProductEvent'
    | 'ProductVariantEvent'
    | 'ProductVariantPriceEvent'
    | 'CollectionModificationEvent'
    | 'AssetEvent'
    | 'StockMovementEvent'
    | 'OrderStateTransitionEvent'
    | 'OrderPlacedEvent'
    | 'RefundStateTransitionEvent'
    | 'PaymentStateTransitionEvent'
    | 'CustomerEvent'
    | 'AccountRegistrationEvent'
    | 'CustomerAddressEvent';
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
    body?: JsonObject;
    /** JSON path to extract data */
    dataPath?: string;
    /** Authentication override; secret-backed modes require connectionCode */
    auth?: {
        type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
        /** Bearer token, API key, or Basic-auth password Secret Code */
        secretCode?: string;
        /** API-key header name */
        headerName?: string;
        /** Basic-auth username */
        username?: string;
        /** Basic-auth username Secret Code */
        usernameSecretCode?: string;
    };
    /** Request rate limit, retry policy, and timeout */
    rateLimit?: RateLimitConfig;
    retry?: RetryConfig;
    timeoutMs?: number;
    /** Extractor-specific pagination configuration */
    pagination?: PaginationConfig | GraphQLPaginationConfig | DatabasePaginationConfig;

    // Uploaded or inline CSV, JSON, XML, and XLSX extractors
    /** Data Hub upload ID */
    fileId?: string;
    /** Inline CSV, JSON, or XML text */
    csvText?: string;
    jsonText?: string;
    xmlText?: string;
    /** Inline CSV rows */
    rows?: JsonValue[];
    /** Format-specific parsing options */
    delimiter?: string;
    hasHeader?: boolean;
    itemsPath?: string;
    recordPath?: string;
    attributePrefix?: string;
    sheetName?: string | number;

    // Database extractors
    /** SQL query */
    query?: string;
    /** Parameter values for the database query */
    parameters?: JsonValue[];
    /** Incremental sync configuration */
    incremental?: DatabaseIncrementalConfig;

    // Vendure extractors
    /** Entity type to query */
    entity?: VendureEntityType;
    /** Relations to load */
    relations?: string[];
    /** Language code for translations */
    languageCode?: string;
    /** Query batch size */
    batchSize?: number;

    /** Throughput configuration */
    throughput?: Throughput;

    /** Execute asynchronously */
    async?: boolean;

    /** Additional adapter-specific config */
    [key: string]: unknown;
}
```

For `httpApi` and `graphql`, a secret-backed `auth` object requires
`connectionCode`. The saved HTTP, REST, or GraphQL connection must define a
base URL. Relative URLs resolve against that base; absolute URLs and redirects
must retain its exact origin.

#### HTTP PaginationConfig

```typescript
interface PaginationConfig {
    /** Pagination type */
    type: 'NONE' | 'PAGE' | 'OFFSET' | 'CURSOR' | 'LINK_HEADER';

    /** Records per page */
    limit?: number;

    /** Maximum pages to fetch */
    maxPages?: number;

    /** Page parameter name (default: 'page') */
    pageParam?: string;

    /** Page-size parameter name for PAGE pagination (default: 'limit') */
    pageSizeParam?: string;

    /** Limit parameter name (default: 'limit') */
    limitParam?: string;

    /** Offset parameter name (default: 'offset') */
    offsetParam?: string;

    /** Cursor parameter name */
    cursorParam?: string;

    /** JSON path to next cursor value */
    cursorPath?: string;

    /** JSON path to has-more indicator */
    hasMorePath?: string;
}
```

`LINK_HEADER` follows the HTTP `Link` response header entry with `rel="next"`.

#### GraphQLPaginationConfig

```typescript
interface GraphQLPaginationConfig {
    type: 'NONE' | 'OFFSET' | 'CURSOR' | 'RELAY';
    limit?: number;
    maxPages?: number;
    offsetVariable?: string;
    limitVariable?: string;
    cursorVariable?: string;
    pageInfoPath?: string;
    hasNextPagePath?: string;
    endCursorPath?: string;
    totalCountPath?: string;
}
```

#### Database Pagination and Incremental Config

```typescript
interface DatabasePaginationConfig {
    enabled: boolean;
    type: 'OFFSET' | 'CURSOR';
    pageSize: number;
    cursorColumn?: string;
    cursorTieBreakerColumn?: string;
    maxPages?: number;
}

interface DatabaseIncrementalConfig {
    enabled: boolean;
    column: string;
}
```

Incremental extraction requires enabled `CURSOR` pagination. Its `column` must
match `cursorColumn`, and `cursorTieBreakerColumn` must be a different, unique,
stable column. The runtime checkpoints both values so a bounded run cannot skip
rows that share the same incremental value.

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
    args: JsonObject;

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
    /** Error handling mode; defaults to FAIL_FAST */
    errorHandlingMode?: 'FAIL_FAST' | 'ACCUMULATE';

    /** Validation rules */
    rules?: ValidationRuleConfig[];

    /** Throughput configuration */
    throughput?: Throughput;

    /** Immutable registry schema validated before inline business rules */
    schemaRef?: { schemaId: string; version: string };
}
```

#### ValidationRuleConfig

```typescript
interface ValidationRuleConfig {
    /** Inline field rule */
    type: 'business';

    /** Rule specification */
    spec: {
        /** Field to validate */
        field: string;

        /** Field is required */
        required?: boolean;

        /** Field type */
        type?: 'string' | 'number' | 'boolean';

        /** Minimum value/length */
        min?: number;

        /** Maximum value/length */
        max?: number;

        /** Regular expression pattern */
        pattern?: string;

        /** Allowed values */
        enum?: JsonValue[];

        /** Custom error message */
        error?: string;
    };
}
```

Registry schema validation is configured with `ValidateStepConfig.schemaRef`.
Inline `rules` only describe field-level business rules.

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
    /** Required HTTP endpoint URL; supports {{field.path}} placeholders */
    url?: string;
    /** Record field used in cache identity */
    keyField?: string;
    /** Target field for enriched data */
    target?: string;

    // Vendure lookup
    /** Required registered loader entity type */
    entityType?: string;
    /** Required input record field */
    sourceField?: string;
    /** Required Vendure lookup field */
    lookupField?: string;
    /** Optional entity-field to output-field mappings */
    targetFields?: Record<string, string>;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

When `adapterCode` is absent, STATIC requires a non-empty `defaults`, `set`, or
`computed` object; HTTP requires `url`; and VENDURE requires `entityType`,
`sourceField`, and `lookupField`. Invalid built-in configurations fail validation
and runtime execution rather than passing records through unchanged.

### Route Step

Split data flow based on conditions.

```typescript
interface RouteStepConfig {
    /** Route branches */
    branches: RouteBranchConfig[];

    /** Target step key for unmatched records; requires a matching edge */
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
    value?: JsonValue;

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

    /** Channel handling strategy; emitted as per-step execution context */
    channelStrategy?: 'EXPLICIT' | 'INHERIT' | 'MULTI';

    /** Vendure channel IDs for EXPLICIT or MULTI execution */
    channelIds?: string[];

    /** Validation mode */
    validationMode?: 'STRICT' | 'LENIENT';

    /** Conflict resolution strategy */
    conflictStrategy?: 'SOURCE_WINS' | 'VENDURE_WINS' | 'MERGE' | 'MANUAL_QUEUE';

    // Identity and field mappings (loader-specific)
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

    /** Optional remote or explicit local delivery */
    destinationType?: 'LOCAL' | 'HTTP' | 'S3' | 'SFTP' | 'FTP' | 'EMAIL';

    /** Export format */
    format?: 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON';

    // File export
    /** Directory relative to DATA_HUB_EXPORT_ROOT */
    path?: string;
    /** Output filename pattern */
    filenamePattern?: string;

    // S3 export
    /** S3 bucket */
    bucket?: string;
    /** S3 key prefix */
    prefix?: string;
    accessKeyIdSecretCode?: string;
    secretAccessKeySecretCode?: string;
    acl?: 'private' | 'public-read';

    // HTTP export
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    /** Records sent per request; integer from 1 to 10000, default 100 */
    batchSize?: number;
    /** Request timeout in milliseconds; integer from 1 to 300000, default 30000 */
    timeoutMs?: number;
    /** Retries after the first attempt; integer from 0 to 10, default 0 */
    retryCount?: number;
    /** Initial retry delay in milliseconds; integer from 0 to 300000 */
    retryDelayMs?: number;
    /** Maximum retry delay in milliseconds; integer from 0 to 300000 */
    maxRetryDelayMs?: number;
    /** Exponential backoff multiplier from 1 to 10 */
    backoffMultiplier?: number;
    /** Non-sensitive static headers only */
    headers?: Record<string, string>;
    /** Header name to Secret Code mapping */
    headerSecretCodes?: Record<string, string>;
    bearerTokenSecretCode?: string;
    /** Secret Code whose resolved value is username:password */
    basicSecretCode?: string;
    auth?: {
        type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
    };

    // Format options
    /** CSV delimiter */
    delimiter?: string;
    /** Include header row */
    includeHeader?: boolean;
    /** Spreadsheet formula handling; defaults to SPREADSHEET_SAFE */
    formulaMode?: 'SPREADSHEET_SAFE' | 'PRESERVE';
    /** Pretty-print JSON */
    pretty?: boolean;

    /** Throughput configuration */
    throughput?: Throughput;
}
```

When `destinationType` is omitted, the CSV, JSON, and XML exporters keep their
direct local-file behavior using `path`. When it is present, the value is
validated and dispatched through the destination delivery handlers; unknown
values never fall back to a local write. HTTP configuration uses `url`, not
`endpoint`. Sensitive static headers such as `Authorization`, cookies, API
keys, tokens, or passwords are rejected and must reference Secret Codes. The
`restPostExport` and `webhookExport` adapters expose the same delivery,
authentication, batching, timeout, and retry controls. Configure either Bearer
or Basic authentication, never both. `maxRetryDelayMs` cannot be lower than
`retryDelayMs`, and invalid numeric values fail before the first request.

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

    /** File path relative to DATA_HUB_EXPORT_ROOT */
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

Index data to search engines, publish queue messages, or call an outgoing
webhook. Sink-specific required fields are enforced by the selected adapter.

```typescript
interface SinkStepConfig {
    /** Sink adapter code */
    adapterCode: string;

    defaultOperation?: 'UPSERT' | 'DELETE';
    batchSize?: number;
    fields?: string[];
    excludeFields?: string[];
    languageCode?: string;
    translationsField?: string;
    channelCode?: string;
    channelField?: string;

    // Search sinks
    host?: string;             // MeiliSearch or Typesense
    node?: string;             // Elasticsearch or OpenSearch
    port?: number;             // Typesense
    protocol?: 'http' | 'https';
    indexName?: string;
    collectionName?: string;
    primaryKey?: string;       // MeiliSearch
    idField?: string;
    searchableFields?: string[];
    filterableFields?: string[];
    sortableFields?: string[];
    appId?: string;            // Algolia
    apiKeySecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;

    // Queue producer
    queueType?: 'RABBITMQ' | 'RABBITMQ_AMQP' | 'SQS' | 'REDIS_STREAMS';
    connectionCode?: string;
    queueName?: string;
    routingKey?: string;
    headers?: Record<string, string>;
    persistent?: boolean;
    priority?: number;
    ttlMs?: number;

    // Webhook sink
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    bearerTokenSecretCode?: string;
    apiKeyHeader?: string;
    hmacSecretCode?: string;
    signatureHeaderName?: string;
    timeoutMs?: number;
    retries?: number;
}
```

### Gate Step

Add human-in-the-loop approval gates.

```typescript
interface GateStepConfig {
    /** Approval type */
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';

    /** Required for TIMEOUT; integer seconds in the range 1-31,536,000 */
    timeoutSeconds?: number;

    /** Required for THRESHOLD; finite percent in the range 0-100 */
    errorThresholdPercent?: number;

    /** Webhook notification URL */
    notifyWebhook?: string;

    /** Email notification address */
    notifyEmail?: string;

    /** Integer records to preview, 1-100; defaults to 10 */
    previewCount?: number;
}
```

THRESHOLD uses a strict comparison: equality pauses. TIMEOUT persists its
deadline and lease metadata on `PipelineRun`; pending records and the approval
marker remain in the pipeline checkpoint.

## Common Configuration Types

### Throughput

Rate limiting and performance tuning.

```typescript
interface Throughput {
    /** Records per batch; integer from 1 to 10,000 */
    batchSize?: number;

    /** Parallel batch processing; integer from 1 to 16 */
    concurrency?: number;

    /** Aggregate load-batch starts per second; finite from 0 to 1,000 */
    rateLimitRps?: number;

    /** Behavior when the rolling failed-record ratio reaches the threshold */
    drainStrategy?: 'BACKOFF' | 'SHED' | 'QUEUE';

    /** Pause on high error rate */
    pauseOnErrorRate?: {
        /** Error rate threshold (0-1) */
        threshold: number;
        /** 0.1-3,600 seconds; defaults to 1 for BACKOFF and 5 for QUEUE */
        intervalSec?: number;
    };
}
```

Throughput applies to load-batch execution. It does not rate-limit extractors.
The error threshold must be greater than `0` and at most `1`. When supplied,
`intervalSec` must be a finite value from `0.1` to `3,600`.

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
    ON_RETRY?: HookAction[];
    ON_DEAD_LETTER?: HookAction[];

    // Data-stage hooks (before/after each supported step type)
    BEFORE_EXTRACT?: HookAction[];
    AFTER_EXTRACT?: HookAction[];
    BEFORE_TRANSFORM?: HookAction[];
    AFTER_TRANSFORM?: HookAction[];
    BEFORE_VALIDATE?: HookAction[];
    AFTER_VALIDATE?: HookAction[];
    BEFORE_ENRICH?: HookAction[];
    AFTER_ENRICH?: HookAction[];
    BEFORE_ROUTE?: HookAction[];
    AFTER_ROUTE?: HookAction[];
    BEFORE_LOAD?: HookAction[];
    AFTER_LOAD?: HookAction[];
    BEFORE_EXPORT?: HookAction[];
    AFTER_EXPORT?: HookAction[];
    BEFORE_FEED?: HookAction[];
    AFTER_FEED?: HookAction[];
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

interface HookActionBase {
    type: HookActionType;
    name?: string;
    failOnError?: boolean;
}

interface InterceptorHookAction extends HookActionBase {
    type: 'INTERCEPTOR';
    /** JavaScript code to transform records */
    code: string;
    timeout?: number;
}

interface ScriptHookAction extends HookActionBase {
    type: 'SCRIPT';
    /** Pre-registered script function name */
    scriptName: string;
    /** Arguments to pass to script */
    args?: JsonObject;
    timeout?: number;
}

interface WebhookHookAction extends HookActionBase {
    type: 'WEBHOOK';
    /** Webhook URL */
    url: string;
    /** Request headers */
    headers?: Record<string, string>;
    /** Secret used to sign the body */
    secretCode?: string;
    /** Header names mapped to Secret Codes */
    headerSecretCodes?: Record<string, string>;
    signatureHeader?: string;
    /** Retry configuration */
    retryConfig?: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
}

interface EmitHookAction extends HookActionBase {
    type: 'EMIT';
    /** Event name to emit */
    event: string;
}

interface TriggerPipelineHookAction extends HookActionBase {
    type: 'TRIGGER_PIPELINE';
    /** Pipeline code to trigger */
    pipelineCode: string;
    /** Trigger step that receives the hook records */
    triggerKey: string;
}

interface LogHookAction extends HookActionBase {
    type: 'LOG';
    /** Log level */
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    /** Log message */
    message: string;
}
```

`INTERCEPTOR` and `SCRIPT` are valid only on the 18 data stages. Full validation
also verifies registered scripts, referenced child pipelines, runnable child
trigger routes, resources, and action-specific fields; unresolved references
block publication.

## Operator Types

See [Operators Reference](./operators.md) for the complete list of 62 built-in operators and their configurations.

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
{ op: 'round', args: { source: 'price', decimals: 2, target: 'price' } }

// Date operations
{ op: 'dateParse', args: { source: 'created_at', format: 'YYYY-MM-DD', target: 'createdDate' } }
{ op: 'dateFormat', args: { source: 'date', format: 'MM/DD/YYYY', target: 'formattedDate' } }

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
        throughput: {
            batchSize: 100,
            concurrency: 4,
            rateLimitRps: 10,
        },
        errorHandling: {
            maxRetries: 3,
            retryDelayMs: 1000,
            backoffMultiplier: 2,
        },
    })

    // Capabilities
    .capabilities({
        writes: ['CATALOG'],
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
            code: 'return records.map(r => ({ ...r, _importedAtEpochMs: Date.now() }));',
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
        slugField: 'slug',
        conflictStrategy: 'SOURCE_WINS',
    })

    .load('upsert-standard', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        slugField: 'slug',
        conflictStrategy: 'MERGE',
    })

    .sink('index-search', {
        adapterCode: 'meilisearch',
        indexName: 'products',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        primaryKey: 'id',
        batchSize: 500,
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
- [Operators Reference](./operators.md) - All 62 built-in operators
- [DSL Examples](./examples.md) - Real-world pipeline examples
- [Architecture Overview](../architecture.md) - Understanding the execution model
