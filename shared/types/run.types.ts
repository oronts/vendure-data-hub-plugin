/**
 * Run Types
 *
 * Types for pipeline run execution, status tracking, and progress monitoring.
 */

import { JsonObject } from './json.types';
import { StepExecution, StepMetrics } from './step.types';

/** Status of a pipeline run */
export type RunStatus =
    | 'PENDING'
    | 'QUEUED'
    | 'RUNNING'
    | 'PAUSED'
    | 'COMPLETED'
    | 'FAILED'
    | 'TIMEOUT'
    | 'CANCELLED'
    | 'CANCEL_REQUESTED';

/**
 * Source that triggered the pipeline run
 *
 * Uses SCREAMING_SNAKE_CASE matching TriggerType convention.
 */
export type TriggerSource =
    | 'MANUAL'
    | 'SCHEDULE'
    | 'WEBHOOK'
    | 'EVENT'
    | 'FILE'
    | 'MESSAGE'
    | 'API'
    | 'QUEUE'
    | 'DEPENDENCY'
    | 'RETRY';

/**
 * Statistics for a pipeline run
 */
export interface PipelineRunStats {
    /** Total number of records to process */
    totalRecords: number;
    /** Number of records processed so far */
    processedRecords: number;
    /** Number of successfully processed records */
    successfulRecords: number;
    /** Number of failed records */
    failedRecords: number;
    /** Number of skipped records */
    skippedRecords: number;
    /** Number of dropped records */
    droppedRecords: number;
    /** Total duration in milliseconds */
    duration: number;
    /** Records processed per second */
    throughput: number;
    /** Per-step statistics */
    stepStats?: StepMetrics[];
}

/**
 * Error that occurred during a pipeline run
 */
export interface PipelineRunError {
    /** Error code for programmatic handling */
    code?: string;
    /** Human-readable error message */
    message: string;
    /** Step where the error occurred */
    stepKey?: string;
    /** ID of the record that caused the error */
    recordId?: string;
    /** Index of the record in the batch */
    recordIndex?: number;
    /** Field that caused the error */
    field?: string;
    /** When the error occurred */
    timestamp?: Date;
    /** Whether the operation can be retried */
    retryable?: boolean;
    /** Stack trace if available */
    stack?: string;
}

/**
 * Complete information about a pipeline run
 */
export interface PipelineRun {
    /** Unique run identifier */
    id: string | number;
    /** ID of the pipeline being run */
    pipelineId: string | number;
    /** Code of the pipeline being run */
    pipelineCode: string;
    /** Current status of the run */
    status: RunStatus;
    /** What triggered this run */
    triggeredBy: TriggerSource;
    /** When the run was triggered */
    triggeredAt?: Date;
    /** When the run started executing */
    startedAt?: Date;
    /** When the run completed (success or failure) */
    completedAt?: Date;
    /** When the run finished (alias for completedAt) */
    finishedAt?: Date;
    /** Run statistics */
    stats?: PipelineRunStats;
    /** Errors that occurred during the run */
    errors?: PipelineRunError[];
    /** Execution status of each step */
    stepExecutions?: StepExecution[];
    /** Input data for the run */
    input?: JsonObject;
    /** Output data from the run */
    output?: JsonObject;
    /** Checkpoint data for resumable runs */
    checkpoint?: JsonObject;
    /** Number of retry attempts */
    retryCount?: number;
    /** ID of the parent run (for retries) */
    parentRunId?: string | number;
}

/**
 * Summary view of a pipeline run (for listing)
 */
export interface RunSummary {
    /** Unique run identifier */
    id: string | number;
    /** Code of the pipeline */
    pipelineCode: string;
    /** Current status */
    status: RunStatus;
    /** What triggered the run */
    triggeredBy: TriggerSource;
    /** When the run started */
    startedAt?: Date;
    /** When the run finished */
    finishedAt?: Date;
    /** Duration in milliseconds */
    duration?: number;
    /** Total records processed */
    recordCount?: number;
    /** Number of errors */
    errorCount?: number;
}

/**
 * Filter criteria for querying pipeline runs
 */
export interface RunFilter {
    /** Filter by pipeline ID */
    pipelineId?: string | number;
    /** Filter by pipeline code */
    pipelineCode?: string;
    /** Filter by status(es) */
    status?: RunStatus | RunStatus[];
    /** Filter by trigger source(s) */
    triggeredBy?: TriggerSource | TriggerSource[];
    /** Filter runs started after this date */
    startedAfter?: Date;
    /** Filter runs started before this date */
    startedBefore?: Date;
    /** Maximum number of results */
    limit?: number;
    /** Number of results to skip */
    offset?: number;
}

/**
 * Real-time progress information for a running pipeline
 */
export interface RunProgress {
    /** Run identifier */
    runId: string | number;
    /** Current status */
    status: RunStatus;
    /** Progress percentage (0-100) */
    progress: number;
    /** Currently executing step */
    currentStep?: string;
    /** Number of records processed */
    processedRecords: number;
    /** Total records to process (if known) */
    totalRecords?: number;
    /** Number of errors encountered */
    errors: number;
    /** When the run started */
    startedAt?: Date;
    /** Estimated completion time */
    estimatedCompletion?: Date;
}
