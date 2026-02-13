/**
 * DataHub Logger Types
 *
 * Type definitions for the structured logging system.
 */

import { ID } from '@vendure/core';

/**
 * Log context for structured logging - provides trace context
 */
export interface LogContext {
    /** Pipeline run ID - serves as the trace ID */
    runId?: ID;

    /** Pipeline ID */
    pipelineId?: ID;

    /** Pipeline code */
    pipelineCode?: string;

    /** Entity type being processed */
    entityType?: string;

    /** Step key in pipeline - serves as span identifier */
    stepKey?: string;

    /** User ID who triggered the operation */
    userId?: string;

    /** Channel code */
    channelCode?: string;

    /** Parent span ID for nested operations */
    parentSpanId?: string;

    /** Current span ID */
    spanId?: string;
}

/**
 * Metadata for log entries - structured data for observability
 */
export interface LogMetadata {
    /** Number of records processed */
    recordCount?: number;

    /** Number of records that failed */
    recordsFailed?: number;

    /** Number of records that succeeded */
    recordsSucceeded?: number;

    /** Duration in milliseconds */
    durationMs?: number;

    /** Throughput (records per second) */
    throughput?: number;

    /** Error code for categorization */
    errorCode?: string;

    /** Error category */
    errorCategory?: 'validation' | 'network' | 'timeout' | 'permission' | 'data' | 'system' | 'unknown';

    /** Step type */
    stepType?: string;

    /** Adapter code */
    adapterCode?: string;

    /** Any additional metadata */
    [key: string]: unknown;
}

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Span status for telemetry
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Span data for trace tracking
 */
export interface SpanData {
    /** Unique span identifier */
    spanId: string;

    /** Parent span ID (for nesting) */
    parentSpanId?: string;

    /** Span name (operation being tracked) */
    name: string;

    /** Start time */
    startTime: number;

    /** End time (set when span ends) */
    endTime?: number;

    /** Span status */
    status?: SpanStatus;

    /** Attributes associated with the span */
    attributes: Record<string, unknown>;

    /** Events that occurred during the span */
    events: SpanEvent[];
}

/**
 * Event within a span
 */
interface SpanEvent {
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
}

/**
 * Metrics types
 */
interface MetricValue {
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp: number;
}

/**
 * Counter metric for tracking counts
 */
export interface Counter {
    name: string;
    description?: string;
    increment(value?: number, labels?: Record<string, string>): void;
    getValue(labels?: Record<string, string>): number;
}

/**
 * Histogram metric for tracking distributions
 */
export interface Histogram {
    name: string;
    description?: string;
    record(value: number, labels?: Record<string, string>): void;
    getPercentile(percentile: number, labels?: Record<string, string>): number | undefined;
    getCount(labels?: Record<string, string>): number;
    getSum(labels?: Record<string, string>): number;
}

/**
 * Error details with cause chain, stack traces, and categorization
 */
export interface ErrorDetails {
    message: string;
    code?: string;
    category?: LogMetadata['errorCategory'];
    stack?: string;
    cause?: ErrorDetails;
    context?: Record<string, unknown>;
}
