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
    | 'VENDURE_QUERY'
    | 'EVENT';

/** Supported file formats */
export type FileFormat = 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'TSV' | 'PARQUET';

/** Type of export destination */
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

/** Policy for handling late-arriving events */
export type LateEventPolicyType = 'DROP' | 'BUFFER';

/**
 * Configuration for handling late-arriving events in streaming pipelines
 */
export interface LateEventPolicy {
    /** How to handle late events */
    policy: LateEventPolicyType;
    /** Buffer duration in milliseconds for BUFFER policy */
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

// ChannelStrategyValue is canonical as ChannelStrategy in step.types.ts
export type ChannelStrategyValue = ChannelStrategy;

// ValidationModeValue is canonical as ValidationModeType in step.types.ts
export type ValidationModeValue = ValidationModeType;

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
    channelStrategy?: ChannelStrategyValue;
    /** Specific channel IDs to operate on */
    channelIds?: string[];
    /** Validation mode */
    validationMode?: ValidationModeValue;
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

/**
 * Context data passed to operators during execution
 */
export interface OperatorContextData {
    /** Pipeline execution context */
    pipelineContext: PipelineContext;
    /** Key of the current step */
    stepKey: string;
}

/**
 * Context data passed to loaders during execution
 */
export interface LoaderContextData extends OperatorContextData {
    /** Whether this is a dry run (no actual changes) */
    dryRun: boolean;
    /** Channel strategy to use */
    channelStrategy: ChannelStrategyValue;
    /** Channel codes to operate on */
    channels: readonly string[];
    /** Language strategy for translations */
    languageStrategy: LanguageStrategyValue;
    /** Validation mode */
    validationMode: ValidationModeValue;
    /** Conflict resolution strategy */
    conflictStrategy: ConflictStrategyValue;
}

/**
 * Context data passed to extractors during execution
 */
export interface ExtractorContextData {
    /** Key of the current step */
    stepKey: string;
    /** Checkpoint data for resumable extraction */
    checkpoint: PipelineCheckpoint;
    /** Function to update checkpoint data */
    setCheckpoint: (data: JsonObject) => void;
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

export interface TargetConfig {
    entity?: VendureEntityType;
    operation?: TargetOperation;
    lookupFields?: string[];
    channelCodes?: string[];
    destination?: DestinationType;
    connectionCode?: string;
    format?: ExportFormatConfig;
    feedType?: FeedType;
}

// SOURCE TYPES

export type CsvDelimiter = ',' | ';' | '\t' | '|';
export type CsvQuote = '"' | "'";
export type CsvEscape = '\\' | '"';
export type FileEncoding = 'utf-8' | 'utf-16' | 'iso-8859-1' | 'windows-1252';

export interface CsvFormatOptions {
    delimiter?: CsvDelimiter;
    quote?: CsvQuote;
    escape?: CsvEscape;
    encoding?: FileEncoding;
    headerRow?: boolean;
    skipRows?: number;
    trimWhitespace?: boolean;
}

export interface JsonFormatOptions {
    recordsPath?: string;
    flatten?: boolean;
}

export interface XmlFormatOptions {
    recordPath?: string;
    attributePrefix?: string;
}

export interface XlsxFormatOptions {
    sheet?: string | number;
    range?: string;
    headerRow?: boolean;
}

export interface FileFormatConfig {
    format: FileFormat;
    csv?: CsvFormatOptions;
    json?: JsonFormatOptions;
    xml?: XmlFormatOptions;
    xlsx?: XlsxFormatOptions;
}

export type WebhookAuthMode = 'NONE' | 'API_KEY' | 'HMAC' | 'JWT' | 'BASIC';
export type WebhookResponseMode = 'SYNC' | 'ASYNC';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type PaginationTypeValue = 'NONE' | 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK_HEADER';

export interface FileUploadSourceConfig {
    type: 'FILE_UPLOAD';
    maxSize?: number;
    allowedExtensions?: string[];
}

export interface WebhookSourceConfig {
    type: 'WEBHOOK';
    authentication?: WebhookAuthMode;
    secretCode?: string;
    idempotencyKeyField?: string;
    responseMode?: WebhookResponseMode;
}

export interface HttpApiSourceConfig {
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

export interface FtpSourceConfig {
    type: 'FTP';
    remotePath: string;
    filePattern?: string;
    deleteAfterProcess?: boolean;
    archivePath?: string;
}

export interface S3SourceConfig {
    type: 'S3';
    bucket?: string;
    key?: string;
    pattern?: string;
    deleteAfterProcess?: boolean;
}

export interface DatabaseSourceConfig {
    type: 'DATABASE';
    query: string;
    incrementalColumn?: string;
    batchSize?: number;
}

export interface VendureQuerySourceConfig {
    type: 'VENDURE_QUERY';
    entity: VendureEntityType;
    filters?: FilterCondition[];
    includeFields?: string[];
    excludeFields?: string[];
    channelCodes?: string[];
    languageCode?: string;
    relations?: string[];
}

export interface EventSourceConfig {
    type: 'EVENT';
    eventType: string;
    filter?: string;
}

export type SourceTypeConfig =
    | FileUploadSourceConfig
    | WebhookSourceConfig
    | HttpApiSourceConfig
    | FtpSourceConfig
    | S3SourceConfig
    | DatabaseSourceConfig
    | VendureQuerySourceConfig
    | EventSourceConfig;

export interface SourceConfig {
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
