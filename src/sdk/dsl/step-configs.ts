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

import { JsonObject, JsonValue, Throughput } from '../../types/index';
import type { OperatorConfig } from '../../types/step-configs';
import { LoadStrategy, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue, TriggerType, FeedFormat, FeedType, SinkType } from '../types/index';
import { RouteOperator } from '../constants';
import { ConnectionAuthType } from '../../constants/enums';

// TRIGGER CONFIG

/**
 * Trigger configuration interface
 *
 * FIELD NAMES:
 * - `cron`: Cron expression for schedule triggers
 * - `webhookCode`: Code for webhook lookup (backend)
 * - `path`: Webhook path/endpoint (UI display, same as webhookPath)
 */
export interface TriggerConfig {
    type: TriggerType;
    // Webhook specific
    /** Webhook path (UI display) */
    path?: string;
    /** Webhook code (backend reference) */
    webhookCode?: string;
    signature?: 'none' | 'hmac-sha256';
    idempotencyKey?: string;
    // Schedule specific
    /** Cron expression (5 fields: minute hour day month weekday) */
    cron?: string;
    /** Timezone for schedule evaluation */
    timezone?: string;
    // Event specific
    event?: string;
    filter?: JsonObject;
    // File specific
    source?: 's3' | 'fs' | 'sftp';
    pattern?: string;
    // Message specific
    topic?: string;
    subscription?: string;
    // Allow custom properties
    [key: string]: unknown;
}

// EXTRACT STEP CONFIG

export interface ExtractStepConfig {
    adapterCode: string;
    // REST extractor
    url?: string;
    endpoint?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    query?: JsonObject;
    body?: JsonObject;
    pagination?: JsonObject;
    pageParam?: string;
    itemsField?: string;
    nextPageField?: string;
    maxPages?: number;
    // CSV extractor
    csvText?: string;
    csvPath?: string;
    delimiter?: string;
    hasHeader?: boolean;
    rows?: JsonValue[];
    // GraphQL extractor
    graphqlQuery?: string;
    variables?: JsonObject;
    // Generator extractor (custom)
    count?: number;
    template?: JsonObject;
    // Common options
    connectionCode?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    mapFields?: Record<string, string>;
    throughput?: Throughput;
    async?: boolean;
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
    /** Validation mode: STRICT requires all rules to pass, LENIENT allows warnings */
    validationMode?: 'STRICT' | 'LENIENT';
    /** Validation rules to apply */
    rules?: ValidationRuleConfig[];
    /** Reference to a schema for schema-based validation */
    schemaRef?: SchemaRefConfig;
    /** Throughput configuration */
    throughput?: Throughput;
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
    /** Minimum value for numbers */
    min?: number;
    /** Maximum value for numbers */
    max?: number;
    /** Regex pattern for string validation */
    pattern?: string;
    /** Custom error message */
    error?: string;
    /** Additional validation parameters */
    [key: string]: unknown;
}

export interface SchemaRefConfig {
    schemaId: string;
    version: string;
    compatibility?: 'strict' | 'backward' | 'permissive';
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
    /** HTTP endpoint URL for HTTP source type */
    endpoint?: string;
    /** Field to match for lookups */
    matchField?: string;
    /** Vendure entity type for VENDURE source type */
    entity?: string;
    /** Additional adapter config */
    config?: JsonObject;
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
    matchField?: string;
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

import { ExportFormatType } from '../../constants/enums';
type ExportTarget = 'file' | 'api' | 'webhook' | 's3' | 'sftp' | 'email';

export interface ExportStepConfig {
    adapterCode: string;
    // Target settings
    target?: ExportTarget;
    format?: ExportFormatType;
    // File output
    path?: string;
    filename?: string;
    filenamePattern?: string;
    compress?: boolean | 'gzip' | 'zip';
    // API/Webhook output
    endpoint?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    // S3 output
    bucket?: string;
    region?: string;
    prefix?: string;
    // SFTP output
    host?: string;
    port?: number;
    username?: string;
    passwordSecretCode?: string;
    remotePath?: string;
    // Email output
    to?: string | string[];
    subject?: string;
    attachFilename?: string;
    // CSV options
    delimiter?: string;
    includeHeader?: boolean;
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
    salePriceField?: string;
    imageField?: string;
    linkField?: string;
    brandField?: string;
    gtinField?: string;
    mpnField?: string;
    categoryField?: string;
    availabilityField?: string;
    conditionField?: string;
    // Custom fields for custom feed type
    customFields?: Record<string, string>;
    // Scheduling (for hosted feeds)
    refreshIntervalMinutes?: number;
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
    sinkType?: SinkType;
    // Connection
    host?: string;
    hosts?: string[];
    port?: number;
    protocol?: 'http' | 'https';
    // Index settings
    indexName: string;
    indexPrefix?: string;
    // Elasticsearch/OpenSearch specific
    pipeline?: string;
    refresh?: boolean | 'wait_for';
    // Algolia specific
    applicationId?: string;
    // Meilisearch specific
    primaryKey?: string;
    // Typesense specific
    collectionName?: string;
    // Document settings
    idField?: string;
    routing?: string;
    // Bulk options
    bulkSize?: number;
    flushIntervalMs?: number;
    // Field handling
    fields?: string[];
    excludeFields?: string[];
    fieldMapping?: Record<string, string>;
    // Actions
    deleteOnMissing?: boolean;
    upsert?: boolean;
    // Secrets
    connectionCode?: string;
    apiKeySecretCode?: string;
    basicSecretCode?: string;
    // Additional config
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
}
