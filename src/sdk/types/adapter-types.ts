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
import { AdapterOperatorHelpers } from './transform-types';
import { ExportFormatType } from '../../constants/enums';
import {
    AdapterType,
    AdapterCategory,
    TriggerType,
    ChannelStrategy,
    LanguageStrategyValue,
    ValidationModeType,
    ConflictStrategyValue,
    FeedType,
} from '../../../shared/types';
import { LOAD_STRATEGY } from '../../../shared/constants/enums';

// Re-export canonical types from shared
export type { AdapterType, AdapterCategory, TriggerType, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue } from '../../../shared/types';

// BASE ADAPTER INTERFACE

/**
 * Base adapter interface shared by all adapter types.
 * Contains metadata and schema for UI auto-generation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- TConfig is used by extending interfaces
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
    readonly category?: AdapterCategory | string;
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
    /** Whether the adapter is experimental/beta and may change */
    readonly experimental?: boolean;
    /** Message explaining experimental status and limitations */
    readonly experimentalMessage?: string;
    /** For loaders: the Vendure entity type this loader handles */
    readonly entityType?: string;
    /** For exporters/feeds: the base output file format */
    readonly formatType?: string;
    /** For loaders: fields that can be patched during error retry */
    readonly patchableFields?: readonly string[];
    /** For operators: which custom editor to use in the UI ('map' | 'template' | 'filter') */
    readonly editorType?: string;
    /** For operators: template string for config summary display (e.g. "${from} → ${to}") */
    readonly summaryTemplate?: string;
    /** Human-readable category label for UI display (e.g. "String", "Numeric") */
    readonly categoryLabel?: string;
    /** Sort order for category display in the UI (lower = first) */
    readonly categoryOrder?: number;
    /** For operators: whether this operator is suitable for field-level transforms in the export wizard */
    readonly fieldTransform?: boolean;
}

/**
 * SDK AdapterDefinition - immutable contract for custom adapter registration.
 * Used in constants-adapters.ts for declaring available adapters and their
 * configuration schemas. All fields are readonly.
 *
 * Parallel definition exists in shared/types/adapter.types.ts with a different
 * shape: mutable fields, required `name`, `tags[]`, uses AdapterSchema instead
 * of StepConfigSchema, and omits SDK-specific fields (requires, version,
 * deprecatedMessage, experimentalMessage). The shared version is used for
 * pipeline definitions and API serialization.
 */
export interface AdapterDefinition {
    readonly type: AdapterType;
    readonly code: string;
    readonly name?: string;
    readonly description?: string;
    readonly category?: AdapterCategory | string;
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
    /** Whether the adapter is experimental/beta and may change */
    readonly experimental?: boolean;
    /** Message explaining experimental status and limitations */
    readonly experimentalMessage?: string;
    /** For loaders: the Vendure entity type this loader handles */
    readonly entityType?: string;
    /** For exporters/feeds: the base output file format */
    readonly formatType?: string;
    /** For loaders: fields that can be patched during error retry */
    readonly patchableFields?: readonly string[];
    /** For operators: which custom editor to use in the UI ('map' | 'template' | 'filter') */
    readonly editorType?: string;
    /** For operators: template string for config summary display (e.g. "${from} → ${to}") */
    readonly summaryTemplate?: string;
    /** Human-readable category label for UI display (e.g. "String", "Numeric") */
    readonly categoryLabel?: string;
    /** Sort order for category display in the UI (lower = first) */
    readonly categoryOrder?: number;
    /** Whether this adapter should be hidden from wizard UIs (internal/test-only adapters) */
    readonly wizardHidden?: boolean;
    /** Whether this adapter is built-in (shipped with the plugin) vs custom (registered via SDK/connectors) */
    readonly builtIn?: boolean;
    /** For operators: whether this operator is suitable for field-level transforms in the export wizard */
    readonly fieldTransform?: boolean;
}

// RECORD TYPES
//
// Parallel definition exists in shared/types/extractor.types.ts (shared RecordEnvelope).
// This SDK version is the immutable runtime contract for custom adapter implementors.
// All fields are readonly to prevent adapters from mutating records during processing.
// Includes additional fields (hash, cursor) not in the shared version, used for
// runtime change detection and pagination state.
// The shared version is mutable and used for pipeline definitions and serialization.

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
    readonly type: 'EXTRACTOR';
    extract(context: ExtractContext, config: TConfig): AsyncGenerator<RecordEnvelope, void, undefined>;
}

/**
 * Simplified extractor that returns all records at once
 */
export interface BatchExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'EXTRACTOR';
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

// TRIGGER ADAPTER
// TriggerType is imported from shared/types at the top of this file

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
    readonly type: 'TRIGGER';
    readonly triggerType: TriggerType;
    initialize?(context: TriggerContext, config: TConfig): Promise<void>;
    shutdown?(): Promise<void>;
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
    | SinkAdapter
    | TriggerAdapter;

/**
 * Adapter registration with priority
 */
export interface AdapterRegistration<T extends DataHubAdapter = DataHubAdapter> {
    /** The adapter instance */
    readonly adapter: T;
    /** Priority for ordering (higher = runs first) */
    readonly priority?: number;
}
