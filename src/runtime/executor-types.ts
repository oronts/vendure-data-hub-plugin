import {
    JsonObject,
    JsonValue,
    ErrorHandlingConfig,
    ExecutorContext as SharedExecutorContext,
    PipelineContext,
} from '../types/index';
import type { ID } from '@vendure/core';

/**
 * Placeholder pipeline ID used when executing operators/adapters in sandbox mode
 * (e.g., preview, test, or isolated transform execution outside a real pipeline run).
 */
export const SANDBOX_PIPELINE_ID = '0';

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
 * Callback for reporting record-level errors during pipeline execution.
 * The optional stackTrace parameter carries the JS stack for debugging.
 */
export type OnRecordErrorCallback = (stepKey: string, message: string, payload: RecordObject, stackTrace?: string) => Promise<void>;

/**
 * Common interface for checkpoint data management.
 * Uses Record<string, JsonValue> to match JsonObject structure for serialization.
 */
export interface CheckpointData {
    [stepKey: string]: Record<string, JsonValue>;
}

/**
 * Runtime ExecutorContext - extends the shared base with runtime-specific fields.
 * The shared base (from shared/types/pipeline.types.ts)
 * provides the core checkpoint management contract (cpData, cpDirty, markCheckpointDirty).
 */
export interface ExecutorContext extends SharedExecutorContext {
    runId?: ID;
    /** Error handling configuration from pipeline context */
    errorHandling?: ErrorHandlingConfig;
    /** Cancellation check callback - returns true when the run has been cancelled */
    onCancelRequested?: () => Promise<boolean>;
    /** Maximum records materialized by preview and sandbox extraction */
    recordLimit?: number;
    /** Pipeline-level context used to resolve per-step dry-run behavior */
    definitionContext?: PipelineContext;
}

/**
 * Result from loader/exporter/feed/sink execution
 */
export interface ExecutionResult {
    ok: number;
    fail: number;
    /** Optional error message when the entire execution fails */
    error?: string;
}

/**
 * Result from record loaders, which distinguish intentional skips from writes.
 */
export interface LoaderExecutionResult extends ExecutionResult {
    skipped: number;
}

/**
 * Result from feed execution including output path
 */
export interface FeedExecutionResult extends ExecutionResult {
    outputPath?: string;
}
