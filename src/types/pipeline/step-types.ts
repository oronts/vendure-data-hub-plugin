/**
 * Step Type Definitions
 *
 * Types related to pipeline step definitions and configurations.
 * Uses enums from constants for consistency.
 */

import { StepType } from '../../constants/index';
import { JsonObject, JsonValue } from '../common';

// STEP TYPES

/**
 * Throughput configuration for controlling processing rate
 */
export interface Throughput {
    /** Rate limit in requests/records per second */
    rateLimitRps?: number;
    /** Concurrency level for parallel processing */
    concurrency?: number;
    /** Batch size for grouped processing */
    batchSize?: number;
    /** Pause processing when error rate exceeds threshold */
    pauseOnErrorRate?: {
        threshold: number;
        intervalSec: number;
    };
    /** Strategy when backpressure is detected */
    drainStrategy?: 'backoff' | 'shed' | 'queue';
}

/**
 * Pipeline step definition
 */
export interface PipelineStepDefinition {
    /** Unique key identifying this step */
    key: string;
    /** Step type from StepType enum */
    type: StepType;
    /** Human-readable step name */
    name?: string;
    /** Step-specific configuration */
    config: JsonObject;
    /** Whether step runs asynchronously */
    async?: boolean;
    /** Concurrency level for parallel processing */
    concurrency?: number;
    /** Throughput control settings */
    throughput?: Throughput;
}

/**
 * Step context override - per-step configuration overrides
 */
export interface StepContextOverride {
    contentLanguage?: string;
    channelStrategy?: 'explicit' | 'inherit' | 'multi';
    channelIds?: string[];
    validationMode?: 'strict' | 'lenient';
    runMode?: 'sync' | 'async' | 'batch' | 'stream';
    throughput?: Throughput;
}

// ROUTE STEP TYPES

/**
 * Route condition comparison operators
 */
export type RouteConditionOp = 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';

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

// PIPELINE EDGE

/**
 * Pipeline edge connecting steps
 */
export interface PipelineEdge {
    /** Source step key */
    from: string;
    /** Target step key */
    to: string;
    /** Optional branch name from a route step */
    branch?: string;
}

// PIPELINE CAPABILITIES

/**
 * Pipeline capabilities declaration
 */
export interface PipelineCapabilities {
    /** Entity types the pipeline can write to */
    writes?: Array<'catalog' | 'customers' | 'orders' | 'promotions' | 'inventory' | 'custom'>;
    /** Required permissions/capabilities */
    requires?: string[];
    /** Whether pipeline is safe for streaming mode */
    streamSafe?: boolean;
}
