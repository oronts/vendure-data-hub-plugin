/**
 * Step Types
 *
 * Types for pipeline steps including step definitions, execution results,
 * and routing configuration.
 */

import { JsonObject, JsonValue } from './json.types';

/**
 * Type of pipeline step.
 *
 * This is a string literal union type (not an enum) intentionally.
 * The shared/types module uses string literals for type-safe JSON compatibility,
 * allowing pipeline definitions to be serialized/deserialized without enum value issues.
 *
 * The backend uses the StepType enum from src/constants/enums.ts for runtime operations.
 * Both define the same values, ensuring type compatibility at the boundary.
 *
 * @see src/constants/enums.ts StepType enum for the backend runtime version
 */
export type StepType =
    | 'TRIGGER'
    | 'EXTRACT'
    | 'TRANSFORM'
    | 'VALIDATE'
    | 'ENRICH'
    | 'ROUTE'
    | 'LOAD'
    | 'EXPORT'
    | 'FEED'
    | 'SINK';

/** Execution status of a pipeline node/step */
export type NodeStatus =
    | 'IDLE'
    | 'PENDING'
    | 'RUNNING'
    | 'SUCCESS'
    | 'ERROR'
    | 'SKIPPED'
    | 'CANCELLED';

/**
 * Drain strategies - matches src/constants/enums.ts DrainStrategy values
 */
export type DrainStrategy = 'BACKOFF' | 'SHED' | 'QUEUE';

/**
 * Channel strategies - matches src/constants/enums.ts ChannelStrategy values
 */
export type ChannelStrategy = 'EXPLICIT' | 'INHERIT' | 'MULTI';

/**
 * Validation modes - matches src/constants/enums.ts ValidationMode values
 */
export type ValidationModeType = 'STRICT' | 'LENIENT';

/**
 * Run modes - matches src/constants/enums.ts RunMode values
 */
type RunModeType = 'SYNC' | 'ASYNC' | 'BATCH' | 'STREAM';

/**
 * Route condition operators - matches src/constants/enums.ts RouteConditionOperator values
 */
export type RouteConditionOp =
    | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
    | 'in' | 'notIn'
    | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'matches' | 'regex' | 'exists' | 'isNull';

/** Domain that a pipeline operates on */
export type PipelineCapabilityDomain =
    | 'CATALOG'
    | 'CUSTOMERS'
    | 'ORDERS'
    | 'PROMOTIONS'
    | 'INVENTORY'
    | 'CUSTOM';

/**
 * Result of executing a pipeline step
 */
export interface StepResult {
    /** Unique key identifying the step */
    stepKey: string;
    /** Final status of the step */
    status: NodeStatus;
    /** Number of input records */
    inputCount: number;
    /** Number of output records */
    outputCount: number;
    /** Number of records with errors */
    errorCount: number;
    /** Number of records dropped */
    droppedCount: number;
    /** Duration in milliseconds */
    duration: number;
    /** Errors that occurred */
    errors?: StepError[];
    /** Additional metadata */
    meta?: JsonObject;
}

/**
 * Error that occurred during step execution
 */
export interface StepError {
    /** Human-readable error message */
    message: string;
    /** Error code for programmatic handling */
    code?: string;
    /** Field that caused the error */
    field?: string;
    /** Index of the record that caused the error */
    recordIndex?: number;
    /** ID of the record that caused the error */
    recordId?: string;
    /** Stack trace if available */
    stack?: string;
    /** Whether the operation can be retried */
    retryable?: boolean;
}

/**
 * Throughput configuration for controlling processing rate
 */
export interface Throughput {
    rateLimitRps?: number;
    concurrency?: number;
    batchSize?: number;
    pauseOnErrorRate?: {
        threshold: number;
        intervalSec: number;
    };
    drainStrategy?: DrainStrategy;
}

/**
 * Definition of a pipeline step
 */
export interface PipelineStepDefinition {
    /** Unique key identifying the step */
    key: string;
    /** Type of step */
    type: StepType;
    /** Code of the adapter to use */
    adapterCode?: string;
    /** Human-readable name */
    name?: string;
    /** Display label */
    label?: string;
    /** Description of what the step does */
    description?: string;
    /** Configuration for the adapter */
    config: JsonObject;
    /** Execution order (for sequential steps) */
    order?: number;
    /** Whether the step is disabled */
    disabled?: boolean;
    /** Whether to run in parallel with other steps */
    parallel?: boolean;
    /** Whether to run asynchronously */
    async?: boolean;
    /** Number of concurrent operations */
    concurrency?: number;
    /** Throughput/rate limiting configuration */
    throughput?: Throughput;
    /** Number of retry attempts */
    retries?: number;
    /** Delay between retries in milliseconds */
    retryDelayMs?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Whether to continue pipeline on step error */
    continueOnError?: boolean;
    /** Condition expression to evaluate */
    condition?: string;
    /** Input step keys this step depends on */
    inputs?: string[];
    /** Output step keys this step feeds into */
    outputs?: string[];
}

/**
 * Edge connecting two steps in the pipeline graph
 */
export interface PipelineEdge {
    /** Unique identifier for the edge */
    id?: string;
    /** Source step key */
    from: string;
    /** Target step key */
    to: string;
    /** Branch name (for routing steps) */
    branch?: string;
    /** Condition expression for conditional edges */
    condition?: string;
    /** Display label for the edge */
    label?: string;
}

/**
 * Metrics collected during step execution
 */
export interface StepMetrics {
    /** Number of input records */
    inputRecords: number;
    /** Number of output records */
    outputRecords: number;
    /** Number of records with errors */
    errorRecords: number;
    /** Number of dropped records */
    droppedRecords: number;
    /** Duration in milliseconds */
    duration: number;
    /** Records processed per second */
    throughput: number;
    /** Memory used in bytes */
    memoryUsed?: number;
}

/**
 * Execution state of a pipeline step
 */
export interface StepExecution {
    /** Unique key identifying the step */
    stepKey: string;
    /** Current execution status */
    status: NodeStatus;
    /** When execution started */
    startedAt?: Date;
    /** When execution completed */
    completedAt?: Date;
    /** Execution metrics */
    metrics?: StepMetrics;
    /** Errors that occurred */
    errors?: StepError[];
    /** Checkpoint data for resumable steps */
    checkpoint?: JsonObject;
}

/**
 * Step context override - per-step configuration overrides
 */
export interface StepContextOverride {
    contentLanguage?: string;
    channelStrategy?: ChannelStrategy;
    channelIds?: string[];
    validationMode?: ValidationModeType;
    runMode?: RunModeType;
}

/**
 * Route condition definition
 */
export interface RouteCondition {
    field: string;
    cmp: RouteConditionOp;
    value: JsonValue;
}

/**
 * Route branch definition
 */
export interface RouteBranch {
    name: string;
    when: RouteCondition[];
}

/**
 * Route step configuration
 */
export interface RouteStepConfig {
    branches: RouteBranch[];
}

/**
 * Pipeline capabilities declaration
 */
export interface PipelineCapabilities {
    writes?: PipelineCapabilityDomain[];
    requires?: string[];
    streamSafe?: boolean;
}
