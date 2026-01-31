/**
 * Adapter Types - SDK types for adapter definitions and configurations
 *
 * Adapters are the building blocks of data pipelines. This module defines
 * the base adapter interface and all specific adapter types (extractors,
 * operators, loaders, validators, enrichers, exporters, feeds, sinks).
 *
 * @module sdk/types/adapter-types
 */

import { RequestContext, ID } from '@vendure/core';
import { JsonObject, JsonValue, PipelineCheckpoint, PipelineContext as PipelineCtx } from '../../types/index';
import { StepConfigSchema } from './schema-types';
import { SecretResolver, ConnectionResolver, AdapterLogger } from './connection-types';
import {
    ExtractResult,
    LoadResult,
    ValidationResult,
    EnrichResult,
    ExportResult,
    FeedResult,
    SinkResult,
    OperatorResult,
} from './result-types';
import { OperatorHelpers } from './transform-types';
import {
    ExportFormatType,
    AdapterType as AdapterTypeEnum,
    AdapterCategory as AdapterCategoryEnum,
    TriggerType as TriggerTypeEnum,
} from '../../constants/enums';

/**
 * Primary adapter type classification
 * @see AdapterType enum in constants/enums.ts for canonical definition
 */
export type AdapterType = `${AdapterTypeEnum}`;

/**
 * Adapter category for UI organization
 * @see AdapterCategory enum in constants/enums.ts for canonical definition
 */
export type AdapterCategory = `${AdapterCategoryEnum}`;

// BASE ADAPTER INTERFACE

/**
 * Base adapter interface shared by all adapter types.
 * Contains metadata and schema for UI auto-generation.
 */
export interface BaseAdapter<TConfig = JsonObject> {
    /** Primary adapter type */
    readonly type: AdapterType;
    /** Unique adapter code (used in pipeline definitions) */
    readonly code: string;
    /** Display name */
    readonly name?: string;
    /** Description for documentation */
    readonly description?: string;
    /** Category for UI organization */
    readonly category?: AdapterCategory;
    /** Configuration schema for UI form generation */
    readonly schema: StepConfigSchema;
    /** For operators: whether side-effect free (stream-safe) */
    readonly pure?: boolean;
    /** Whether this adapter performs async operations */
    readonly async?: boolean;
    /** Whether records can be batched */
    readonly batchable?: boolean;
    /** Permissions required to use this adapter */
    readonly requires?: readonly string[];
    /** Icon name for UI */
    readonly icon?: string;
    /** Color for UI */
    readonly color?: string;
    /** Adapter version */
    readonly version?: string;
    /** Whether the adapter is deprecated */
    readonly deprecated?: boolean;
    /** Message explaining deprecation and migration path */
    readonly deprecatedMessage?: string;
}

/**
 * AdapterDefinition is used for static adapter metadata/schema definitions
 * that don't include runtime methods. Used in constants-adapters.ts for
 * declaring available adapters and their configuration schemas.
 */
export interface AdapterDefinition {
    readonly type: AdapterType;
    readonly code: string;
    readonly name?: string;
    readonly description?: string;
    readonly category?: AdapterCategory;
    readonly schema: StepConfigSchema;
    readonly pure?: boolean;
    readonly async?: boolean;
    readonly batchable?: boolean;
    readonly requires?: readonly string[];
    readonly icon?: string;
    readonly color?: string;
    readonly version?: string;
    readonly deprecated?: boolean;
    readonly deprecatedMessage?: string;
}

// RECORD TYPES

/**
 * Envelope wrapping a data record with metadata
 */
export interface RecordEnvelope {
    /** The actual record data */
    readonly data: JsonObject;
    /** Optional record metadata */
    readonly meta?: RecordMeta;
}

/**
 * Metadata attached to extracted records
 */
export interface RecordMeta {
    /** Source identifier (e.g., primary key from source system) */
    readonly sourceId?: string;
    /** Timestamp from source system */
    readonly sourceTimestamp?: string;
    /** Content hash for change detection */
    readonly hash?: string;
    /** Sequence number in source order */
    readonly sequence?: number;
    /** Cursor for pagination */
    readonly cursor?: string;
    /** Additional metadata fields */
    readonly [key: string]: JsonValue | undefined;
}

// EXTRACTOR ADAPTER

/**
 * Context provided to extractor adapters
 */
export interface ExtractContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Checkpoint data for incremental extraction */
    readonly checkpoint: PipelineCheckpoint;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Save checkpoint data for next run */
    setCheckpoint(data: JsonObject): void;
}

/**
 * Extractor adapter using async generator for streaming
 */
export interface ExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'extractor';
    /**
     * Extract records from source as a stream
     * @param context Extraction context
     * @param config Adapter configuration
     * @yields Record envelopes
     */
    extract(context: ExtractContext, config: TConfig): AsyncGenerator<RecordEnvelope, void, undefined>;
}

/**
 * Simplified extractor that returns all records at once
 */
export interface BatchExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'extractor';
    /**
     * Extract all records from source
     * @param context Extraction context
     * @param config Adapter configuration
     * @returns All extracted records
     */
    extractAll(context: ExtractContext, config: TConfig): Promise<ExtractResult>;
}

// OPERATOR ADAPTER

/**
 * Context provided to operator adapters
 */
export interface OperatorContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
}

/**
 * Operator adapter for batch record transformation
 */
export interface OperatorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'operator';
    /** Whether the operator is pure (no side effects) */
    readonly pure: boolean;
    /**
     * Apply transformation to records
     * @param records Input records
     * @param config Adapter configuration
     * @param helpers Operator helpers
     * @returns Transformed records
     */
    apply(records: readonly JsonObject[], config: TConfig, helpers: OperatorHelpers): Promise<OperatorResult> | OperatorResult;
}

/**
 * Simpler single-record operator (engine will batch)
 */
export interface SingleRecordOperator<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'operator';
    /** Whether the operator is pure (no side effects) */
    readonly pure: boolean;
    /**
     * Apply transformation to a single record
     * @param record Input record
     * @param config Adapter configuration
     * @param helpers Operator helpers
     * @returns Transformed record or null to drop
     */
    applyOne(record: JsonObject, config: TConfig, helpers: OperatorHelpers): Promise<JsonObject | null> | JsonObject | null;
}

// LOADER ADAPTER

/**
 * Channel assignment strategy
 */
export type ChannelStrategy = 'explicit' | 'inherit' | 'multi';

/**
 * Language handling strategy
 */
export type LanguageStrategy = 'specific' | 'fallback' | 'multi';

/**
 * Validation strictness mode for loaders
 */
export type ValidationStrictness = 'strict' | 'lenient';

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy = 'source-wins' | 'vendure-wins' | 'merge' | 'manual-queue';

export type LoadStrategy =
    | 'create' | 'update' | 'upsert' | 'merge' | 'soft-delete' | 'hard-delete';

/**
 * Context provided to loader adapters
 */
export interface LoadContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Channel assignment strategy */
    readonly channelStrategy: ChannelStrategy;
    /** Target channel IDs */
    readonly channels: readonly ID[];
    /** Language handling strategy */
    readonly languageStrategy: LanguageStrategy;
    /** Validation strictness mode */
    readonly validationMode: ValidationStrictness;
    /** Conflict resolution strategy */
    readonly conflictStrategy: ConflictStrategy;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether this is a dry run (no actual writes) */
    readonly dryRun: boolean;
}

/**
 * Loader adapter for writing to Vendure entities
 */
export interface LoaderAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'loader';
    /**
     * Load records into Vendure
     * @param context Load context
     * @param config Adapter configuration
     * @param records Records to load
     * @returns Load result with success/failure counts
     */
    load(context: LoadContext, config: TConfig, records: readonly JsonObject[]): Promise<LoadResult>;
}

// VALIDATOR ADAPTER

/**
 * Context provided to validator adapters
 */
export interface ValidateContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Validation mode (fail-fast or accumulate all errors) */
    readonly mode: 'fail-fast' | 'accumulate';
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
}

/**
 * Validator adapter for record validation
 */
export interface ValidatorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'validator';
    /**
     * Validate records
     * @param context Validation context
     * @param config Adapter configuration
     * @param records Records to validate
     * @returns Validation result with valid/invalid records
     */
    validate(context: ValidateContext, config: TConfig, records: readonly JsonObject[]): Promise<ValidationResult>;
}

// ENRICHER ADAPTER

/**
 * Context provided to enricher adapters
 */
export interface EnrichContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
}

/**
 * Enricher adapter for adding data to records
 */
export interface EnricherAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'enricher';
    /**
     * Enrich records with additional data
     * @param context Enrichment context
     * @param config Adapter configuration
     * @param records Records to enrich
     * @returns Enriched records
     */
    enrich(context: EnrichContext, config: TConfig, records: readonly JsonObject[]): Promise<EnrichResult>;
}

// EXPORTER ADAPTER

/**
 * Export target types
 */
export type ExportTargetType =
    | 'file'        // CSV, JSON, XML files
    | 'feed'        // Google Merchant, Meta, etc.
    | 'api'         // REST/GraphQL endpoints
    | 'search'      // Elasticsearch, MeiliSearch, OpenSearch
    | 'warehouse'   // BigQuery, Snowflake, Redshift
    | 'messaging'   // RabbitMQ
    | 'storage';    // S3, GCS, Azure Blob

export type ExportFormat = ExportFormatType;

/**
 * Context provided to exporter adapters
 */
export interface ExportContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether this is a dry run */
    readonly dryRun: boolean;
    /** Whether this is an incremental export */
    readonly incremental: boolean;
    /** Checkpoint data */
    readonly checkpoint: PipelineCheckpoint;
    /** Save checkpoint data */
    setCheckpoint(data: JsonObject): void;
}

/**
 * Exporter adapter for sending data to external systems
 */
export interface ExporterAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'exporter';
    /** Target type (file, api, etc.) */
    readonly targetType: ExportTargetType;
    /** Supported export formats */
    readonly formats?: readonly ExportFormat[];
    /**
     * Export records to external system
     * @param context Export context
     * @param config Adapter configuration
     * @param records Records to export
     * @returns Export result
     */
    export(context: ExportContext, config: TConfig, records: readonly JsonObject[]): Promise<ExportResult>;
    /**
     * Optional finalization step after all records exported
     * @param context Export context
     * @param config Adapter configuration
     */
    finalize?(context: ExportContext, config: TConfig): Promise<void>;
}

// FEED ADAPTER

/**
 * Product feed types for marketplaces
 */
export type FeedType =
    | 'google-merchant'
    | 'meta-catalog'
    | 'amazon'
    | 'pinterest'
    | 'tiktok'
    | 'bing-shopping'
    | 'criteo'
    | 'custom';

/**
 * Feed file formats
 */
export type FeedFormat = 'xml' | 'csv' | 'tsv' | 'json' | 'ndjson';

/**
 * Context provided to feed adapters
 */
export interface FeedContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether this is a dry run */
    readonly dryRun: boolean;
    /** Channel ID for the feed */
    readonly channelId?: ID;
    /** Language code for translations */
    readonly languageCode?: string;
    /** Currency code for prices */
    readonly currencyCode?: string;
}

/**
 * Feed adapter for generating product feeds
 */
export interface FeedAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'feed';
    /** Feed type (google-merchant, meta-catalog, etc.) */
    readonly feedType: FeedType;
    /** Supported formats */
    readonly formats: readonly FeedFormat[];
    /** Required fields for this feed type */
    readonly requiredFields: readonly string[];
    /** Optional fields for this feed type */
    readonly optionalFields?: readonly string[];
    /**
     * Generate feed from records
     * @param context Feed context
     * @param config Adapter configuration
     * @param records Records to include in feed
     * @returns Feed result with validation info
     */
    generateFeed(context: FeedContext, config: TConfig, records: readonly JsonObject[]): Promise<FeedResult>;
    /**
     * Optional validation for individual items
     * @param record Record to validate
     * @param config Adapter configuration
     * @returns Validation errors if any
     */
    validateItem?(record: JsonObject, config: TConfig): import('./result-types').FeedValidationError[];
}

// SINK ADAPTER

/**
 * Sink types for search engine indexing
 */
export type SinkType =
    | 'elasticsearch'
    | 'opensearch'
    | 'meilisearch'
    | 'algolia'
    | 'typesense'
    | 'webhook'
    | 'custom';

/**
 * Context provided to sink adapters
 */
export interface SinkContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether this is a dry run */
    readonly dryRun: boolean;
}

/**
 * Sink adapter for indexing to search engines
 */
export interface SinkAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'sink';
    /** Sink type (elasticsearch, algolia, etc.) */
    readonly sinkType: SinkType;
    /**
     * Index records to search engine
     * @param context Sink context
     * @param config Adapter configuration
     * @param records Records to index
     * @returns Index result
     */
    index(context: SinkContext, config: TConfig, records: readonly JsonObject[]): Promise<SinkResult>;
    /**
     * Optional delete operation
     * @param context Sink context
     * @param config Adapter configuration
     * @param ids IDs to delete
     * @returns Delete result
     */
    delete?(context: SinkContext, config: TConfig, ids: readonly string[]): Promise<SinkResult>;
    /**
     * Optional refresh operation
     * @param context Sink context
     * @param config Adapter configuration
     */
    refresh?(context: SinkContext, config: TConfig): Promise<void>;
}

// TRIGGER ADAPTER

/**
 * Trigger types that initiate pipelines
 * @see TriggerType enum in constants/enums.ts for canonical definition
 */
export type TriggerType = `${TriggerTypeEnum}`;

/**
 * Context provided to trigger adapters
 */
export interface TriggerContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Pipeline code */
    readonly pipelineCode: string;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
}

/**
 * Payload from a trigger event
 */
export interface TriggerPayload {
    /** Trigger type */
    readonly type: TriggerType;
    /** Trigger timestamp */
    readonly timestamp: string;
    /** Trigger data */
    readonly data?: JsonObject;
    /** Trigger metadata */
    readonly meta?: JsonObject;
}

/**
 * Trigger adapter for initiating pipelines
 */
export interface TriggerAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'extractor'; // Triggers are like extractors that produce initial records
    /** Trigger type */
    readonly triggerType: TriggerType;
    /**
     * Initialize the trigger
     * @param context Trigger context
     * @param config Adapter configuration
     */
    initialize?(context: TriggerContext, config: TConfig): Promise<void>;
    /**
     * Shutdown the trigger
     */
    shutdown?(): Promise<void>;
    /**
     * Check if trigger should fire
     * @param context Trigger context
     * @param config Adapter configuration
     * @param payload Trigger payload
     */
    shouldTrigger?(context: TriggerContext, config: TConfig, payload: TriggerPayload): Promise<boolean>;
}

// UNIFIED ADAPTER TYPE

/**
 * Union type of all runtime adapters with methods
 */
export type DataHubAdapter =
    | ExtractorAdapter
    | BatchExtractorAdapter
    | OperatorAdapter
    | SingleRecordOperator
    | LoaderAdapter
    | ValidatorAdapter
    | EnricherAdapter
    | ExporterAdapter
    | FeedAdapter
    | SinkAdapter;

/**
 * Adapter registration with priority
 */
export interface AdapterRegistration<T extends DataHubAdapter = DataHubAdapter> {
    /** The adapter instance */
    readonly adapter: T;
    /** Priority for ordering (higher = runs first) */
    readonly priority?: number;
}
