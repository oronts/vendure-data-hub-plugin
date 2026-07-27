/**
 * Runtime Configuration Types - Shared type definitions for plugin configuration
 *
 * These types define runtime configuration options that can be shared
 * between frontend and backend.
 */

import type { PipelineDefinition } from './pipeline.types';
import type { JsonObject } from './json.types';

/**
 * Circuit breaker configuration for external calls
 */
export interface CircuitBreakerConfig {
    /** Enable circuit breaker (default: true) */
    enabled?: boolean;
    /** Failure threshold before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Success threshold to close circuit (default: 3) */
    successThreshold?: number;
    /** Time in ms before attempting reset (default: 30000) */
    resetTimeoutMs?: number;
    /** Time window for counting failures in ms (default: 60000) */
    failureWindowMs?: number;
}

/**
 * Scheduler configuration for pipeline scheduling
 */
export interface SchedulerConfig {
    /** Interval for checking cron schedules in milliseconds (default: 30000) */
    checkIntervalMs?: number;
    /** Interval for refreshing schedule cache in milliseconds (default: 60000) */
    refreshIntervalMs?: number;
    /** Minimum allowed interval in milliseconds - safety limit (default: 1000) */
    minIntervalMs?: number;
    /** Maximum enabled, published pipelines inspected per refresh (default/max: 1000) */
    maxPipelineDiscovery?: number;
    /** Maximum active schedules and tracking entries (default/max: 1000) */
    maxTrackingEntries?: number;
    /** Consecutive trigger failures before pausing a schedule (default: 5, max: 100) */
    maxConsecutiveFailures?: number;
}


/**
 * Runtime limits configuration - all configurable via plugin options
 */
export interface RuntimeLimitsConfig {
    /** Circuit breaker configuration */
    circuitBreaker?: CircuitBreakerConfig;
    /** Scheduler configuration for pipeline scheduling */
    scheduler?: SchedulerConfig;
}

/**
 * Code-first pipeline configuration
 */
export interface CodeFirstPipeline {
    /** Unique pipeline identifier */
    code: string;
    /** Human-readable name */
    name: string;
    /** Optional description */
    description?: string;
    /** Whether pipeline is active (enabled) */
    enabled?: boolean;
    /** The pipeline definition */
    definition: PipelineDefinition;
    /** Tags for organization */
    tags?: string[];
}

/**
 * Code-first secret configuration.
 * Define secrets in code (values can reference env vars).
 */
export interface CodeFirstSecret {
    /** Unique secret identifier */
    code: string;
    /** Provider: 'INLINE' for direct value, 'ENV' to read from environment */
    provider: 'INLINE' | 'ENV';
    /** Value or env variable name */
    value: string;
    /** Optional metadata */
    metadata?: JsonObject;
    /** Additional channel codes that may resolve this secret. The default channel always has access. */
    channelCodes?: readonly string[];
}

/**
 * Code-first connection configuration.
 * Define external connections (databases, APIs, etc.) in code.
 */
export interface CodeFirstConnection {
    /** Unique connection identifier */
    code: string;
    /** Connection type (e.g., 'postgres', 'mysql', 'rest', 's3') */
    type: string;
    /** Connection settings - supports env var references like ${DB_HOST} */
    settings: JsonObject;
}
