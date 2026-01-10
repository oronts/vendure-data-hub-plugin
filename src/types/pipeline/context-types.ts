/**
 * Pipeline Context Type Definitions
 *
 * Types related to pipeline execution context and runtime state.
 * Uses enums from constants for consistency.
 */

import { RunMode, ChannelStrategy, ValidationMode, DrainStrategy } from '../../constants/index';
import { JsonObject, JsonValue } from '../common';
import { Throughput } from './step-types';

// PIPELINE CONTEXT

/**
 * Late event handling policy
 */
export interface LateEventPolicy {
    /** How to handle late events */
    policy: 'drop' | 'buffer';
    /** Buffer duration in milliseconds */
    bufferMs?: number;
}

/**
 * Error handling configuration for pipeline execution
 */
export interface ErrorHandlingConfig {
    /** Maximum retry attempts for failed operations */
    maxRetries?: number;
    /** Initial delay between retries in milliseconds */
    retryDelayMs?: number;
    /** Maximum delay between retries */
    maxRetryDelayMs?: number;
    /** Backoff multiplier for exponential backoff */
    backoffMultiplier?: number;
    /** Whether to use dead letter queue for failed records */
    deadLetterQueue?: boolean;
    /** Whether to alert when records go to dead letter queue */
    alertOnDeadLetter?: boolean;
    /** Error threshold percentage to pause pipeline */
    errorThresholdPercent?: number;
}

/**
 * Checkpointing configuration for resumable execution
 */
export interface CheckpointingConfig {
    /** Whether checkpointing is enabled */
    enabled?: boolean;
    /** Checkpoint strategy: 'count' (every N records), 'timestamp', 'interval' */
    strategy?: 'count' | 'timestamp' | 'interval';
    /** For 'count' strategy: checkpoint every N records */
    intervalRecords?: number;
    /** For 'interval' strategy: checkpoint every N milliseconds */
    intervalMs?: number;
    /** For 'timestamp' strategy: field to use for timestamp */
    field?: string;
}

/**
 * Pipeline execution context
 *
 * Provides runtime configuration and state for pipeline execution.
 */
export interface PipelineContext {
    /** Channel code for single-channel execution */
    channel?: string;
    /** Content language code (e.g., 'en', 'de') */
    contentLanguage?: string;
    /** Channel assignment strategy */
    channelStrategy?: 'explicit' | 'inherit' | 'multi';
    /** Explicit channel IDs for multi-channel mode */
    channelIds?: string[];
    /** Validation strictness mode */
    validationMode?: 'strict' | 'lenient';
    /** Field for idempotency key extraction */
    idempotencyKeyField?: string;
    /** Pipeline run mode */
    runMode?: 'sync' | 'async' | 'batch' | 'stream';
    /** Throughput control settings */
    throughput?: Throughput;
    /** Late event handling */
    lateEvents?: LateEventPolicy;
    /** Watermark for event time processing */
    watermarkMs?: number;
    /** Error handling configuration */
    errorHandling?: ErrorHandlingConfig;
    /** Checkpointing configuration for resumable execution */
    checkpointing?: CheckpointingConfig;
}

/**
 * Pipeline checkpoint for resumable execution
 */
export interface PipelineCheckpoint extends JsonObject {}

/**
 * Checkpoint data keyed by step
 */
export interface CheckpointData {
    [stepKey: string]: Record<string, JsonValue>;
}

// EXECUTOR CONTEXT

/**
 * Context passed to executors for accessing services and state
 */
export interface ExecutorContext {
    /** Checkpoint data for resumable extraction */
    cpData: CheckpointData | null;
    /** Flag indicating whether checkpoint data has changed */
    cpDirty: boolean;
    /** Marks the checkpoint as dirty */
    markCheckpointDirty: () => void;
}

// RUNTIME CONTEXT TYPES

/**
 * Operator context for transform operations
 */
export interface OperatorContextData {
    /** Current pipeline context */
    pipelineContext: PipelineContext;
    /** Step key being executed */
    stepKey: string;
}

/**
 * Loader context for entity loading operations
 */
export interface LoaderContextData extends OperatorContextData {
    /** Whether this is a dry run */
    dryRun: boolean;
    /** Channel strategy for entity assignment */
    channelStrategy: 'explicit' | 'inherit' | 'multi';
    /** Target channel IDs */
    channels: readonly string[];
    /** Language strategy */
    languageStrategy: 'specific' | 'fallback' | 'multi';
    /** Validation mode */
    validationMode: 'strict' | 'lenient';
    /** Conflict resolution strategy */
    conflictStrategy: 'source-wins' | 'vendure-wins' | 'merge' | 'manual-queue';
}

/**
 * Extractor context for data extraction operations
 */
export interface ExtractorContextData {
    /** Step key being executed */
    stepKey: string;
    /** Current checkpoint data */
    checkpoint: PipelineCheckpoint;
    /** Set new checkpoint data */
    setCheckpoint: (data: JsonObject) => void;
}
