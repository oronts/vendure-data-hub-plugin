/**
 * Extractor Types - Shared type definitions for data extraction
 *
 * These types define configuration and results for extractors.
 * Backend-specific interfaces that use @vendure/core remain in src/types.
 */

import type { JsonObject, JsonValue } from './json.types';

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

    /** Jitter factor (0-1) for randomizing backoff delays */
    jitterFactor?: number;
}

export interface AuthConfig {
    type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY' | 'OAUTH2' | 'HMAC' | 'JWT';
    /** Secret code for looking up the token/password via secret resolver */
    secretCode?: string;
    /** Header name for api-key auth (defaults to 'X-API-Key') */
    headerName?: string;
    /** Username for basic auth */
    username?: string;
    /** Secret code for looking up username (for basic auth) */
    usernameSecretCode?: string;
    /** Direct token value (if not using secret resolver) */
    token?: string;
    /** Direct password value for basic auth (if not using secret resolver) */
    password?: string;
}

// PAGINATION SUPPORT

export type PaginationType = 'NONE' | 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK_HEADER';

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

// CONNECTION CONFIG

/**
 * Connection configuration for extractor inputs.
 *
 * This is the canonical connection format used in extractor configurations
 * and pipeline definitions. It uses UPPER_CASE type literals for JSON serialization.
 *
 * Related ConnectionConfig types:
 * - src/sdk/types/connection-types.ts ConnectionConfig - SDK format with `code` and SCREAMING_SNAKE_CASE types
 * - src/utils/url-helpers.ts UrlConnectionConfig - Minimal interface for URL building
 */
export interface ConnectionConfig {
    type: 'HTTP' | 'FTP' | 'SFTP' | 'S3' | 'DATABASE';
    baseUrl?: string;
    headers?: Record<string, string>;
    auth?: AuthConfig;
    config?: JsonObject;
}

// RECORD ENVELOPE
//
// Parallel definition exists in src/sdk/types/adapter-types.ts (SDK RecordEnvelope).
// This shared version is mutable and used for pipeline definitions, serialization,
// and internal processing. The SDK version is readonly (immutable contract for
// adapter implementors) and includes additional fields (hash, cursor) for runtime
// change detection and pagination state.

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

// EXTRACTOR RESULT & METRICS

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
    readonly metadata?: ExtractorResultMetadata;
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

export interface ExtractorResultMetadata {
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

// STEP CONFIG SCHEMA (for UI)
//
// Parallel definition exists in src/sdk/types/schema-types.ts (SDK StepConfigSchema).
// This shared version is a simplified, mutable format used in pipeline definitions
// and API responses. The SDK version is readonly, has richer field types
// (FieldValidation, FieldDependency with more operators), and is used for
// adapter registration and auto-generated UI forms.

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
    | 'DATA_SOURCE'
    | 'FILE_SYSTEM'
    | 'CLOUD_STORAGE'
    | 'DATABASE'
    | 'API'
    | 'WEBHOOK'
    | 'VENDURE'
    | 'CUSTOM';

// CONNECTION TEST & PREVIEW

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
