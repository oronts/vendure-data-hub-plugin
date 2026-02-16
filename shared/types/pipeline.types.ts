/**
 * Pipeline Types - Context, Options, Target, Source
 */

import { JsonObject, JsonValue } from './json.types';
import { Throughput, PipelineStepDefinition, PipelineEdge, PipelineCapabilities, ChannelStrategy, ValidationModeType } from './step.types';
import { FieldMapping } from './mapping.types';
import { FilterCondition } from './filter.types';
import { PipelineHooksConfig, PipelineHooks } from './hook.types';
import { TriggerConfig } from './trigger.types';

// PIPELINE TYPE ENUMS

/** Type of pipeline operation */
export type PipelineType = 'IMPORT' | 'EXPORT' | 'SYNC';

/** Operation to perform on target entities */
export type TargetOperation = 'CREATE' | 'UPDATE' | 'UPSERT' | 'MERGE' | 'DELETE';

/** Strategy for handling errors during pipeline execution */
export type ErrorStrategy = 'SKIP' | 'ABORT' | 'QUARANTINE' | 'RETRY';

/** Vendure entity types that can be imported/exported */
export type VendureEntityType =
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

/** Type of data source */
export type SourceType =
    | 'FILE_UPLOAD'
    | 'WEBHOOK'
    | 'HTTP_API'
    | 'FTP'
    | 'S3'
    | 'DATABASE'
    | 'CDC'
    | 'VENDURE_QUERY'
    | 'EVENT';

/** Supported file formats */
export type FileFormat = 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'TSV' | 'PARQUET';

/**
 * Type of export destination (canonical definition).
 *
 * @see src/constants/enums.ts — DESTINATION_TYPE runtime constant (subset, excludes 'DOWNLOAD')
 * @see src/services/destinations/destination.types.ts — DeliveryDestinationType (narrower subset for physical delivery)
 */
export type DestinationType = 'FILE' | 'DOWNLOAD' | 'S3' | 'FTP' | 'SFTP' | 'HTTP' | 'EMAIL' | 'WEBHOOK' | 'LOCAL';

/** Type of product feed for e-commerce platforms */
export type FeedType =
    | 'GOOGLE_SHOPPING'
    | 'META_CATALOG'
    | 'AMAZON'
    | 'PINTEREST'
    | 'TIKTOK'
    | 'BING_SHOPPING'
    | 'CSV'
    | 'JSON'
    | 'XML'
    | 'CUSTOM';

// CONTEXT TYPES

/** Policy for handling late-arriving events (internal, used by PipelineContext) */
type LateEventPolicyType = 'DROP' | 'BUFFER';

interface LateEventPolicy {
    policy: LateEventPolicyType;
    bufferMs?: number;
}

/**
 * Configuration for error handling and retry behavior
 */
export interface ErrorHandlingConfig {
    /** Maximum number of retry attempts */
    maxRetries?: number;
    /** Initial delay between retries in milliseconds */
    retryDelayMs?: number;
    /** Maximum delay between retries in milliseconds */
    maxRetryDelayMs?: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier?: number;
    /** Whether to use a dead letter queue for failed records */
    deadLetterQueue?: boolean;
    /** Whether to send alerts when records go to dead letter queue */
    alertOnDeadLetter?: boolean;
    /** Error percentage threshold that triggers alerts/pauses */
    errorThresholdPercent?: number;
}

/** Strategy for creating checkpoints */
export type CheckpointStrategy = 'COUNT' | 'TIMESTAMP' | 'INTERVAL';

/**
 * Configuration for pipeline checkpointing (resumable execution)
 */
export interface CheckpointingConfig {
    /** Whether checkpointing is enabled */
    enabled?: boolean;
    /** Strategy for creating checkpoints */
    strategy?: CheckpointStrategy;
    /** Create checkpoint every N records (for COUNT strategy) */
    intervalRecords?: number;
    /** Create checkpoint every N milliseconds (for INTERVAL strategy) */
    intervalMs?: number;
    /** Field to use for TIMESTAMP strategy */
    field?: string;
}

/**
 * These types match the enum values in src/constants/enums.ts
 */

/** Execution mode for the pipeline */
export type RunModeValue = 'SYNC' | 'ASYNC' | 'BATCH' | 'STREAM';

/** Strategy for handling multilingual content */
export type LanguageStrategyValue = 'SPECIFIC' | 'FALLBACK' | 'MULTI';

/** Strategy for handling conflicts between source and existing data */
export type ConflictStrategyValue = 'SOURCE_WINS' | 'VENDURE_WINS' | 'MERGE' | 'MANUAL_QUEUE';

/**
 * Parallel execution configuration for graph-based pipelines
 */
export interface ParallelExecutionConfig {
    /** Enable parallel step execution (default: false for sequential) */
    enabled?: boolean;
    /** Maximum concurrent steps (default: 4) */
    maxConcurrentSteps?: number;
    /**
     * Error handling policy for parallel execution:
     * - 'FAIL_FAST': Stop all steps on first error (default)
     * - 'CONTINUE': Continue other parallel steps, fail at end
     * - 'BEST_EFFORT': Continue all steps, collect all errors
     */
    errorPolicy?: 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT';
}

/**
 * Execution context for a pipeline run
 */
export interface PipelineContext {
    /** Default channel code */
    channel?: string;
    /** Default language code for content */
    contentLanguage?: string;
    /** Strategy for handling channels */
    channelStrategy?: ChannelStrategy;
    /** Specific channel IDs to operate on */
    channelIds?: string[];
    /** Validation mode */
    validationMode?: ValidationModeType;
    /** Field to use as idempotency key */
    idempotencyKeyField?: string;
    /** Execution mode */
    runMode?: RunModeValue;
    /** Throughput/rate limiting configuration */
    throughput?: Throughput;
    /** Policy for late events in streaming mode */
    lateEvents?: LateEventPolicy;
    /** Watermark for event time processing in milliseconds */
    watermarkMs?: number;
    /** Error handling configuration */
    errorHandling?: ErrorHandlingConfig;
    /** Checkpointing configuration */
    checkpointing?: CheckpointingConfig;
    /**
     * Parallel execution configuration for graph-based pipelines
     * When enabled, independent steps run concurrently
     */
    parallelExecution?: ParallelExecutionConfig;
}

/**
 * Checkpoint data stored for resumable pipeline execution
 */
export interface PipelineCheckpoint extends JsonObject {}

/**
 * Checkpoint data organized by step key
 */
export interface CheckpointData {
    /** Checkpoint data for each step */
    [stepKey: string]: Record<string, JsonValue>;
}

/**
 * Context for pipeline executor with checkpoint management
 */
export interface ExecutorContext {
    /** Current checkpoint data */
    cpData: CheckpointData | null;
    /** Whether checkpoint data has been modified */
    cpDirty: boolean;
    /** Mark checkpoint as needing to be saved */
    markCheckpointDirty: () => void;
}

// OPTIONS TYPES

/**
 * Options for pipeline execution behavior
 */
export interface PipelineOptions {
    /** Number of records to process per batch */
    batchSize?: number;
    /** Strategy when errors occur */
    onError?: ErrorStrategy;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Delay between retries in milliseconds */
    retryDelayMs?: number;
    /** Run without making actual changes */
    dryRun?: boolean;
    /** Validate records against schema before loading */
    validateWithSchema?: boolean;
    /** Publish changes immediately (for draft entities) */
    publishChanges?: boolean;
    /** Skip duplicate records instead of updating */
    skipDuplicates?: boolean;
    /** Only update these fields when record exists */
    updateOnlyFields?: string[];
    /** Only set these fields when creating new records */
    createOnlyFields?: string[];
    /** Rate limiting configuration */
    rateLimit?: {
        /** Maximum records per second */
        recordsPerSecond?: number;
        /** Maximum concurrent operations */
        maxConcurrent?: number;
    };
    /** Notification configuration */
    notifications?: {
        /** Send notification on completion */
        onComplete?: boolean;
        /** Send notification on error */
        onError?: boolean;
        /** Webhook URL for notifications */
        webhookUrl?: string;
        /** Email addresses for notifications */
        emailTo?: string[];
    };
}

// TARGET TYPES

export interface ExportFormatConfig {
    format: FileFormat;
    baseUrl?: string;
    currency?: string;
    utmParams?: Record<string, string>;
    csv?: {
        delimiter?: string;
        includeHeader?: boolean;
        quoteAll?: boolean;
    };
    xml?: {
        rootElement?: string;
        recordElement?: string;
        declaration?: boolean;
        prettyPrint?: boolean;
    };
    json?: {
        prettyPrint?: boolean;
        wrapInArray?: boolean;
    };
}

interface TargetConfig {
    entity?: VendureEntityType;
    operation?: TargetOperation;
    lookupFields?: string[];
    channelCodes?: string[];
    destination?: DestinationType;
    connectionCode?: string;
    format?: ExportFormatConfig;
    feedType?: FeedType;
}

// SOURCE TYPES (internal, used by UnifiedPipelineDefinition)

export type CsvDelimiter = ',' | ';' | '\t' | '|';
export type FileEncoding = 'utf-8' | 'utf-16' | 'iso-8859-1' | 'windows-1252';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type CsvQuote = '"' | "'";
type CsvEscape = '\\' | '"';

interface CsvFormatOptions {
    delimiter?: CsvDelimiter;
    quote?: CsvQuote;
    escape?: CsvEscape;
    encoding?: FileEncoding;
    headerRow?: boolean;
    skipRows?: number;
    trimWhitespace?: boolean;
}

interface JsonFormatOptions {
    recordsPath?: string;
    flatten?: boolean;
}

interface XmlFormatOptions {
    recordPath?: string;
    attributePrefix?: string;
}

interface XlsxFormatOptions {
    sheet?: string | number;
    range?: string;
    headerRow?: boolean;
}

interface FileFormatConfig {
    format: FileFormat;
    csv?: CsvFormatOptions;
    json?: JsonFormatOptions;
    xml?: XmlFormatOptions;
    xlsx?: XlsxFormatOptions;
}

type WebhookAuthMode = 'NONE' | 'API_KEY' | 'HMAC' | 'JWT' | 'BASIC';
type WebhookResponseMode = 'SYNC' | 'ASYNC';
type PaginationTypeValue = 'NONE' | 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK_HEADER';

interface FileUploadSourceConfig {
    type: 'FILE_UPLOAD';
    maxSize?: number;
    allowedExtensions?: string[];
}

interface WebhookSourceConfig {
    type: 'WEBHOOK';
    authentication?: WebhookAuthMode;
    secretCode?: string;
    idempotencyKeyField?: string;
    responseMode?: WebhookResponseMode;
}

interface HttpApiSourceConfig {
    type: 'HTTP_API';
    method?: HttpMethod;
    path?: string;
    headers?: Record<string, string>;
    body?: JsonObject;
    pagination?: {
        type: PaginationTypeValue;
        pageParam?: string;
        limitParam?: string;
        limit?: number;
        cursorPath?: string;
        hasMorePath?: string;
        dataPath?: string;
    };
    rateLimit?: {
        requestsPerSecond?: number;
        maxConcurrent?: number;
    };
}

interface FtpSourceConfig {
    type: 'FTP';
    remotePath: string;
    filePattern?: string;
    deleteAfterProcess?: boolean;
    archivePath?: string;
}

interface S3SourceConfig {
    type: 'S3';
    bucket?: string;
    key?: string;
    pattern?: string;
    deleteAfterProcess?: boolean;
}

interface DatabaseSourceConfig {
    type: 'DATABASE';
    query: string;
    incrementalColumn?: string;
    batchSize?: number;
}

interface VendureQuerySourceConfig {
    type: 'VENDURE_QUERY';
    entity: VendureEntityType;
    filters?: FilterCondition[];
    includeFields?: string[];
    excludeFields?: string[];
    channelCodes?: string[];
    languageCode?: string;
    relations?: string[];
}

interface EventSourceConfig {
    type: 'EVENT';
    eventType: string;
    filter?: string;
}

type SourceTypeConfig =
    | FileUploadSourceConfig
    | WebhookSourceConfig
    | HttpApiSourceConfig
    | FtpSourceConfig
    | S3SourceConfig
    | DatabaseSourceConfig
    | VendureQuerySourceConfig
    | EventSourceConfig;

interface SourceConfig {
    type: SourceType;
    connectionCode?: string;
    format?: FileFormatConfig;
    config: SourceTypeConfig;
}

// PIPELINE DEFINITIONS

/**
 * Unified pipeline definition (simplified format for UI)
 */
export interface UnifiedPipelineDefinition {
    /** Schema version (always 1) */
    version: 1;
    /** Type of pipeline */
    type: PipelineType;
    /** Source configuration */
    source: SourceConfig;
    /** Target configuration */
    target: TargetConfig;
    /** Field mappings */
    mappings: FieldMapping[];
    /** Filter conditions */
    filters?: FilterCondition[];
    /** Pipeline options */
    options: PipelineOptions;
    /** Trigger configurations */
    triggers?: TriggerConfig[];
    /** Hook configurations */
    hooks?: PipelineHooksConfig;
    /** Schema code for validation */
    schemaCode?: string;
}

/**
 * Full pipeline definition (DAG-based format)
 */
export interface PipelineDefinition {
    /** Schema version */
    version: number;
    /** Human-readable pipeline name (set via builder's .name() method) */
    name?: string;
    /** Human-readable pipeline description (set via builder's .description() method) */
    description?: string;
    /** Pipeline steps */
    steps: PipelineStepDefinition[];
    /** Pipeline codes this depends on */
    dependsOn?: string[];
    /** Pipeline capabilities declaration */
    capabilities?: PipelineCapabilities;
    /** Execution context */
    context?: PipelineContext;
    /** Edges connecting steps */
    edges?: PipelineEdge[];
    /** Hook configurations */
    hooks?: PipelineHooks;
}
