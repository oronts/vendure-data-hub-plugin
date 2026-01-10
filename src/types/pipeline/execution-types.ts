/**
 * Execution Type Definitions
 *
 * Types related to pipeline execution results, metrics, and errors.
 * Uses enums from constants for consistency.
 */

import { RunStatus, ErrorCategory } from '../../constants/index';
import { JsonObject, JsonValue } from '../common';

// RUN STATUS

/**
 * Pipeline run status (string literal for convenience)
 *
 * @deprecated Use RunStatus enum from constants instead
 */
export type PipelineRunStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'PARTIAL';

// METRICS

/**
 * Pipeline run metrics
 */
export interface PipelineRunMetrics {
    /** Total number of input records */
    totalRecords: number;
    /** Number of records processed */
    processed: number;
    /** Number of successfully processed records */
    succeeded: number;
    /** Number of failed records */
    failed: number;
    /** Number of skipped records */
    skipped: number;
    /** Number of created entities */
    created: number;
    /** Number of updated entities */
    updated: number;
    /** Total execution duration in milliseconds */
    durationMs: number;
}

/**
 * Pipeline metrics (flexible for runtime updates)
 */
export interface PipelineMetrics {
    totalRecords?: number;
    processed?: number;
    succeeded?: number;
    failed?: number;
    durationMs?: number;
    [key: string]: JsonValue | undefined;
}

/**
 * Step-level metrics
 */
export interface StepMetrics {
    /** Number of input records to step */
    inputCount: number;
    /** Number of output records from step */
    outputCount: number;
    /** Step execution duration in milliseconds */
    durationMs: number;
    /** Number of successful operations */
    succeeded: number;
    /** Number of failed operations */
    failed: number;
}

// ERRORS

/**
 * Pipeline error record for tracking failures
 */
export interface PipelineError {
    /** Index of the failed record in the batch */
    recordIndex: number;
    /** The record that caused the error */
    record: JsonObject;
    /** Error message */
    error: string;
    /** Field that caused the error (if applicable) */
    field?: string;
    /** Error code for categorization */
    code?: string;
    /** Whether this error is recoverable (can retry) */
    recoverable: boolean;
    /** Timestamp when error occurred */
    timestamp: Date;
}

/**
 * Step-level error
 */
export interface StepError {
    /** Error message */
    message: string;
    /** Record that caused the error */
    record?: JsonObject;
    /** Error code */
    code?: string;
}

/**
 * Operator error
 */
export interface OperatorError {
    /** Record that caused the error */
    record: JsonObject;
    /** Error message */
    message: string;
    /** Field that caused the error */
    field?: string;
}

/**
 * Load error for entity loading operations
 */
export interface LoadError {
    /** Record that caused the error */
    record: JsonObject;
    /** Error message */
    message: string;
    /** Field that caused the error */
    field?: string;
    /** Error code */
    code?: string;
    /** Whether error is recoverable */
    recoverable?: boolean;
}

/**
 * Export error for export operations
 */
export interface ExportError {
    /** Record that caused the error */
    record: JsonObject;
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
    /** Whether error is recoverable */
    recoverable?: boolean;
}

/**
 * Sink error for indexing operations
 */
export interface SinkError {
    /** Record that caused the error */
    record: JsonObject;
    /** Error message */
    message: string;
    /** HTTP status code (if applicable) */
    statusCode?: number;
}

// EXECUTION RESULTS

/**
 * Basic execution result
 */
export interface ExecutionResult {
    /** Number of successful operations */
    ok: number;
    /** Number of failed operations */
    fail: number;
}

/**
 * Feed execution result with output path
 */
export interface FeedExecutionResult extends ExecutionResult {
    /** Path to generated feed file */
    outputPath?: string;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
    /** Step key */
    stepKey: string;
    /** Step type */
    type: string;
    /** Output records from step */
    records: readonly JsonObject[];
    /** Step metrics */
    metrics: StepMetrics;
    /** Errors encountered during step execution */
    errors?: readonly StepError[];
}

/**
 * Operator execution result
 */
export interface OperatorResult {
    /** Output records */
    records: readonly JsonObject[];
    /** Number of dropped records */
    dropped?: number;
    /** Errors encountered */
    errors?: readonly OperatorError[];
}

/**
 * Load execution result
 */
export interface LoadResult {
    /** Number of successful loads */
    succeeded: number;
    /** Number of failed loads */
    failed: number;
    /** Number of created entities */
    created?: number;
    /** Number of updated entities */
    updated?: number;
    /** Number of skipped records */
    skipped?: number;
    /** Load errors */
    errors?: readonly LoadError[];
    /** IDs of affected entities */
    affectedIds?: readonly string[];
}

/**
 * Export execution result
 */
export interface ExportResult {
    /** Number of successful exports */
    succeeded: number;
    /** Number of failed exports */
    failed: number;
    /** Number of exported records */
    exported?: number;
    /** Number of skipped records */
    skipped?: number;
    /** Export errors */
    errors?: readonly ExportError[];
    /** Output file path */
    outputPath?: string;
    /** Output URL */
    outputUrl?: string;
    /** Additional metadata */
    metadata?: JsonObject;
}

/**
 * Sink execution result
 */
export interface SinkResult {
    /** Number of indexed documents */
    indexed: number;
    /** Number of deleted documents */
    deleted: number;
    /** Number of failed operations */
    failed: number;
    /** Sink errors */
    errors?: readonly SinkError[];
}

/**
 * Validation result
 */
export interface ValidationResult {
    /** Valid records */
    valid: readonly JsonObject[];
    /** Invalid records with errors */
    invalid: readonly InvalidRecord[];
}

/**
 * Invalid record with validation errors
 */
export interface InvalidRecord {
    /** The invalid record */
    record: JsonObject;
    /** Validation errors */
    errors: readonly ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
    /** Field that failed validation */
    field?: string;
    /** Validation rule that failed */
    rule: string;
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
}
