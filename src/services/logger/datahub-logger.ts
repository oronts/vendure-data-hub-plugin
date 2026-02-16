/**
 * Structured, context-aware logging for the DataHub plugin.
 * Wraps Vendure's Logger with telemetry and metrics capabilities.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ID } from '@vendure/core';

import { MetricStatus, SpanStatus } from '../../constants/enums';
import { CACHE, calculateThroughput } from '../../constants/index';
import { LogContext, LogMetadata, SpanData } from './logger.types';
import { MetricsRegistry } from './metrics';
import { SpanTracker, SpanContext } from './span-tracker';
import { extractErrorDetails } from './error-utils';
import { sanitizeForLog } from './sanitizer';

export class DataHubLogger {
    private readonly nestLogger: Logger;
    private readonly context: LogContext;
    private readonly spanTracker: SpanTracker;
    private currentSpanId?: string;

    constructor(
        private readonly componentName: string,
        context: LogContext = {},
        private readonly metricsRegistry?: MetricsRegistry,
        spanTracker?: SpanTracker,
    ) {
        this.nestLogger = new Logger(`DataHub:${componentName}`);
        this.context = { ...context };
        this.spanTracker = spanTracker ?? new SpanTracker();
    }

    /**
     * Create a new logger with additional context
     * Uses immutable pattern - returns new instance
     */
    withContext(additionalContext: LogContext): DataHubLogger {
        return new DataHubLogger(
            this.componentName,
            { ...this.context, ...additionalContext },
            this.metricsRegistry,
            this.spanTracker,
        );
    }

    /**
     * Create a child logger for a specific span
     */
    withSpan(spanId: string): DataHubLogger {
        const logger = this.withContext({ spanId, parentSpanId: this.currentSpanId });
        logger.currentSpanId = spanId;
        return logger;
    }

    // MESSAGE FORMATTING

    /**
     * Format message with context for logging.
     * Metadata is sanitized to remove sensitive data (passwords, tokens, PII).
     */
    private formatMessage(message: string, metadata?: LogMetadata): string {
        const parts: string[] = [];

        // Add trace context
        if (this.context.runId) {
            parts.push(`[trace:${this.context.runId}]`);
        }
        if (this.context.spanId) {
            parts.push(`[span:${this.context.spanId}]`);
        }

        // Add context identifiers
        if (this.context.pipelineCode) {
            parts.push(`[pipeline:${this.context.pipelineCode}]`);
        }
        if (this.context.entityType) {
            parts.push(`[entity:${this.context.entityType}]`);
        }
        if (this.context.stepKey) {
            parts.push(`[step:${this.context.stepKey}]`);
        }

        // Add message
        parts.push(message);

        // Add metadata if present (sanitized to remove sensitive data)
        if (metadata && Object.keys(metadata).length > 0) {
            const sanitizedMetadata = sanitizeForLog(metadata) as LogMetadata;
            const metaStr = Object.entries(sanitizedMetadata)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(' ');
            if (metaStr) {
                parts.push(`| ${metaStr}`);
            }
        }

        return parts.join(' ');
    }

    // BASIC LOGGING METHODS

    /**
     * Debug level logging
     */
    debug(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.debug(this.formatMessage(message, metadata));
        } catch (e) {
            try { console.error('DataHubLogger failed:', e); } catch { /* truly silent */ } // eslint-disable-line no-console
        }
    }

    /**
     * Info level logging
     */
    info(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.log(this.formatMessage(message, metadata));
        } catch (e) {
            try { console.error('DataHubLogger failed:', e); } catch { /* truly silent */ } // eslint-disable-line no-console
        }
    }

    /**
     * Alias for info
     */
    log(message: string, metadata?: LogMetadata): void {
        this.info(message, metadata);
    }

    /**
     * Warning level logging
     */
    warn(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.warn(this.formatMessage(message, metadata));
        } catch (e) {
            try { console.error('DataHubLogger failed:', e); } catch { /* truly silent */ } // eslint-disable-line no-console
        }
    }

    /**
     * Error level logging with cause extraction, categorization, and span recording
     */
    error(message: string, error?: Error, metadata?: LogMetadata): void {
        try {
            const errorDetails = error ? extractErrorDetails(error) : undefined;
            const enrichedMetadata: LogMetadata = {
                ...metadata,
                errorCode: errorDetails?.code ?? metadata?.errorCode,
                errorCategory: errorDetails?.category ?? metadata?.errorCategory,
            };

            const fullMessage = this.formatMessage(message, enrichedMetadata);
            if (error) {
                this.nestLogger.error(fullMessage, error.stack);
            } else {
                this.nestLogger.error(fullMessage);
            }

            // Record error in current span if active
            if (this.currentSpanId) {
                this.spanTracker.addEvent(this.currentSpanId, 'error', {
                    message,
                    error: errorDetails,
                });
            }

            // Increment error counter if metrics available
            if (this.metricsRegistry) {
                this.metricsRegistry.getCounter('datahub_errors_total').increment(1, {
                    component: this.componentName,
                    category: errorDetails?.category ?? 'unknown',
                });
            }
        } catch (e) {
            try { console.error('DataHubLogger failed:', e); } catch { /* truly silent */ } // eslint-disable-line no-console
        }
    }

    // SPAN OPERATIONS - Trace Context Management

    /**
     * Start a new span for tracking an operation
     * Returns a SpanContext that can be used to end the span
     */
    startSpan(
        name: string,
        attributes: Record<string, unknown> = {},
    ): SpanContext {
        const span = this.spanTracker.startSpan(name, {
            component: this.componentName,
            ...this.context,
            ...attributes,
        }, this.currentSpanId);

        this.debug(`Span started: ${name}`, { spanId: span.spanId });

        return new SpanContext(span, this.spanTracker, this.metricsRegistry);
    }

    /**
     * Add an event to the current span
     */
    addSpanEvent(name: string, attributes?: Record<string, unknown>): void {
        if (this.currentSpanId) {
            this.spanTracker.addEvent(this.currentSpanId, name, attributes);
        }
    }

    /**
     * Get the current span ID
     */
    getCurrentSpanId(): string | undefined {
        return this.currentSpanId;
    }

    // PIPELINE LIFECYCLE LOGGING

    /**
     * Log pipeline run start with span creation
     */
    logPipelineStart(pipelineCode: string, pipelineId?: ID): SpanContext {
        const span = this.startSpan('pipeline.execute', {
            pipelineCode,
            pipelineId,
        });

        this.info(`Pipeline execution started`, {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
        });

        // Increment pipeline runs counter
        if (this.metricsRegistry) {
            this.metricsRegistry.getCounter('datahub_pipeline_runs_total').increment(1, {
                pipeline: pipelineCode,
                status: MetricStatus.STARTED,
            });
        }

        return span;
    }

    /**
     * Log pipeline run completion
     */
    logPipelineComplete(
        pipelineCode: string,
        metrics: {
            totalRecords: number;
            succeeded: number;
            failed: number;
            durationMs: number;
        },
    ): void {
        const throughput = calculateThroughput(metrics.totalRecords, metrics.durationMs);

        this.info(`Pipeline execution completed`, {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
            recordCount: metrics.totalRecords,
            recordsSucceeded: metrics.succeeded,
            recordsFailed: metrics.failed,
            durationMs: metrics.durationMs,
            throughput,
        });

        // Record metrics
        if (this.metricsRegistry) {
            const labels = { pipeline: pipelineCode };

            this.metricsRegistry.getCounter('datahub_pipeline_runs_total').increment(1, {
                ...labels,
                status: metrics.failed > 0 ? MetricStatus.COMPLETED_WITH_ERRORS : MetricStatus.COMPLETED,
            });

            this.metricsRegistry.getCounter('datahub_records_processed_total').increment(
                metrics.totalRecords,
                labels,
            );

            this.metricsRegistry.getCounter('datahub_records_succeeded_total').increment(
                metrics.succeeded,
                labels,
            );

            this.metricsRegistry.getCounter('datahub_records_failed_total').increment(
                metrics.failed,
                labels,
            );

            this.metricsRegistry.getHistogram('datahub_pipeline_duration_ms').record(
                metrics.durationMs,
                labels,
            );
        }
    }

    /**
     * Log pipeline run failure
     */
    logPipelineFailed(pipelineCode: string, error: Error, durationMs?: number): void {
        this.error(`Pipeline execution failed`, error, {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
            durationMs,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getCounter('datahub_pipeline_runs_total').increment(1, {
                pipeline: pipelineCode,
                status: MetricStatus.FAILED,
            });
        }
    }

    // STEP EXECUTION LOGGING

    /**
     * Log step start with span creation
     */
    logStepStart(stepKey: string, stepType: string, recordCount: number): SpanContext {
        const span = this.startSpan(`step.${stepType.toLowerCase()}`, {
            stepKey,
            stepType,
            recordCount,
        });

        this.info(`Starting step "${stepKey}"`, {
            stepType,
            recordCount,
        });

        return span;
    }

    /**
     * Log step completion
     */
    logStepComplete(
        stepKey: string,
        stepType: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
    ): void {
        const throughput = calculateThroughput(recordsIn, durationMs);

        this.info(`Completed step "${stepKey}"`, {
            stepType,
            recordCount: recordsIn,
            recordsSucceeded: recordsOut,
            durationMs,
            throughput,
        });

        // Record step timing histogram
        if (this.metricsRegistry) {
            this.metricsRegistry.getHistogram('datahub_step_duration_ms').record(durationMs, {
                step: stepKey,
                type: stepType,
            });

            this.metricsRegistry.getCounter('datahub_step_records_in_total').increment(recordsIn, {
                step: stepKey,
                type: stepType,
            });

            this.metricsRegistry.getCounter('datahub_step_records_out_total').increment(recordsOut, {
                step: stepKey,
                type: stepType,
            });
        }
    }

    /**
     * Log step error
     */
    logStepError(stepKey: string, stepType: string, error: Error, recordsFailed: number): void {
        this.error(`Step "${stepKey}" failed`, error, {
            stepType,
            recordsFailed,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getCounter('datahub_step_errors_total').increment(1, {
                step: stepKey,
                type: stepType,
            });
        }
    }

    // EXTRACTOR/LOADER OPERATION LOGGING

    /**
     * Log extractor operation
     */
    logExtractorOperation(
        extractorCode: string,
        recordCount: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.info(`Extractor "${extractorCode}" completed`, {
            adapterCode: extractorCode,
            recordCount,
            durationMs,
            throughput: calculateThroughput(recordCount, durationMs),
            ...metadata,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getHistogram('datahub_extractor_duration_ms').record(durationMs, {
                extractor: extractorCode,
            });

            this.metricsRegistry.getCounter('datahub_extractor_records_total').increment(recordCount, {
                extractor: extractorCode,
            });
        }
    }

    /**
     * Log loader operation
     */
    logLoaderOperation(
        loaderCode: string,
        operation: 'create' | 'update' | 'delete' | 'skip' | 'upsert',
        succeeded: number,
        failed: number,
        durationMs: number,
    ): void {
        this.info(`Loader "${loaderCode}" ${operation} completed`, {
            adapterCode: loaderCode,
            recordsSucceeded: succeeded,
            recordsFailed: failed,
            durationMs,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getHistogram('datahub_loader_duration_ms').record(durationMs, {
                loader: loaderCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_loader_succeeded_total').increment(succeeded, {
                loader: loaderCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_loader_failed_total').increment(failed, {
                loader: loaderCode,
                operation,
            });
        }
    }

    /**
     * Log sink operation
     */
    logSinkOperation(
        sinkCode: string,
        operation: string,
        indexed: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.info(`Sink "${sinkCode}" ${operation} completed`, {
            adapterCode: sinkCode,
            operation,
            recordsIndexed: indexed,
            recordsFailed: failed,
            durationMs,
            ...metadata,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getHistogram('datahub_sink_duration_ms').record(durationMs, {
                sink: sinkCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_sink_indexed_total').increment(indexed, {
                sink: sinkCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_sink_failed_total').increment(failed, {
                sink: sinkCode,
                operation,
            });
        }
    }

    /**
     * Log exporter operation
     */
    logExporterOperation(
        exporterCode: string,
        operation: string,
        succeeded: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.info(`Exporter "${exporterCode}" ${operation} completed`, {
            adapterCode: exporterCode,
            operation,
            recordsSucceeded: succeeded,
            recordsFailed: failed,
            durationMs,
            ...metadata,
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getHistogram('datahub_exporter_duration_ms').record(durationMs, {
                exporter: exporterCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_exporter_succeeded_total').increment(succeeded, {
                exporter: exporterCode,
                operation,
            });

            this.metricsRegistry.getCounter('datahub_exporter_failed_total').increment(failed, {
                exporter: exporterCode,
                operation,
            });
        }
    }

    // VALIDATION AND DATA QUALITY LOGGING

    /**
     * Log validation errors
     */
    logValidationErrors(recordIndex: number, errors: string[]): void {
        this.warn(`Validation failed for record ${recordIndex}`, {
            recordCount: 1,
            recordsFailed: 1,
            errorCategory: 'validation',
            errors: errors.join('; '),
        });

        if (this.metricsRegistry) {
            this.metricsRegistry.getCounter('datahub_validation_errors_total').increment(errors.length);
        }
    }

    /**
     * Log batch validation summary
     */
    logValidationSummary(total: number, passed: number, failed: number): void {
        this.info(`Validation complete`, {
            recordCount: total,
            recordsSucceeded: passed,
            recordsFailed: failed,
        });
    }

    // ENTITY OPERATION LOGGING

    /**
     * Log entity operation
     */
    logEntityOperation(
        operation: 'create' | 'update' | 'delete' | 'skip',
        entityType: string,
        entityId?: ID,
    ): void {
        this.debug(`${operation.toUpperCase()} ${entityType}`, { entityId });
    }

    // PERFORMANCE TRACKING

    /**
     * Start a timer for performance measurement
     * Returns a function that, when called, logs the duration and records to histogram
     */
    startTimer(label: string, histogramName?: string): () => number {
        const start = Date.now();
        return () => {
            const durationMs = Date.now() - start;
            this.debug(`Timer "${label}" completed`, { durationMs });

            if (histogramName && this.metricsRegistry) {
                this.metricsRegistry.getHistogram(histogramName).record(durationMs, {
                    operation: label,
                });
            }

            return durationMs;
        };
    }

    /**
     * Measure async operation duration with automatic span tracking
     */
    async measureAsync<T>(
        label: string,
        operation: () => Promise<T>,
        options?: { histogramName?: string; attributes?: Record<string, unknown> },
    ): Promise<T> {
        const span = this.startSpan(label, options?.attributes);
        const start = Date.now();

        try {
            const result = await operation();
            const durationMs = Date.now() - start;

            this.debug(`${label} completed`, { durationMs });
            span.end(SpanStatus.OK);

            if (options?.histogramName && this.metricsRegistry) {
                this.metricsRegistry.getHistogram(options.histogramName).record(durationMs, {
                    operation: label,
                });
            }

            return result;
        } catch (error) {
            const durationMs = Date.now() - start;
            this.error(`${label} failed`, error as Error, { durationMs });
            span.end(SpanStatus.ERROR);
            throw error;
        }
    }

    // CONTEXT ACCESSORS

    /**
     * Get current context
     */
    getContext(): LogContext {
        return { ...this.context };
    }

    /**
     * Get component name
     */
    getComponentName(): string {
        return this.componentName;
    }

    /**
     * Get active spans (for debugging)
     */
    getActiveSpans(): SpanData[] {
        return this.spanTracker.getActiveSpans();
    }
}

/**
 * Factory for creating DataHubLogger instances with shared metrics registry
 */
@Injectable()
export class DataHubLoggerFactory {
    private readonly loggers = new Map<string, { logger: DataHubLogger; lastAccess: number }>();
    private readonly metricsRegistry: MetricsRegistry;

    constructor() {
        this.metricsRegistry = new MetricsRegistry();
    }

    /**
     * Create a new logger instance with metrics support
     */
    createLogger(componentName: string, baseContext?: LogContext): DataHubLogger {
        return new DataHubLogger(componentName, baseContext, this.metricsRegistry);
    }

    /**
     * Get or create a cached logger instance (for static contexts)
     */
    getLogger(componentName: string): DataHubLogger {
        const existing = this.loggers.get(componentName);
        if (existing) {
            existing.lastAccess = Date.now();
            return existing.logger;
        }

        if (this.loggers.size >= CACHE.MAX_CACHED_LOGGERS) {
            this.evictLeastRecentlyUsed();
        }

        const logger = new DataHubLogger(componentName, {}, this.metricsRegistry);
        this.loggers.set(componentName, { logger, lastAccess: Date.now() });
        return logger;
    }

    private evictLeastRecentlyUsed(): void {
        let oldest: { key: string; time: number } | null = null;
        for (const [key, entry] of this.loggers) {
            if (!oldest || entry.lastAccess < oldest.time) {
                oldest = { key, time: entry.lastAccess };
            }
        }
        if (oldest) {
            this.loggers.delete(oldest.key);
        }
    }

    /**
     * Get the shared metrics registry
     */
    getMetricsRegistry(): MetricsRegistry {
        return this.metricsRegistry;
    }

    /**
     * Get metrics snapshot
     */
    getMetricsSnapshot(): ReturnType<MetricsRegistry['getSnapshot']> {
        return this.metricsRegistry.getSnapshot();
    }

    /**
     * Clear cached loggers
     */
    clearCache(): void {
        this.loggers.clear();
    }

    /**
     * Reset all metrics (useful for testing)
     */
    resetMetrics(): void {
        this.metricsRegistry.reset();
    }
}
