/**
 * Error Types
 *
 * Error types for pipeline processing including severity levels, error stages,
 * and structured error information.
 */

/**
 * Severity level of an error
 *
 * NOTE: This type alias must match the ErrorSeverity enum values in
 * src/constants/error-codes.ts. Keep in sync when modifying either.
 */
export type ErrorSeverity = 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';

/**
 * Pipeline stage where error occurred (not to be confused with ErrorCategory enum)
 */
export type PipelineErrorStage =
    | 'EXTRACTION'
    | 'TRANSFORMATION'
    | 'VALIDATION'
    | 'LOADING'
    | 'CONNECTION'
    | 'AUTHENTICATION'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'CONFIGURATION'
    | 'SYSTEM'
    | 'UNKNOWN';

/**
 * Structured error information for pipeline execution failures
 */
export interface PipelineError {
    /** ID of the step where error occurred */
    stepId?: string;
    /** Index of the record that caused the error */
    recordIndex?: number;
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional details about the error */
    details?: string;
    /** Severity level of the error */
    severity?: ErrorSeverity;
    /** Pipeline stage where error occurred */
    stage?: PipelineErrorStage;
    /** Additional context data */
    context?: Record<string, unknown>;
    /** Stack trace if available */
    stack?: string;
    /** ISO timestamp of when error occurred */
    timestamp?: string;
    /** Whether the error can be recovered from */
    recoverable?: boolean;
    /** Suggested recovery action */
    recovery?: string;
}

/**
 * Error information for a specific record
 */
export interface RecordError {
    /** Index of the record in the batch */
    recordIndex: number;
    /** The record that caused the error */
    record?: Record<string, unknown>;
    /** Field that caused the error */
    field?: string;
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional details about the error */
    details?: string;
    /** Whether the operation can be retried */
    retriable?: boolean;
    /** Number of retry attempts made */
    retryCount?: number;
}

/**
 * Error information for a pipeline step execution
 */
export interface PipelineStepError {
    /** Unique identifier of the step */
    stepId: string;
    /** Type of the step (e.g., 'EXTRACT', 'TRANSFORM', 'LOAD') */
    stepType: string;
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional details about the error */
    details?: string;
    /** Individual record errors within this step */
    recordErrors?: RecordError[];
    /** Whether the step can be retried */
    retriable?: boolean;
    /** Duration of the step execution in milliseconds */
    durationMs?: number;
}

/** Standard error codes used throughout the pipeline system */
export const ERROR_CODES = {
    EXTRACTION_FAILED: 'EXTRACTION_FAILED',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    SOURCE_UNREACHABLE: 'SOURCE_UNREACHABLE',
    INVALID_RESPONSE: 'INVALID_RESPONSE',
    PARSE_ERROR: 'PARSE_ERROR',
    TRANSFORM_FAILED: 'TRANSFORM_FAILED',
    INVALID_MAPPING: 'INVALID_MAPPING',
    INVALID_EXPRESSION: 'INVALID_EXPRESSION',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
    INVALID_FORMAT: 'INVALID_FORMAT',
    OUT_OF_RANGE: 'OUT_OF_RANGE',
    LOAD_FAILED: 'LOAD_FAILED',
    ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
    DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
    CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    TIMEOUT: 'TIMEOUT',
    RATE_LIMITED: 'RATE_LIMITED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    OUT_OF_MEMORY: 'OUT_OF_MEMORY',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

// NOTE: getErrorSeverity() is intentionally NOT exported from shared/types.
// Use the authoritative implementation from src/constants/error-codes.ts instead.
// That version handles both shared and pipeline-specific error codes.
