/**
 * Step Configuration Types
 *
 * CANONICAL FIELD NAMES:
 * ======================
 * - `cron` - Cron expression for schedule triggers
 * - `strategy` - Load strategy (create, update, upsert, merge)
 * - `adapterCode` - Adapter identifier for steps
 * - `cmp` - Comparison operator for conditions
 *
 * See src/types/shared/index.ts for the full list of canonical field names.
 */

import {
    JsonObject,
    JsonValue,
    PipelineTrigger,
    SchemaReference,
    Throughput,
} from '../../types/index';
import type { OperatorConfig } from '../../types/step-configs';
import { LoadStrategy, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue, FeedFormat, FeedType } from '../types/index';
import { RouteOperator } from '../constants';
import { ConnectionAuthType, ExportFormatType } from '../../constants/enums';

// TRIGGER CONFIG

/** Canonical trigger contract shared with validation and runtime discovery. */
export type TriggerConfig = PipelineTrigger;

// EXTRACT STEP CONFIG

export interface ExtractStepConfig {
    adapterCode: string;
    // REST extractor
    url?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    query?: JsonObject | string;
    body?: JsonObject;
    pagination?: JsonObject;
    dataPath?: string;
    // Uploaded or inline file extractors
    fileId?: string;
    csvText?: string;
    jsonText?: string;
    xmlText?: string;
    itemsPath?: string;
    recordPath?: string;
    attributePrefix?: string;
    sheetName?: string | number;
    delimiter?: string;
    hasHeader?: boolean;
    rows?: JsonValue[];
    // GraphQL extractor
    variables?: JsonObject;
    // Generator extractor (custom)
    count?: number;
    template?: JsonObject;
    // Vendure Query options
    entity?: string;
    relations?: string[];
    flattenTranslations?: boolean;
    languageCode?: string;
    includeFields?: string[];
    excludeFields?: string[];
    // Common options
    connectionCode?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    mapFields?: Record<string, string>;
    throughput?: Throughput;
    async?: boolean;
    /** Validate extracted records against this immutable registry version. */
    schemaRef?: SchemaReference;
    // Allow custom properties
    [key: string]: unknown;
}

// TRANSFORM STEP CONFIG

export interface TransformStepConfig {
    operators: OperatorConfig[];
    throughput?: Throughput;
    async?: boolean;
    /** Per-record retry configuration for transform operators */
    retryPerRecord?: {
        maxRetries: number;
        retryDelayMs?: number;
        backoff?: 'FIXED' | 'EXPONENTIAL';
        retryableErrors?: string[];
    };
}

export type { OperatorConfig };

// VALIDATE STEP CONFIG

export interface ValidateStepConfig {
    /** Error handling mode: FAIL_FAST stops on first error, ACCUMULATE collects all errors */
    errorHandlingMode?: 'FAIL_FAST' | 'ACCUMULATE';
    /** Validation rules to apply */
    rules?: ValidationRuleConfig[];
    /** Throughput configuration */
    throughput?: Throughput;
    /** Use a named registry schema instead of or alongside inline rules. */
    schemaRef?: SchemaReference;
}

export interface ValidationRuleConfig {
    /** Rule type: schema for JSON schema, business for field rules, ref for external reference */
    type: 'schema' | 'business' | 'ref';
    /** Rule specification */
    spec: ValidationRuleSpec;
}

export interface ValidationRuleSpec {
    /** Field to validate (supports dot notation for nested fields) */
    field: string;
    /** Whether the field is required */
    required?: boolean;
    /** Primitive value type */
    type?: 'string' | 'number' | 'boolean';
    /** Minimum value for numbers */
    min?: number;
    /** Maximum value for numbers */
    max?: number;
    /** Minimum string length */
    minLength?: number;
    /** Maximum string length */
    maxLength?: number;
    /** Regex pattern for string validation */
    pattern?: string;
    /** Allowed values */
    enum?: JsonValue[];
    /** Custom error message */
    error?: string;
}

// ENRICH STEP CONFIG

export interface EnrichStepConfig {
    /** Custom enricher adapter code (optional if using built-in enrichment) */
    adapterCode?: string;
    /** Static default values to add to records (only if field is missing) */
    defaults?: Record<string, JsonValue>;
    /** Values to always set on records (overwrites existing) */
    set?: Record<string, JsonValue>;
    /** Computed field expressions using ${field} template syntax */
    computed?: Record<string, string>;
    /** Enrichment source type */
    sourceType?: 'STATIC' | 'HTTP' | 'VENDURE';

    // ── HTTP enrichment ─────────────────────────────────────────────────
    /** HTTP endpoint URL. Use {{field.path}} for dynamic values. */
    url?: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST';
    /** Record field to use as the lookup cache key */
    keyField?: string;
    /** Field name to store enrichment result on each record (default: 'enrichment') */
    target?: string;
    /** JSON path to extract from HTTP response (e.g. 'data.items') */
    responsePath?: string;
    /** Cache TTL in seconds */
    cacheTtlSec?: number;
    /** Skip enrichment on 404 instead of failing */
    skipOn404?: boolean;
    /** Fail the entire step on HTTP error */
    failOnError?: boolean;
    /** Secret code for Bearer token authentication */
    bearerTokenSecretCode?: string;
    /** Secret code for API key authentication */
    apiKeySecretCode?: string;
    /** Header name for API key (default: X-Api-Key) */
    apiKeyHeader?: string;
    /** Secret code for Basic auth */
    basicAuthSecretCode?: string;
    /** Custom request headers */
    headers?: Record<string, string>;
    /** Request body for POST method */
    body?: JsonValue;
    /** Field to use as request body */
    bodyField?: string;
    /** Max retry attempts */
    maxRetries?: number;
    /** Batch size for parallel lookups */
    batchSize?: number;
    /** Rate limit (requests per second) */
    rateLimitPerSecond?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Default value if enrichment returns nothing */
    default?: JsonValue;

    // ── VENDURE enrichment ──────────────────────────────────────────────
    /** Vendure entity type (e.g. 'PRODUCT_VARIANT') */
    entityType?: string;
    /** Record field to look up */
    sourceField?: string;
    /** Vendure entity field to match against */
    lookupField?: string;
    /** Specific entity fields to copy into the record */
    targetFields?: Record<string, string>;

    /** Additional adapter config */
    config?: JsonObject;
    [key: string]: unknown;
}

// ROUTE STEP CONFIG

export interface RouteStepConfig {
    branches: RouteBranchConfig[];
    defaultTo?: string;
}

export interface RouteBranchConfig {
    name: string;
    when: RouteConditionConfig[];
}

export interface RouteConditionConfig {
    field: string;
    cmp: RouteOperator;
    value: JsonValue;
}

// LOAD STEP CONFIG

export interface LoadStepConfig {
    adapterCode: string;
    strategy?: LoadStrategy;
    channel?: string;
    channelStrategy?: ChannelStrategy;
    channels?: string[];
    languageStrategy?: LanguageStrategyValue;
    validationMode?: ValidationModeType;
    conflictStrategy?: ConflictStrategyValue;
    nameField?: string;
    slugField?: string;
    descriptionField?: string;
    skuField?: string;
    priceField?: string;
    emailField?: string;
    firstNameField?: string;
    lastNameField?: string;
    phoneNumberField?: string;
    customerGroupField?: string;
    codeField?: string;
    parentField?: string;
    positionField?: string;
    stockField?: string;
    stockOnHandField?: string;
    stockAllocatedField?: string;
    stockLocationField?: string;
    urlField?: string;
    enabledField?: string;
    // Console loader
    prefix?: string;
    // REST POST loader properties
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    auth?: ConnectionAuthType;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    hmacHeader?: string;
    batchMode?: 'single' | 'array' | 'batch';
    maxBatchSize?: number;
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    // Common
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
    // Allow custom properties
    [key: string]: unknown;
}

// EXPORT STEP CONFIG

type ExportDestinationType = 'LOCAL' | 'HTTP' | 'S3' | 'SFTP' | 'FTP' | 'EMAIL';

export interface ExportStepConfig {
    adapterCode: string;
    // Destination settings
    destinationType?: ExportDestinationType;
    format?: ExportFormatType;
    // File output
    path?: string;
    filenamePattern?: string;
    compress?: boolean | 'gzip' | 'zip';
    // HTTP output
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    /** Non-sensitive static headers. Credentials must use auth or headerSecretCodes. */
    headers?: Record<string, string>;
    /** Maps HTTP header names to Data Hub Secret Codes. */
    headerSecretCodes?: Record<string, string>;
    auth?: {
        type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
    };
    // S3 output
    bucket?: string;
    region?: string;
    prefix?: string;
    accessKeyIdSecretCode?: string;
    secretAccessKeySecretCode?: string;
    acl?: 'private' | 'public-read';
    // SFTP output
    host?: string;
    port?: number;
    username?: string;
    passwordSecretCode?: string;
    privateKeySecretCode?: string;
    passphraseSecretCode?: string;
    hostKeyFingerprintSecretCode?: string;
    remotePath?: string;
    // Email output
    to?: string | string[];
    subject?: string;
    attachFilename?: string;
    smtp?: {
        host: string;
        port: number;
        secure?: boolean;
        username?: string;
        usernameSecretCode?: string;
        passwordSecretCode?: string;
    };
    // CSV options
    delimiter?: string;
    includeHeader?: boolean;
    formulaMode?: 'SPREADSHEET_SAFE' | 'PRESERVE';
    quoteStrings?: boolean;
    // XML options
    rootElement?: string;
    itemElement?: string;
    declaration?: boolean;
    // JSON options
    wrapInObject?: string;
    // Field selection
    fields?: string[];
    excludeFields?: string[];
    fieldMapping?: Record<string, string>;
    // Batching
    batchSize?: number;
    maxRecordsPerFile?: number;
    // Localization
    languageCode?: string;
    translationsField?: string;
    channelCode?: string;
    channelField?: string;
    // Secrets
    connectionCode?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    // Additional config
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
    // Allow custom properties
    [key: string]: unknown;
}

// FEED STEP CONFIG

// FeedFormat and FeedType are imported from ../types/index (canonical: src/sdk/types/adapter-types.ts)

export interface FeedStepConfig {
    adapterCode: string;
    feedType?: FeedType;
    format?: FeedFormat;
    // Output destination
    outputPath?: string;
    outputUrl?: string;
    bucket?: string;
    prefix?: string;
    // Google Merchant specific
    merchantId?: string;
    targetCountry?: string;
    contentLanguage?: string;
    currency?: string;
    storeUrl?: string;
    storeName?: string;
    // Meta Catalog specific
    catalogId?: string;
    businessId?: string;
    // Amazon specific
    sellerId?: string;
    marketplaceId?: string;
    // Feed generation options
    includeVariants?: boolean;
    includeOutOfStock?: boolean;
    priceIncludesTax?: boolean;
    channelCode?: string;
    // Field mappings (source -> feed field)
    titleField?: string;
    descriptionField?: string;
    priceField?: string;
    /** Unit stored in priceField; built-in feeds default to Vendure-native minor units. */
    priceUnit?: 'MINOR' | 'MAJOR';
    salePriceField?: string;
    imageField?: string;
    linkField?: string;
    brandField?: string;
    gtinField?: string;
    mpnField?: string;
    categoryField?: string;
    availabilityField?: string;
    conditionField?: string;
    /** Custom feed output field to source record path mapping. */
    fieldMapping?: Record<string, string>;
    // Scheduling (for hosted feeds)
    refreshIntervalMinutes?: number;
    // Localization
    languageCode?: string;
    translationsField?: string;
    channelField?: string;
    // Secrets
    connectionCode?: string;
    apiKeySecretCode?: string;
    // Additional config
    config?: JsonObject;
    throughput?: Throughput;
}

// GATE STEP CONFIG

export interface GateStepConfig {
    /** Approval type: MANUAL requires human approval, THRESHOLD auto-approves below error rate, TIMEOUT auto-approves after delay */
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';
    /** Timeout in seconds for TIMEOUT approval type */
    timeoutSeconds?: number;
    /** Error rate threshold (0-100) for THRESHOLD approval type */
    errorThresholdPercent?: number;
    /** Webhook URL to notify when gate is reached */
    notifyWebhook?: string;
    /** Email address to notify when gate is reached */
    notifyEmail?: string;
    /** Number of preview records to include in the gate result (default: 10) */
    previewCount?: number;
}

// SINK STEP CONFIG

// SinkType is imported from ../types/index (canonical: src/sdk/types/adapter-types.ts)

export interface SinkStepConfig {
    adapterCode: string;

    defaultOperation?: 'UPSERT' | 'DELETE';
    // Search service connection
    host?: string;
    /** Elasticsearch/OpenSearch node URL (e.g., http://localhost:9200) */
    node?: string;
    port?: number;
    protocol?: 'http' | 'https';
    // Search index settings
    indexName?: string;
    // Algolia specific
    appId?: string;
    // Meilisearch specific
    primaryKey?: string;
    searchableFields?: string[];
    filterableFields?: string[];
    sortableFields?: string[];
    // Typesense specific
    collectionName?: string;
    // Document settings
    idField?: string;
    // Bulk options
    batchSize?: number;
    // Field handling
    fields?: string[];
    excludeFields?: string[];
    // Localization
    languageCode?: string;
    translationsField?: string;
    channelCode?: string;
    channelField?: string;
    // Secrets
    connectionCode?: string;
    apiKeySecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
    // Message queue sinks
    queueType?: 'RABBITMQ' | 'RABBITMQ_AMQP' | 'SQS' | 'REDIS_STREAMS';
    queueName?: string;
    routingKey?: string;
    headers?: Record<string, string>;
    persistent?: boolean;
    priority?: number;
    ttlMs?: number;
    // Webhook sinks
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    bearerTokenSecretCode?: string;
    apiKeyHeader?: string;
    hmacSecretCode?: string;
    signatureHeaderName?: string;
    timeoutMs?: number;
    retries?: number;
    // Additional config
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
}
