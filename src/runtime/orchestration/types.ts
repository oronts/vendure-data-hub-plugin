/**
 * Orchestration Types
 *
 * Type definitions for pipeline execution orchestration.
 */

import { RequestContext, ID } from '@vendure/core';
import { RecordObject, BranchOutput } from '../executor-types';

/**
 * Step logging callback for database persistence
 */
export interface StepLogCallback {
    /** Log step start */
    onStepStart?: (ctx: RequestContext, stepKey: string, stepType: string, recordsIn: number) => Promise<void>;
    /** Log step complete with details */
    onStepComplete?: (ctx: RequestContext, info: StepLogInfo) => Promise<void>;
    /** Log step failure */
    onStepFailed?: (ctx: RequestContext, stepKey: string, stepType: string, error: Error, durationMs: number) => Promise<void>;
    /** Log extracted source data (DEBUG level) */
    onExtractData?: (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => Promise<void>;
    /** Log data before load (DEBUG level) */
    onLoadData?: (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => Promise<void>;
    /** Log field mappings from transform (DEBUG level) */
    onTransformMapping?: (ctx: RequestContext, stepKey: string, adapterCode: string, inputRecord: RecordObject, outputRecord: RecordObject) => Promise<void>;
}

/**
 * Step execution log info
 */
export interface StepLogInfo {
    stepKey: string;
    stepType: string;
    adapterCode?: string;
    recordsIn: number;
    recordsOut: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    sampleInput?: RecordObject;
    sampleOutput?: RecordObject;
}

/**
 * Execution logging context
 */
export interface ExecutionLogContext {
    pipelineId?: ID;
    runId?: ID;
}

/**
 * Pipeline edge connecting two steps
 */
export interface PipelineEdge {
    from: string;
    to: string;
    branch?: string;
}

/**
 * Graph execution result
 */
export interface GraphExecutionResult {
    processed: number;
    succeeded: number;
    failed: number;
    details: Array<Record<string, any>>;
    counters: Record<string, number>;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
    output: RecordObject[] | BranchOutput;
    detail: Record<string, any>;
    processed: number;
    succeeded: number;
    failed: number;
    counters: Record<string, number>;
    event?: { type: string; data: any };
}

/**
 * Topology data structure for graph traversal
 */
export interface TopologyData {
    preds: Map<string, Array<{ from: string; branch?: string }>>;
    indeg: Map<string, number>;
    queue: string[];
}
