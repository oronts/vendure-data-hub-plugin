import { RequestContext, ID } from '@vendure/core';
import { JsonObject, PipelineCheckpoint, PipelineContext as PipelineCtx } from '../../types/index';
import { SecretResolver, ConnectionResolver, AdapterLogger } from './connection-types';
import type { BaseAdapter, RecordEnvelope } from './base-adapter-types';
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
import { AdapterOperatorHelpers } from './transform-types';
import { ExportFormatType } from '../../constants/enums';
import {
    ChannelStrategy,
    LanguageStrategyValue,
    ValidationModeType,
    ConflictStrategyValue,
    FeedType,
    ExtractorPreviewResult,
} from '../../../shared/types';
import { LOAD_STRATEGY } from '../../../shared/constants/enums';

// Re-export canonical types from shared
export type { AdapterType, AdapterCategory, TriggerType, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue } from '../../../shared/types';

export type {
    AdapterDefinition,
    BaseAdapter,
    RecordEnvelope,
    RecordMeta,
} from './base-adapter-types';

// EXTRACTOR ADAPTER

/**
 * Context provided to extractor adapters
 */
export interface ExtractContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Current pipeline run ID */
    readonly runId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Checkpoint data for incremental extraction */
    readonly checkpoint: PipelineCheckpoint;
    /** Trigger-provided source references for targeted extraction */
    readonly sourceRecords?: readonly JsonObject[];
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether extraction is running with a bounded preview/test record limit */
    readonly dryRun: boolean;
    /** Save checkpoint data for next run */
    setCheckpoint(data: JsonObject): void;
    /** Check whether cancellation has been requested for the current run */
    isCancelled(): Promise<boolean>;
}

/**
 * Extractor adapter using async generator for streaming
 */
export interface ExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'EXTRACTOR';
    extract(context: ExtractContext, config: TConfig): AsyncGenerator<RecordEnvelope, void, undefined>;
    preview?(
        context: ExtractContext,
        config: TConfig,
        limit: number,
    ): Promise<ExtractorPreviewResult>;
}

/**
 * Simplified extractor that returns all records at once
 */
export interface BatchExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'EXTRACTOR';
    extractAll(context: ExtractContext, config: TConfig): Promise<ExtractResult>;
    preview(
        context: ExtractContext,
        config: TConfig,
        limit: number,
    ): Promise<ExtractorPreviewResult>;
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
    readonly type: 'OPERATOR';
    readonly pure: boolean;
    apply(records: readonly JsonObject[], config: TConfig, helpers: AdapterOperatorHelpers): Promise<OperatorResult> | OperatorResult;
}

/**
 * Simpler single-record operator (engine will batch)
 */
export interface SingleRecordOperator<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'OPERATOR';
    readonly pure: boolean;
    applyOne(record: JsonObject, config: TConfig, helpers: AdapterOperatorHelpers): Promise<JsonObject | null> | JsonObject | null;
}

// LOADER ADAPTER

// ChannelStrategy is imported and re-exported from shared/types/step.types.ts above
// LanguageStrategyValue, ValidationModeType, ConflictStrategyValue are canonical in shared/types

export type LoadStrategy = (typeof LOAD_STRATEGY)[keyof typeof LOAD_STRATEGY];

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
    readonly languageStrategy: LanguageStrategyValue;
    /** Validation strictness mode */
    readonly validationMode: ValidationModeType;
    /** Conflict resolution strategy */
    readonly conflictStrategy: ConflictStrategyValue;
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
    readonly type: 'LOADER';
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
    /** Validation mode (FAIL_FAST or ACCUMULATE all errors) */
    readonly mode: 'FAIL_FAST' | 'ACCUMULATE';
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
}

/**
 * Validator adapter for record validation
 */
export interface ValidatorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'VALIDATOR';
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
    readonly type: 'ENRICHER';
    enrich(context: EnrichContext, config: TConfig, records: readonly JsonObject[]): Promise<EnrichResult>;
}

// EXPORTER ADAPTER

/**
 * Export target types
 */
export type ExportTargetType =
    | 'FILE'        // CSV, JSON, XML files
    | 'FEED'        // Google Merchant, Meta, etc.
    | 'API'         // REST/GraphQL endpoints
    | 'SEARCH'      // Elasticsearch, MeiliSearch, OpenSearch
    | 'WAREHOUSE'   // BigQuery, Snowflake, Redshift
    | 'MESSAGING'   // RabbitMQ
    | 'STORAGE';    // S3, GCS, Azure Blob

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
    readonly type: 'EXPORTER';
    readonly targetType: ExportTargetType;
    readonly formats?: readonly ExportFormatType[];
    export(context: ExportContext, config: TConfig, records: readonly JsonObject[]): Promise<ExportResult>;
    finalize?(context: ExportContext, config: TConfig): Promise<void>;
}

// FEED ADAPTER

// FeedType is canonical in shared/types/pipeline.types.ts (imported at top)
export type { FeedType };

/**
 * Feed file formats
 */
export type FeedFormat = 'XML' | 'CSV' | 'TSV' | 'JSON' | 'NDJSON';

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
    readonly type: 'FEED';
    readonly feedType: FeedType;
    readonly formats: readonly FeedFormat[];
    readonly requiredFields: readonly string[];
    readonly optionalFields?: readonly string[];
    generateFeed(context: FeedContext, config: TConfig, records: readonly JsonObject[]): Promise<FeedResult>;
    validateItem?(record: JsonObject, config: TConfig): import('./result-types').FeedValidationError[];
}

// SINK ADAPTER

/**
 * Sink types for search engine indexing
 */
export type SinkType =
    | 'ELASTICSEARCH'
    | 'OPENSEARCH'
    | 'MEILISEARCH'
    | 'ALGOLIA'
    | 'TYPESENSE'
    | 'RABBITMQ'
    | 'RABBITMQ_AMQP'
    | 'SQS'
    | 'REDIS_STREAMS'
    | 'WEBHOOK'
    | 'CUSTOM';

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
    readonly type: 'SINK';
    readonly sinkType: SinkType;
    index(context: SinkContext, config: TConfig, records: readonly JsonObject[]): Promise<SinkResult>;
    delete?(context: SinkContext, config: TConfig, ids: readonly string[]): Promise<SinkResult>;
    refresh?(context: SinkContext, config: TConfig): Promise<void>;
}

// UNIFIED ADAPTER TYPE

/**
 * Union type of all runtime adapters with methods
 */
export type DataHubAdapter<TConfig = unknown> =
    | ExtractorAdapter<TConfig>
    | BatchExtractorAdapter<TConfig>
    | OperatorAdapter<TConfig>
    | SingleRecordOperator<TConfig>
    | LoaderAdapter<TConfig>
    | ValidatorAdapter<TConfig>
    | EnricherAdapter<TConfig>
    | ExporterAdapter<TConfig>
    | FeedAdapter<TConfig>
    | SinkAdapter<TConfig>;

/**
 * Adapter registration with priority
 */
export interface AdapterRegistration<T extends DataHubAdapter = DataHubAdapter> {
    /** The adapter instance */
    readonly adapter: T;
    /** Priority for ordering (higher = runs first) */
    readonly priority?: number;
}
