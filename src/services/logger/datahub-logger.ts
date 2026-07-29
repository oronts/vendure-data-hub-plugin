/**
 * Structured, context-aware logging for the DataHub plugin.
 * Wraps Vendure's Logger with telemetry and metrics capabilities.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ID } from '@vendure/core';

import { SpanStatus } from '../../constants/enums';
import { CACHE } from '../../constants/defaults/reliability-defaults';
import { DataHubLoggerOperations } from './datahub-logger-operations';
import { LogContext, LogMetadata, SpanData } from './logger.types';
import { MetricsRegistry } from './metrics';
import { SpanTracker, SpanContext } from './span-tracker';
import { extractErrorDetails } from './error-utils';
import { sanitizeForLog, sanitizeLogMessage } from './sanitizer';
import { OtlpExporterService } from './otlp-exporter.service';

const LOGGER_FAILURE_EVENT = 'datahub_logger_failure';

function reportLoggerFailure(component: string, error: unknown): void {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    try {
        process.stderr.write(`${JSON.stringify({
            event: LOGGER_FAILURE_EVENT,
            component,
            errorName,
        })}\n`);
    } catch {
        // Logging failures must never interrupt application execution.
    }
}

export class DataHubLogger {
    private readonly nestLogger: Logger;
    private readonly context: LogContext;
    private readonly spanTracker: SpanTracker;
    private readonly operations: DataHubLoggerOperations;
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
        this.operations = new DataHubLoggerOperations(this, metricsRegistry);
    }

    withContext(additionalContext: LogContext): DataHubLogger {
        return new DataHubLogger(
            this.componentName,
            { ...this.context, ...additionalContext },
            this.metricsRegistry,
            this.spanTracker,
        );
    }

    withSpan(spanId: string): DataHubLogger {
        const logger = this.withContext({ spanId, parentSpanId: this.currentSpanId });
        logger.currentSpanId = spanId;
        return logger;
    }

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
        parts.push(sanitizeLogMessage(message));

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

    debug(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.debug(this.formatMessage(message, metadata));
        } catch (error) {
            reportLoggerFailure(this.componentName, error);
        }
    }

    info(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.log(this.formatMessage(message, metadata));
        } catch (error) {
            reportLoggerFailure(this.componentName, error);
        }
    }

    log(message: string, metadata?: LogMetadata): void {
        this.info(message, metadata);
    }

    warn(message: string, metadata?: LogMetadata): void {
        try {
            this.nestLogger.warn(this.formatMessage(message, metadata));
        } catch (error) {
            reportLoggerFailure(this.componentName, error);
        }
    }

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
                this.nestLogger.error(
                    fullMessage,
                    error.stack ? sanitizeLogMessage(error.stack) : undefined,
                );
            } else {
                this.nestLogger.error(fullMessage);
            }

            // Record error in current span if active
            if (this.currentSpanId) {
                this.spanTracker.addEvent(this.currentSpanId, 'error', {
                    message: sanitizeLogMessage(message),
                    error: sanitizeForLog(errorDetails),
                });
            }

            // Increment error counter if metrics available
            if (this.metricsRegistry) {
                this.metricsRegistry.getCounter('datahub_errors_total').increment(1, {
                    component: this.componentName,
                    category: errorDetails?.category ?? 'unknown',
                });
            }
        } catch (error) {
            reportLoggerFailure(this.componentName, error);
        }
    }

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

    addSpanEvent(name: string, attributes?: Record<string, unknown>): void {
        if (this.currentSpanId) {
            this.spanTracker.addEvent(this.currentSpanId, name, attributes);
        }
    }

    getCurrentSpanId(): string | undefined {
        return this.currentSpanId;
    }

    logPipelineStart(pipelineCode: string, pipelineId?: ID): SpanContext {
        return this.operations.logPipelineStart(pipelineCode, pipelineId);
    }

    logPipelineComplete(
        pipelineCode: string,
        metrics: {
            totalRecords: number;
            succeeded: number;
            failed: number;
            durationMs: number;
        },
    ): void {
        this.operations.logPipelineComplete(pipelineCode, metrics);
    }

    logPipelineFailed(pipelineCode: string, error: Error, durationMs?: number): void {
        this.operations.logPipelineFailed(pipelineCode, error, durationMs);
    }

    logStepStart(stepKey: string, stepType: string, recordCount: number): SpanContext {
        return this.operations.logStepStart(stepKey, stepType, recordCount);
    }

    logStepComplete(
        stepKey: string,
        stepType: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
    ): void {
        this.operations.logStepComplete(stepKey, stepType, recordsIn, recordsOut, durationMs);
    }

    logStepError(stepKey: string, stepType: string, error: Error, recordsFailed: number): void {
        this.operations.logStepError(stepKey, stepType, error, recordsFailed);
    }

    logExtractorOperation(
        extractorCode: string,
        recordCount: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.operations.logExtractorOperation(extractorCode, recordCount, durationMs, metadata);
    }

    logLoaderOperation(
        loaderCode: string,
        operation: 'create' | 'update' | 'delete' | 'skip' | 'upsert',
        succeeded: number,
        failed: number,
        skipped: number,
        durationMs: number,
    ): void {
        this.operations.logLoaderOperation(
            loaderCode,
            operation,
            succeeded,
            failed,
            skipped,
            durationMs,
        );
    }

    logSinkOperation(
        sinkCode: string,
        operation: string,
        indexed: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.operations.logSinkOperation(
            sinkCode,
            operation,
            indexed,
            failed,
            durationMs,
            metadata,
        );
    }

    logExporterOperation(
        exporterCode: string,
        operation: string,
        succeeded: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.operations.logExporterOperation(
            exporterCode,
            operation,
            succeeded,
            failed,
            durationMs,
            metadata,
        );
    }

    logValidationErrors(recordIndex: number, errors: string[]): void {
        this.operations.logValidationErrors(recordIndex, errors);
    }

    logValidationSummary(total: number, passed: number, failed: number): void {
        this.operations.logValidationSummary(total, passed, failed);
    }

    logEntityOperation(
        operation: 'create' | 'update' | 'delete' | 'skip',
        entityType: string,
        entityId?: ID,
    ): void {
        this.operations.logEntityOperation(operation, entityType, entityId);
    }

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

    getContext(): LogContext {
        return { ...this.context };
    }

    getComponentName(): string {
        return this.componentName;
    }

    getActiveSpans(): SpanData[] {
        return this.spanTracker.getActiveSpans();
    }
}

@Injectable()
export class DataHubLoggerFactory {
    private readonly loggers = new Map<string, { logger: DataHubLogger; lastAccess: number }>();
    private readonly metricsRegistry: MetricsRegistry;

    constructor(
        @Optional()
        private readonly telemetryExporter?: OtlpExporterService,
    ) {
        this.metricsRegistry = new MetricsRegistry();
        this.telemetryExporter?.bindMetricsRegistry(this.metricsRegistry);
    }

    createLogger(componentName: string, baseContext?: LogContext): DataHubLogger {
        return new DataHubLogger(
            componentName,
            baseContext,
            this.metricsRegistry,
            this.createSpanTracker(),
        );
    }

    /**
     * Static factory method for creating loggers in non-DI contexts
     * (module-level code, standalone functions, etc.)
     *
     * Creates a lightweight DataHubLogger without shared metrics registry.
     */
    static create(componentName: string, baseContext?: LogContext): DataHubLogger {
        return new DataHubLogger(componentName, baseContext);
    }

    getLogger(componentName: string): DataHubLogger {
        const existing = this.loggers.get(componentName);
        if (existing) {
            existing.lastAccess = Date.now();
            return existing.logger;
        }

        if (this.loggers.size >= CACHE.MAX_CACHED_LOGGERS) {
            this.evictLeastRecentlyUsed();
        }

        const logger = new DataHubLogger(
            componentName,
            {},
            this.metricsRegistry,
            this.createSpanTracker(),
        );
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

    private createSpanTracker(): SpanTracker {
        return new SpanTracker(span => this.telemetryExporter?.enqueueSpan(span));
    }

    getMetricsRegistry(): MetricsRegistry {
        return this.metricsRegistry;
    }

    getMetricsSnapshot(): ReturnType<MetricsRegistry['getSnapshot']> {
        return this.metricsRegistry.getSnapshot();
    }

    clearCache(): void {
        this.loggers.clear();
    }

    resetMetrics(): void {
        this.metricsRegistry.reset();
    }
}
