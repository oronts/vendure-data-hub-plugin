/**
 * Pipeline Types - SDK types for pipeline execution and hooks
 *
 * These types define the runtime execution context for pipelines,
 * including hook registration and lifecycle management.
 *
 * @module sdk/types/pipeline-types
 */

import { RequestContext, ID } from '@vendure/core';
import { JsonObject, PipelineDefinition, PipelineMetrics, PipelineCheckpoint, HookStage } from '../../types/index';
import { SecretResolver, ConnectionResolver, AdapterLogger } from './connection-types';

// PIPELINE EXECUTION CONTEXT

/**
 * Runtime context for pipeline execution
 */
export interface PipelineExecutionContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Current run ID */
    readonly runId: ID;
    /** Pipeline definition */
    readonly definition: PipelineDefinition;
    /** Whether this is a dry run */
    readonly dryRun: boolean;
    /** Checkpoint data for incremental processing */
    readonly checkpoint: PipelineCheckpoint;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger */
    readonly logger: AdapterLogger;

    /**
     * Check if cancellation has been requested
     * @returns True if cancellation was requested
     */
    onCancelRequested(): Promise<boolean>;

    /**
     * Report a record-level error
     * @param stepKey Step where error occurred
     * @param message Error message
     * @param payload Error payload/record
     */
    onRecordError(stepKey: string, message: string, payload: JsonObject): Promise<void>;

    /**
     * Report progress metrics
     * @param metrics Partial metrics to update
     */
    onProgress(metrics: Partial<PipelineMetrics>): Promise<void>;
}

// HOOK TYPES

/**
 * Context provided to hook handlers
 */
export interface HookContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Current run ID */
    readonly runId: ID;
    /** Hook stage that triggered */
    readonly stage: HookStage;
    /** Step key (for step-level hooks) */
    readonly stepKey?: string;
    /** Records available at this stage */
    readonly records?: readonly JsonObject[];
    /** Error (for error hooks) */
    readonly error?: Error;
}

/**
 * Hook handler function type
 */
export type HookHandler = (context: HookContext) => Promise<void>;

/**
 * Hook registration configuration
 */
export interface HookRegistration {
    /** Hook stage to listen to */
    readonly stage: HookStage;
    /** Handler function */
    readonly handler: HookHandler;
    /** Priority (higher = runs first) */
    readonly priority?: number;
}

// PIPELINE RUN TYPES

/**
 * Input for triggering a pipeline run
 */
export interface PipelineRunInput {
    /** Pipeline ID to run */
    readonly pipelineId: ID;
    /** Optional trigger data */
    readonly triggerData?: JsonObject;
    /** Whether this is a dry run */
    readonly dryRun?: boolean;
    /** Specific step to start from */
    readonly fromStep?: string;
    /** Checkpoint to resume from */
    readonly checkpoint?: PipelineCheckpoint;
}

/**
 * Status of a pipeline run
 */
export type PipelineRunStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'CANCEL_REQUESTED';

/**
 * Summary of a pipeline run
 */
export interface PipelineRunSummary {
    /** Run ID */
    readonly id: ID;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Pipeline code */
    readonly pipelineCode: string;
    /** Current status */
    readonly status: PipelineRunStatus;
    /** Started timestamp (ISO 8601) */
    readonly startedAt?: string;
    /** Completed timestamp (ISO 8601) */
    readonly completedAt?: string;
    /** Run metrics */
    readonly metrics: PipelineMetrics;
    /** Error message if failed */
    readonly errorMessage?: string;
    /** Whether this was a dry run */
    readonly dryRun: boolean;
}

// PIPELINE BUILDER TYPES

/**
 * Step builder for fluent pipeline construction
 */
export interface StepBuilder {
    /**
     * Set step name
     * @param name Step name
     */
    name(name: string): StepBuilder;

    /**
     * Set step configuration
     * @param config Step configuration
     */
    config(config: JsonObject): StepBuilder;

    /**
     * Set async mode
     * @param async Whether step runs async
     */
    async(async: boolean): StepBuilder;

    /**
     * Set concurrency
     * @param concurrency Max concurrent operations
     */
    concurrency(concurrency: number): StepBuilder;

    /**
     * Build the step definition
     */
    build(): JsonObject;
}

/**
 * Pipeline builder for fluent construction
 */
export interface PipelineBuilder {
    /**
     * Add an extract step
     * @param key Step key
     * @param adapter Adapter code
     */
    extract(key: string, adapter: string): StepBuilder;

    /**
     * Add a transform step
     * @param key Step key
     * @param adapter Adapter code
     */
    transform(key: string, adapter: string): StepBuilder;

    /**
     * Add a validate step
     * @param key Step key
     * @param adapter Adapter code
     */
    validate(key: string, adapter: string): StepBuilder;

    /**
     * Add an enrich step
     * @param key Step key
     * @param adapter Adapter code
     */
    enrich(key: string, adapter: string): StepBuilder;

    /**
     * Add a route step
     * @param key Step key
     */
    route(key: string): StepBuilder;

    /**
     * Add a load step
     * @param key Step key
     * @param adapter Adapter code
     */
    load(key: string, adapter: string): StepBuilder;

    /**
     * Add an export step
     * @param key Step key
     * @param adapter Adapter code
     */
    export(key: string, adapter: string): StepBuilder;

    /**
     * Add a feed step
     * @param key Step key
     * @param adapter Adapter code
     */
    feed(key: string, adapter: string): StepBuilder;

    /**
     * Add a sink step
     * @param key Step key
     * @param adapter Adapter code
     */
    sink(key: string, adapter: string): StepBuilder;

    /**
     * Connect steps with an edge
     * @param from Source step key
     * @param to Target step key
     * @param branch Optional branch name
     */
    edge(from: string, to: string, branch?: string): PipelineBuilder;

    /**
     * Set pipeline context
     * @param context Pipeline context
     */
    context(context: JsonObject): PipelineBuilder;

    /**
     * Add hooks
     * @param hooks Hook configuration
     */
    hooks(hooks: JsonObject): PipelineBuilder;

    /**
     * Build the pipeline definition
     */
    build(): PipelineDefinition;
}

// SCHEMA DEFINITION TYPES

/**
 * Field type for schema definitions
 */
export type SchemaFieldTypeValue = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Field definition in a schema
 */
export interface SchemaFieldDefinition {
    /** Field type */
    readonly type: SchemaFieldTypeValue;
    /** Whether the field is required */
    readonly required?: boolean;
    /** Minimum value (for numbers) */
    readonly min?: number;
    /** Maximum value (for numbers) */
    readonly max?: number;
    /** Minimum length (for strings/arrays) */
    readonly minLength?: number;
    /** Maximum length (for strings/arrays) */
    readonly maxLength?: number;
    /** Regex pattern (for strings) */
    readonly pattern?: string;
    /** Allowed values */
    readonly enum?: readonly JsonObject[];
    /** Description */
    readonly description?: string;
}

/**
 * Complete schema definition
 */
export interface SchemaDefinition {
    /** Schema code */
    readonly code: string;
    /** Schema name */
    readonly name: string;
    /** Schema version */
    readonly version: number;
    /** Field definitions */
    readonly fields: Record<string, SchemaFieldDefinition>;
    /** Schema description */
    readonly description?: string;
}
