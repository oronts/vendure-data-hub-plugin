import { RequestContext, ID } from '@vendure/core';
import { JsonObject, PipelineDefinition, PipelineMetrics, PipelineCheckpoint, HookStage } from '../../types/index';
import { RunStatus } from '../../constants/enums';
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

    onCancelRequested(): Promise<boolean>;
    onRecordError(stepKey: string, message: string, payload: JsonObject): Promise<void>;
    onProgress(metrics: Partial<PipelineMetrics>): Promise<void>;
}

// HOOK TYPES

/**
 * SDK HookContext - runtime hook context with Vendure RequestContext.
 * All fields are readonly (immutable contract for hook implementors).
 *
 * Parallel definition in shared/types/hook.types.ts is the serializable
 * format with string IDs, `metadata` field, and no Vendure RequestContext.
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
export type PipelineRunStatus = `${RunStatus}`;

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
