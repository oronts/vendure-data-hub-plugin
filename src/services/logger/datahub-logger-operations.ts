import type { ID } from '@vendure/core';

import { MetricStatus } from '../../constants/enums';
import { calculateThroughput } from '../../constants/time';
import type { LogMetadata } from './logger.types';
import type { MetricsRegistry } from './metrics';
import type { SpanContext } from './span-tracker';

export interface DataHubLoggerOperationHost {
    debug(message: string, metadata?: LogMetadata): void;
    info(message: string, metadata?: LogMetadata): void;
    warn(message: string, metadata?: LogMetadata): void;
    error(message: string, error?: Error, metadata?: LogMetadata): void;
    startSpan(name: string, attributes?: Record<string, unknown>): SpanContext;
}

export class DataHubLoggerOperations {
    constructor(
        private readonly logger: DataHubLoggerOperationHost,
        private readonly metricsRegistry?: MetricsRegistry,
    ) {}

    logPipelineStart(pipelineCode: string, pipelineId?: ID): SpanContext {
        const span = this.logger.startSpan('pipeline.execute', {
            pipelineCode,
            pipelineId,
        });

        this.logger.info('Pipeline execution started', {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
        });

        this.metricsRegistry?.getCounter('datahub_pipeline_runs_total').increment(1, {
            pipeline: pipelineCode,
            status: MetricStatus.STARTED,
        });

        return span;
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
        const throughput = calculateThroughput(metrics.totalRecords, metrics.durationMs);
        this.logger.info('Pipeline execution completed', {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
            recordCount: metrics.totalRecords,
            recordsSucceeded: metrics.succeeded,
            recordsFailed: metrics.failed,
            durationMs: metrics.durationMs,
            throughput,
        });

        if (!this.metricsRegistry) {
            return;
        }

        const labels = { pipeline: pipelineCode };
        this.metricsRegistry.getCounter('datahub_pipeline_runs_total').increment(1, {
            ...labels,
            status: metrics.failed > 0
                ? MetricStatus.COMPLETED_WITH_ERRORS
                : MetricStatus.COMPLETED,
        });
        this.metricsRegistry
            .getCounter('datahub_records_processed_total')
            .increment(metrics.totalRecords, labels);
        this.metricsRegistry
            .getCounter('datahub_records_succeeded_total')
            .increment(metrics.succeeded, labels);
        this.metricsRegistry
            .getCounter('datahub_records_failed_total')
            .increment(metrics.failed, labels);
        this.metricsRegistry
            .getHistogram('datahub_pipeline_duration_ms')
            .record(metrics.durationMs, labels);
    }

    logPipelineFailed(pipelineCode: string, error: Error, durationMs?: number): void {
        this.logger.error('Pipeline execution failed', error, {
            stepType: 'pipeline',
            adapterCode: pipelineCode,
            durationMs,
        });
        this.metricsRegistry?.getCounter('datahub_pipeline_runs_total').increment(1, {
            pipeline: pipelineCode,
            status: MetricStatus.FAILED,
        });
    }

    logStepStart(stepKey: string, stepType: string, recordCount: number): SpanContext {
        const span = this.logger.startSpan(`step.${stepType.toLowerCase()}`, {
            stepKey,
            stepType,
            recordCount,
        });
        this.logger.info(`Starting step "${stepKey}"`, { stepType, recordCount });
        return span;
    }

    logStepComplete(
        stepKey: string,
        stepType: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
    ): void {
        this.logger.info(`Completed step "${stepKey}"`, {
            stepType,
            recordCount: recordsIn,
            recordsSucceeded: recordsOut,
            durationMs,
            throughput: calculateThroughput(recordsIn, durationMs),
        });

        if (!this.metricsRegistry) {
            return;
        }

        const labels = { step: stepKey, type: stepType };
        this.metricsRegistry
            .getHistogram('datahub_step_duration_ms')
            .record(durationMs, labels);
        this.metricsRegistry
            .getCounter('datahub_step_records_in_total')
            .increment(recordsIn, labels);
        this.metricsRegistry
            .getCounter('datahub_step_records_out_total')
            .increment(recordsOut, labels);
    }

    logStepError(
        stepKey: string,
        stepType: string,
        error: Error,
        recordsFailed: number,
    ): void {
        this.logger.error(`Step "${stepKey}" failed`, error, {
            stepType,
            recordsFailed,
        });
        this.metricsRegistry?.getCounter('datahub_step_errors_total').increment(1, {
            step: stepKey,
            type: stepType,
        });
    }

    logExtractorOperation(
        extractorCode: string,
        recordCount: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        this.logger.info(`Extractor "${extractorCode}" completed`, {
            adapterCode: extractorCode,
            recordCount,
            durationMs,
            throughput: calculateThroughput(recordCount, durationMs),
            ...metadata,
        });

        this.metricsRegistry
            ?.getHistogram('datahub_extractor_duration_ms')
            .record(durationMs, { extractor: extractorCode });
        this.metricsRegistry
            ?.getCounter('datahub_extractor_records_total')
            .increment(recordCount, { extractor: extractorCode });
    }

    logLoaderOperation(
        loaderCode: string,
        operation: 'create' | 'update' | 'delete' | 'skip' | 'upsert',
        succeeded: number,
        failed: number,
        skipped: number,
        durationMs: number,
    ): void {
        const labels = { loader: loaderCode, operation };
        this.logger.info(`Loader "${loaderCode}" ${operation} completed`, {
            adapterCode: loaderCode,
            recordsSucceeded: succeeded,
            recordsFailed: failed,
            recordsSkipped: skipped,
            durationMs,
        });
        this.metricsRegistry?.getHistogram('datahub_loader_duration_ms').record(durationMs, labels);
        this.metricsRegistry?.getCounter('datahub_loader_succeeded_total').increment(succeeded, labels);
        this.metricsRegistry?.getCounter('datahub_loader_failed_total').increment(failed, labels);
        this.metricsRegistry?.getCounter('datahub_loader_skipped_total').increment(skipped, labels);
    }

    logSinkOperation(
        sinkCode: string,
        operation: string,
        indexed: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        const labels = { sink: sinkCode, operation };
        this.logger.info(`Sink "${sinkCode}" ${operation} completed`, {
            adapterCode: sinkCode,
            operation,
            recordsIndexed: indexed,
            recordsFailed: failed,
            durationMs,
            ...metadata,
        });
        this.metricsRegistry?.getHistogram('datahub_sink_duration_ms').record(durationMs, labels);
        this.metricsRegistry?.getCounter('datahub_sink_indexed_total').increment(indexed, labels);
        this.metricsRegistry?.getCounter('datahub_sink_failed_total').increment(failed, labels);
    }

    logExporterOperation(
        exporterCode: string,
        operation: string,
        succeeded: number,
        failed: number,
        durationMs: number,
        metadata?: Record<string, unknown>,
    ): void {
        const labels = { exporter: exporterCode, operation };
        this.logger.info(`Exporter "${exporterCode}" ${operation} completed`, {
            adapterCode: exporterCode,
            operation,
            recordsSucceeded: succeeded,
            recordsFailed: failed,
            durationMs,
            ...metadata,
        });
        this.metricsRegistry?.getHistogram('datahub_exporter_duration_ms').record(durationMs, labels);
        this.metricsRegistry?.getCounter('datahub_exporter_succeeded_total').increment(succeeded, labels);
        this.metricsRegistry?.getCounter('datahub_exporter_failed_total').increment(failed, labels);
    }

    logValidationErrors(recordIndex: number, errors: string[]): void {
        this.logger.warn(`Validation failed for record ${recordIndex}`, {
            recordCount: 1,
            recordsFailed: 1,
            errorCategory: 'validation',
            errors: errors.join('; '),
        });
        this.metricsRegistry
            ?.getCounter('datahub_validation_errors_total')
            .increment(errors.length);
    }

    logValidationSummary(total: number, passed: number, failed: number): void {
        this.logger.info('Validation complete', {
            recordCount: total,
            recordsSucceeded: passed,
            recordsFailed: failed,
        });
    }

    logEntityOperation(
        operation: 'create' | 'update' | 'delete' | 'skip',
        entityType: string,
        entityId?: ID,
    ): void {
        this.logger.debug(`${operation.toUpperCase()} ${entityType}`, { entityId });
    }
}
