/**
 * Extractor System - Interfaces and Types
 *
 * Extractors are responsible for fetching data from external sources.
 * They support various protocols (HTTP, FTP, S3, Database, etc.) and handle
 * pagination, rate limiting, authentication, and error recovery.
 */

import { ID, RequestContext } from '@vendure/core';
import { JsonObject, JsonValue } from './common';

// EXTRACTOR CONFIGURATION

/**
 * Base configuration for all extractors
 */
export interface ExtractorConfig {
    /** Connection code reference (optional, for HTTP/FTP/S3/Database) */
    connectionCode?: string;

    /** Rate limiting configuration */
    rateLimit?: RateLimitConfig;

    /** Retry configuration for failed requests */
    retry?: RetryConfig;

    /** Timeout in milliseconds */
    timeoutMs?: number;

    /** Authentication settings (can override connection auth) */
    auth?: AuthConfig;

    /** Allow additional properties */
    [key: string]: unknown;
}

export interface RateLimitConfig {
    /** Maximum requests per second */
    requestsPerSecond?: number;

    /** Maximum concurrent requests */
    maxConcurrent?: number;

    /** Delay between batches in ms */
    batchDelayMs?: number;
}

export interface RetryConfig {
    /** Maximum retry attempts */
    maxAttempts?: number;

    /** Initial delay in ms */
    initialDelayMs?: number;

    /** Maximum delay in ms */
    maxDelayMs?: number;

    /** Backoff multiplier */
    backoffMultiplier?: number;

    /** HTTP status codes to retry */
    retryableStatusCodes?: number[];
}

export interface AuthConfig {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2' | 'hmac';
    secretCode?: string;
    username?: string;
    password?: string;
    headerName?: string;
    token?: string;
}

// PAGINATION SUPPORT

export type PaginationType = 'offset' | 'cursor' | 'page' | 'link-header' | 'none';

export interface PaginationConfig {
    type: PaginationType;

    /** For offset pagination */
    offsetParam?: string;
    limitParam?: string;
    limit?: number;

    /** For cursor pagination */
    cursorParam?: string;
    cursorPath?: string;
    hasMorePath?: string;

    /** For page pagination */
    pageParam?: string;
    pageSizeParam?: string;
    pageSize?: number;

    /** For all types: where to find records in response */
    dataPath?: string;

    /** Maximum pages to fetch (safety limit) */
    maxPages?: number;
}

// SECRET & CONNECTION RESOLVERS

export interface SecretResolver {
    get(code: string): Promise<string | undefined>;
    getRequired(code: string): Promise<string>;
}

export interface ConnectionResolver {
    get(code: string): Promise<ConnectionConfig | undefined>;
    getRequired(code: string): Promise<ConnectionConfig>;
}

export interface ConnectionConfig {
    type: 'http' | 'ftp' | 'sftp' | 's3' | 'database';
    baseUrl?: string;
    headers?: Record<string, string>;
    auth?: AuthConfig;
    config?: JsonObject;
}

// EXTRACTOR LOGGER

export interface ExtractorLogger {
    debug(message: string, meta?: JsonObject): void;
    info(message: string, meta?: JsonObject): void;
    warn(message: string, meta?: JsonObject): void;
    error(message: string, error?: Error, meta?: JsonObject): void;
}

// RECORD ENVELOPE

export interface RecordEnvelope {
    /** The actual data */
    data: JsonObject;

    /** Metadata about the record */
    meta?: RecordMetadata;
}

export interface RecordMetadata {
    /** Source identifier (file path, URL, etc.) */
    sourceId?: string;

    /** Timestamp from source */
    sourceTimestamp?: string;

    /** Sequence number within batch */
    sequence?: number;

    /** Additional metadata */
    [key: string]: JsonValue | undefined;
}

// EXTRACTOR CHECKPOINT

export interface ExtractorCheckpoint {
    /** Last extraction timestamp */
    lastExtractedAt?: string;

    /** Last processed record ID/cursor */
    lastCursor?: string;

    /** Custom checkpoint data */
    data?: JsonObject;
}

// EXTRACTOR CONTEXT

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
    readonly connections: ConnectionResolver;

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

// EXTRACTOR RESULT & METADATA

export interface ExtractorResult {
    /** Extracted records */
    readonly records: readonly RecordEnvelope[];

    /** Whether more records are available */
    readonly hasMore?: boolean;

    /** Next cursor for pagination */
    readonly nextCursor?: string;

    /** Extraction metrics */
    readonly metrics: ExtractorMetrics;

    /** Errors encountered (non-fatal) */
    readonly errors?: readonly ExtractorError[];

    /** Metadata about the extraction */
    readonly metadata?: ExtractorMetadata;
}

export interface ExtractorMetrics {
    totalFetched: number;
    requestsMade?: number;
    pagesProcessed?: number;
    durationMs?: number;
    bytesRead?: number;
    filesProcessed?: number;
    rateLimitHits?: number;
    retriesPerformed?: number;
}

export interface ExtractorError {
    message: string;
    code?: string;
    statusCode?: number;
    record?: JsonObject;
    recoverable?: boolean;
    timestamp?: Date;
}

export interface ExtractorMetadata {
    sourceType: string;
    sourceId?: string;
    extractedAt: string; // ISO date string
    schemaVersion?: string;
    [key: string]: JsonValue | undefined;
}

// EXTRACTOR VALIDATION

export interface ExtractorValidationResult {
    valid: boolean;
    errors: ExtractorValidationError[];
    warnings?: ExtractorValidationWarning[];
}

export interface ExtractorValidationError {
    field: string;
    message: string;
    code?: string;
}

export interface ExtractorValidationWarning {
    field?: string;
    message: string;
}

// SCHEMA DEFINITION

export interface StepConfigSchema {
    fields: StepConfigField[];
    groups?: StepConfigGroup[];
}

export interface StepConfigField {
    key: string;
    label: string;
    description?: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'secret' | 'connection';
    required?: boolean;
    defaultValue?: JsonValue;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
    group?: string;
    dependsOn?: { field: string; value: JsonValue; operator?: 'eq' | 'ne' };
}

export interface StepConfigGroup {
    id: string;
    label: string;
    description?: string;
}

// EXTRACTOR CATEGORY

export type ExtractorCategory =
    | 'data-source'
    | 'file-system'
    | 'cloud-storage'
    | 'database'
    | 'api'
    | 'webhook'
    | 'vendure'
    | 'custom';

// EXTRACTOR INTERFACE

/**
 * Base Extractor Interface
 * All extractors must implement this interface
 */
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

/**
 * Batch Extractor Interface
 * For extractors that fetch all records at once
 */
export interface BatchDataExtractor<TConfig extends ExtractorConfig = ExtractorConfig>
    extends Omit<DataExtractor<TConfig>, 'extract'> {
    /**
     * Extract all data at once
     */
    extractAll(context: ExtractorContext, config: TConfig): Promise<ExtractorResult>;
}

export interface ConnectionTestResult {
    success: boolean;
    error?: string;
    details?: JsonObject;
    latencyMs?: number;
}

export interface ExtractorPreviewResult {
    records: readonly RecordEnvelope[];
    totalAvailable?: number;
    metadata?: JsonObject;
}

// HELPER TYPES FOR SPECIFIC EXTRACTORS

export interface HttpRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: JsonObject | string;
    timeout?: number;
    responseType?: 'json' | 'text' | 'buffer';
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
}

export interface FtpFileInfo {
    name: string;
    path: string;
    size: number;
    modifiedAt: Date;
    isDirectory: boolean;
}

export interface S3ObjectInfo {
    key: string;
    bucket: string;
    size: number;
    lastModified: Date;
    etag: string;
}

export interface DatabaseQueryResult {
    rows: unknown[];
    rowCount: number;
    fields?: Array<{ name: string; type: string }>;
}

// TYPE GUARDS

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
