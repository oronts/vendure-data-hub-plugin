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
import { LoadStrategy, ChannelStrategy, LanguageStrategy, ValidationMode, ConflictStrategy } from '../types/index';
import { RouteConditionOp } from './route-builder';

// TRIGGER CONFIG

export type TriggerType = 'manual' | 'webhook' | 'schedule' | 'event' | 'file' | 'message';

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
}

export interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

// VALIDATE STEP CONFIG

export interface ValidateStepConfig {
    mode?: 'fail-fast' | 'accumulate';
    rules?: ValidationRuleConfig[];
    schemaRef?: SchemaRefConfig;
    throughput?: Throughput;
}

export interface ValidationRuleConfig {
    type: 'schema' | 'business' | 'ref';
    spec: JsonObject;
}

export interface SchemaRefConfig {
    schemaId: string;
    version: string;
    compatibility?: 'strict' | 'backward' | 'permissive';
}

// ENRICH STEP CONFIG

export interface EnrichStepConfig {
    adapterCode: string;
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
    cmp: RouteConditionOp;
    value: JsonValue;
}

// LOAD STEP CONFIG

export interface LoadStepConfig {
    adapterCode: string;
    strategy?: LoadStrategy;
    channel?: string;
    channelStrategy?: ChannelStrategy;
    channels?: string[];
    languageStrategy?: LanguageStrategy;
    validationMode?: ValidationMode;
    conflictStrategy?: ConflictStrategy;
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
    auth?: 'none' | 'bearer' | 'basic' | 'hmac';
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

export type ExportFormat = 'csv' | 'json' | 'xml' | 'xlsx' | 'ndjson';
export type ExportTarget = 'file' | 'api' | 'webhook' | 's3' | 'sftp' | 'email';

export interface ExportStepConfig {
    adapterCode: string;
    // Target settings
    target?: ExportTarget;
    format?: ExportFormat;
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

export type FeedFormat = 'xml' | 'csv' | 'tsv' | 'json' | 'jsonl';
export type FeedType = 'google-merchant' | 'meta-catalog' | 'amazon' | 'pinterest' | 'bing' | 'custom';

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

// SINK STEP CONFIG

export type SinkType = 'elasticsearch' | 'opensearch' | 'meilisearch' | 'algolia' | 'typesense' | 'custom';

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
