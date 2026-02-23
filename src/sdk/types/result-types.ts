/**
 * Result Types - SDK types for operation results and responses
 *
 * These types define the result structures returned by various adapter
 * operations including extraction, loading, validation, export, and more.
 *
 * @module sdk/types/result-types
 */

import { ID } from '@vendure/core';
import { JsonObject } from '../../types/index';

// EXTRACT RESULTS

/**
 * Metrics from extraction operation
 */
export interface ExtractMetrics {
    /** Total records fetched */
    readonly totalFetched: number;
    /** Number of pages processed (for paginated sources) */
    readonly pagesProcessed?: number;
    /** Extraction duration in milliseconds */
    readonly durationMs?: number;
    /** Bytes read from source */
    readonly bytesRead?: number;
}

/**
 * Result from batch extraction
 */
export interface ExtractResult {
    /** Extracted record envelopes */
    readonly records: readonly import('./adapter-types').RecordEnvelope[];
    /** Whether there are more records to fetch */
    readonly hasMore?: boolean;
    /** Cursor for next page */
    readonly nextCursor?: string;
    /** Extraction metrics */
    readonly metrics?: ExtractMetrics;
}

// OPERATOR RESULTS

/**
 * Error from operator processing
 *
 * @see shared/types/operator.types.ts OperatorError for the shared/domain version
 */
export interface OperatorError {
    /** The record that caused the error */
    readonly record: JsonObject;
    /** Error message */
    readonly message: string;
    /** Field that caused the error */
    readonly field?: string;
}

/**
 * Result from operator processing
 */
export interface OperatorResult {
    /** Successfully processed records */
    readonly records: readonly JsonObject[];
    /** Number of dropped records */
    readonly dropped?: number;
    /** Processing errors */
    readonly errors?: readonly OperatorError[];
}

// LOAD RESULTS

/**
 * Error from loading operation
 *
 * @see shared/types/execution.types.ts LoadError for the shared/domain version
 */
export interface LoadError {
    /** The record that failed to load */
    readonly record: JsonObject;
    /** Error message */
    readonly message: string;
    /** Field that caused the error */
    readonly field?: string;
    /** Error code for categorization */
    readonly code?: string;
    /** Whether the error is recoverable */
    readonly recoverable?: boolean;
}

/**
 * Result from loading operation
 */
export interface LoadResult {
    /** Number of successfully loaded records */
    readonly succeeded: number;
    /** Number of failed records */
    readonly failed: number;
    /** Number of newly created entities */
    readonly created?: number;
    /** Number of updated entities */
    readonly updated?: number;
    /** Number of skipped records (e.g., duplicates) */
    readonly skipped?: number;
    /** Load errors */
    readonly errors?: readonly LoadError[];
    /** IDs of affected entities */
    readonly affectedIds?: readonly ID[];
}

// VALIDATION RESULTS

/**
 * SDK-specific validation error for adapter result types.
 *
 * This type is used by validator adapters and has a shape optimized for
 * validation result reporting. Field is optional because some validation
 * errors apply to the entire record rather than a specific field.
 *
 * @see shared/types/validation.types.ts ValidationError
 */
export interface SdkValidationError {
    /** Field that failed validation (optional for record-level errors) */
    readonly field?: string;
    /** Validation rule that failed */
    readonly rule: string;
    /** Human-readable error message */
    readonly message: string;
    /** Error code for programmatic handling */
    readonly code?: string;
}

/**
 * Record that failed validation
 */
export interface InvalidRecord {
    /** The invalid record */
    readonly record: JsonObject;
    /** Validation errors for this record */
    readonly errors: readonly SdkValidationError[];
}

/**
 * Result from validation operation
 */
export interface ValidationResult {
    /** Records that passed validation */
    readonly valid: readonly JsonObject[];
    /** Records that failed validation */
    readonly invalid: readonly InvalidRecord[];
}

// ENRICH RESULTS

/**
 * Error from enrichment operation
 */
export interface EnrichError {
    /** The record that failed enrichment */
    readonly record: JsonObject;
    /** Error message */
    readonly message: string;
}

/**
 * Result from enrichment operation
 */
export interface EnrichResult {
    /** Enriched records */
    readonly records: readonly JsonObject[];
    /** Enrichment errors */
    readonly errors?: readonly EnrichError[];
}

// EXPORT RESULTS

/**
 * Error from export operation
 */
export interface ExportError {
    /** The record that failed to export */
    readonly record: JsonObject;
    /** Error message */
    readonly message: string;
    /** Error code */
    readonly code?: string;
    /** Whether the error is recoverable */
    readonly recoverable?: boolean;
}

/**
 * Result from export operation
 */
export interface ExportResult {
    /** Number of successfully exported records */
    readonly succeeded: number;
    /** Number of failed records */
    readonly failed: number;
    /** Total exported count */
    readonly exported?: number;
    /** Number of skipped records */
    readonly skipped?: number;
    /** Export errors */
    readonly errors?: readonly ExportError[];
    /** Local file path if exported to file */
    readonly outputPath?: string;
    /** URL if exported to cloud storage */
    readonly outputUrl?: string;
    /** Additional metadata about the export */
    readonly metadata?: JsonObject;
}

// FEED RESULTS

/**
 * Validation error for feed items
 */
export interface FeedValidationError {
    /** Item ID that failed validation */
    readonly itemId: string;
    /** Field that failed validation */
    readonly field: string;
    /** Error message */
    readonly message: string;
    /** Feed requirement that was violated */
    readonly requirement: string;
}

/**
 * Warning for feed items (non-blocking)
 */
export interface FeedWarning {
    /** Item ID with warning */
    readonly itemId: string;
    /** Field with warning */
    readonly field: string;
    /** Warning message */
    readonly message: string;
    /** Suggestion for improvement */
    readonly suggestion?: string;
}

/**
 * Result from feed generation
 */
export interface FeedResult {
    /** Total item count */
    readonly itemCount: number;
    /** Number of valid items */
    readonly validCount: number;
    /** Number of invalid items (excluded from feed) */
    readonly invalidCount: number;
    /** Number of items with warnings */
    readonly warningCount: number;
    /** Local file path if saved to file */
    readonly outputPath?: string;
    /** URL if uploaded to storage */
    readonly outputUrl?: string;
    /** Feed version/revision */
    readonly feedVersion?: string;
    /** Generation timestamp (ISO 8601) */
    readonly generatedAt: string;
    /** Validation errors */
    readonly validationErrors?: readonly FeedValidationError[];
    /** Warnings */
    readonly warnings?: readonly FeedWarning[];
}

// SINK RESULTS

/**
 * Error from sink/indexing operation
 */
export interface SinkError {
    /** The record that failed to index */
    readonly record: JsonObject;
    /** Error message */
    readonly message: string;
    /** HTTP status code if applicable */
    readonly statusCode?: number;
}

/**
 * Result from sink/indexing operation
 */
export interface SinkResult {
    /** Number of successfully indexed records */
    readonly indexed: number;
    /** Number of deleted records */
    readonly deleted: number;
    /** Number of failed records */
    readonly failed: number;
    /** Indexing errors */
    readonly errors?: readonly SinkError[];
}

// STEP EXECUTION RESULTS

/**
 * Metrics from adapter step execution.
 *
 * This is the SDK/adapter-facing metrics type with fields optimized for
 * adapter result reporting (inputCount/outputCount/durationMs).
 *
 * @see shared/types/step.types.ts StepMetrics for the shared/domain version
 *   which uses inputRecords/outputRecords/duration field names.
 */
export interface AdapterStepMetrics {
    /** Number of input records */
    readonly inputCount: number;
    /** Number of output records */
    readonly outputCount: number;
    /** Execution duration in milliseconds */
    readonly durationMs: number;
    /** Number of successful operations */
    readonly succeeded: number;
    /** Number of failed operations */
    readonly failed: number;
}

/**
 * Error from adapter step execution.
 *
 * This is the SDK/adapter-facing error type with a simplified shape
 * for adapter result reporting.
 *
 * @see shared/types/step.types.ts StepError for the shared/domain version
 *   which includes additional fields (field, recordIndex, recordId, stack, retryable).
 */
export interface AdapterStepError {
    /** Error message */
    readonly message: string;
    /** The record that caused the error (if applicable) */
    readonly record?: JsonObject;
    /** Error code */
    readonly code?: string;
}

/**
 * Result from step execution
 */
export interface StepExecutionResult {
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Step type */
    readonly type: string;
    /** Output records */
    readonly records: readonly JsonObject[];
    /** Step execution metrics */
    readonly metrics: AdapterStepMetrics;
    /** Step errors */
    readonly errors?: readonly AdapterStepError[];
}
