/**
 * Execution Types
 *
 * Types for pipeline execution results, metrics, and error handling during
 * load, export, and sink operations.
 */

import { JsonObject, JsonValue } from './json.types';
import { StepMetrics, StepError } from './step.types';

/**
 * Metrics for a complete pipeline run
 */
export interface PipelineRunMetrics {
    /** Total number of records in the input */
    totalRecords: number;
    /** Number of records processed */
    processed: number;
    /** Number of successfully processed records */
    succeeded: number;
    /** Number of failed records */
    failed: number;
    /** Number of skipped records */
    skipped: number;
    /** Number of new records created */
    created: number;
    /** Number of existing records updated */
    updated: number;
    /** Total duration in milliseconds */
    durationMs: number;
}

/**
 * Pipeline metrics that can be updated during runtime.
 * Supports additional custom metric keys beyond the standard ones.
 */
export interface PipelineMetrics {
    /** Total number of records */
    totalRecords?: number;
    /** Number of records processed */
    processed?: number;
    /** Number of successful records */
    succeeded?: number;
    /** Number of failed records */
    failed?: number;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Additional custom metrics */
    [key: string]: JsonValue | undefined;
}

/**
 * Error that occurred during entity loading
 */
export interface LoadError {
    /** The record that caused the error */
    readonly record: JsonObject;
    /** Human-readable error message */
    readonly message: string;
    /** Field that caused the error */
    readonly field?: string;
    /** Error code for programmatic handling */
    readonly code?: string;
    /** Whether the error can be recovered from */
    readonly recoverable?: boolean;
}

/**
 * Error that occurred during data export
 */
export interface ExportError {
    /** The record that caused the error */
    readonly record: JsonObject;
    /** Human-readable error message */
    readonly message: string;
    /** Error code for programmatic handling */
    readonly code?: string;
    /** Whether the error can be recovered from */
    readonly recoverable?: boolean;
}

/**
 * Error that occurred during sink/indexing operations
 */
export interface SinkError {
    /** The record that caused the error */
    readonly record: JsonObject;
    /** Human-readable error message */
    readonly message: string;
    /** HTTP status code if applicable */
    readonly statusCode?: number;
}

/**
 * Result of executing a single step
 */
export interface StepExecutionResult {
    /** Unique key identifying the step */
    stepKey: string;
    /** Type of the step */
    type: string;
    /** Output records from the step */
    records: readonly JsonObject[];
    /** Step execution metrics */
    metrics: StepMetrics;
    /** Errors that occurred during execution */
    errors?: readonly StepError[];
}

/**
 * Result of a load operation
 */
export interface LoadResult {
    /** Number of successfully loaded records */
    succeeded: number;
    /** Number of failed records */
    failed: number;
    /** Number of new records created */
    created?: number;
    /** Number of existing records updated */
    updated?: number;
    /** Number of skipped records */
    skipped?: number;
    /** Errors that occurred during loading */
    errors?: readonly LoadError[];
    /** IDs of affected entities */
    affectedIds?: readonly string[];
}

/**
 * Result of an export operation
 */
export interface ExportResult {
    /** Number of successfully exported records */
    succeeded: number;
    /** Number of failed records */
    failed: number;
    /** Total number of exported records */
    exported?: number;
    /** Number of skipped records */
    skipped?: number;
    /** Errors that occurred during export */
    errors?: readonly ExportError[];
    /** Path to the output file */
    outputPath?: string;
    /** URL to access the exported data */
    outputUrl?: string;
    /** Additional metadata about the export */
    metadata?: JsonObject;
}

/**
 * Result of a sink/indexing operation
 */
export interface SinkResult {
    /** Number of records indexed */
    indexed: number;
    /** Number of records deleted */
    deleted: number;
    /** Number of failed operations */
    failed: number;
    /** Errors that occurred during sinking */
    errors?: readonly SinkError[];
}

/**
 * Result of validating a batch of records
 */
export interface ValidationResult {
    /** Records that passed validation */
    valid: readonly JsonObject[];
    /** Records that failed validation with their errors */
    invalid: readonly InvalidRecord[];
}

/**
 * A record that failed validation along with its errors
 */
export interface InvalidRecord {
    /** The record that failed validation */
    readonly record: JsonObject;
    /** Validation errors for this record */
    readonly errors: readonly ValidationErrorRecord[];
}

/**
 * Validation error for a specific field in a record
 */
export interface ValidationErrorRecord {
    /** Field that failed validation */
    readonly field?: string;
    /** Validation rule that failed */
    readonly rule: string;
    /** Human-readable error message */
    readonly message: string;
    /** Error code for programmatic handling */
    readonly code?: string;
}
