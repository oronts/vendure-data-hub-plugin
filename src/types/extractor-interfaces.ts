import { ID, RequestContext } from '@vendure/core';
import {
    JsonObject,
    SecretResolver as SharedSecretResolver,
    AdapterLogger,
    ExtractorConfig,
    ExtractorCheckpoint,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    ConnectionConfig,
} from '../../shared/types';

export type {
    ExtractorConfig,
    RateLimitConfig,
    RetryConfig,
    AuthConfig,
    PaginationType,
    PaginationConfig,
    ConnectionConfig,
    RecordEnvelope,
    RecordMetadata,
    ExtractorCheckpoint,
    ExtractorResult,
    ExtractorMetrics,
    ExtractorError,
    ExtractorResultMetadata,
    ExtractorValidationResult,
    ExtractorValidationError,
    ExtractorValidationWarning,
    StepConfigSchema,
    StepConfigField,
    StepConfigGroup,
    ExtractorCategory,
    ConnectionTestResult,
    ExtractorPreviewResult,
    HttpRequestOptions,
    HttpResponse,
    FtpFileInfo,
    S3ObjectInfo,
    DatabaseQueryResult,
} from '../../shared/types';

export type SecretResolver = SharedSecretResolver;

export interface ExtractorConnectionResolver {
    get(code: string): Promise<ConnectionConfig | undefined>;
    getRequired(code: string): Promise<ConnectionConfig>;
}

export type ExtractorLogger = AdapterLogger;

export interface ExtractorContext {
    /** Vendure request context */
    readonly ctx: RequestContext;

    /** Pipeline ID */
    readonly pipelineId: ID;

    /** Pipeline run ID */
    readonly runId: ID;

    /** Step key in pipeline */
    readonly stepKey: string;

    /** Checkpoint data from previous run */
    readonly checkpoint: ExtractorCheckpoint;

    /** Secret resolver */
    readonly secrets: SecretResolver;

    /** Connection resolver */
    readonly connections: ExtractorConnectionResolver;

    /** Logger */
    readonly logger: ExtractorLogger;

    /** Dry run mode */
    readonly dryRun: boolean;

    /**
     * Set checkpoint data to resume from
     */
    setCheckpoint(data: JsonObject): void;

    /**
     * Check if cancellation was requested
     */
    isCancelled(): Promise<boolean>;
}

export interface DataExtractor<TConfig extends ExtractorConfig = ExtractorConfig> {
    /** Adapter type - always 'extractor' */
    readonly type: 'extractor';

    /** Unique extractor code */
    readonly code: string;

    /** Human-readable name */
    readonly name: string;

    /** Description */
    readonly description?: string;

    /** Category for UI grouping */
    readonly category: ExtractorCategory;

    /** Configuration schema for UI */
    readonly schema: StepConfigSchema;

    /** Version */
    readonly version?: string;

    /** Icon for UI */
    readonly icon?: string;

    /** Whether this extractor supports pagination */
    readonly supportsPagination?: boolean;

    /** Whether this extractor supports incremental extraction */
    readonly supportsIncremental?: boolean;

    /** Whether this extractor can be cancelled */
    readonly supportsCancellation?: boolean;

    /**
     * Extract data from source
     * Returns an async generator for streaming support
     */
    extract(
        context: ExtractorContext,
        config: TConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined>;

    /**
     * Validate configuration before extraction
     */
    validate(
        context: ExtractorContext,
        config: TConfig,
    ): Promise<ExtractorValidationResult>;

    /**
     * Get schema for extracted data (optional)
     */
    getSchema?(
        context: ExtractorContext,
        config: TConfig,
    ): Promise<JsonObject | undefined>;

    /**
     * Test connection (optional)
     */
    testConnection?(
        context: ExtractorContext,
        config: TConfig,
    ): Promise<ConnectionTestResult>;

    /**
     * Preview data (optional)
     */
    preview?(
        context: ExtractorContext,
        config: TConfig,
        limit?: number,
    ): Promise<ExtractorPreviewResult>;
}

export interface BatchDataExtractor<TConfig extends ExtractorConfig = ExtractorConfig>
    extends Omit<DataExtractor<TConfig>, 'extract'> {
    extractAll(context: ExtractorContext, config: TConfig): Promise<import('../../shared/types').ExtractorResult>;
}

export function isStreamingExtractor(
    extractor: DataExtractor | BatchDataExtractor,
): extractor is DataExtractor {
    return 'extract' in extractor && typeof extractor.extract === 'function';
}

export function isBatchExtractor(
    extractor: DataExtractor | BatchDataExtractor,
): extractor is BatchDataExtractor {
    return 'extractAll' in extractor && typeof extractor.extractAll === 'function';
}
