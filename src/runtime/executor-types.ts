import { JsonObject, JsonValue, ErrorHandlingConfig, CheckpointingConfig, ExecutorContext as SharedExecutorContext } from '../types/index';

export type RecordObject = JsonObject;

/**
 * Represents branched output from a route step
 */
export type BranchOutput = { __branchOutputs: true; branches: Record<string, RecordObject[]> };

/**
 * Type guard for BranchOutput
 */
export function isBranchOutput(val: unknown): val is BranchOutput {
    return !!val && typeof val === 'object' && (val as BranchOutput).__branchOutputs === true && typeof (val as BranchOutput).branches === 'object';
}

/**
 * Callback for reporting record-level errors during pipeline execution
 */
export type OnRecordErrorCallback = (stepKey: string, message: string, payload: RecordObject) => Promise<void>;

/**
 * Common interface for checkpoint data management.
 * Uses Record<string, JsonValue> to match JsonObject structure for serialization.
 */
export interface CheckpointData {
    [stepKey: string]: Record<string, JsonValue>;
}

/**
 * Runtime ExecutorContext - extends the shared base with runtime-specific fields
 * (errorHandling, checkpointing). The shared base (from shared/types/pipeline.types.ts)
 * provides the core checkpoint management contract (cpData, cpDirty, markCheckpointDirty).
 */
export interface ExecutorContext extends SharedExecutorContext {
    /** Error handling configuration from pipeline context */
    errorHandling?: ErrorHandlingConfig;
    /** Checkpointing configuration from pipeline context */
    checkpointing?: CheckpointingConfig;
}

/**
 * Result from loader/exporter/feed/sink execution
 */
export interface ExecutionResult {
    ok: number;
    fail: number;
}

/**
 * Result from feed execution including output path
 */
export interface FeedExecutionResult extends ExecutionResult {
    outputPath?: string;
}
