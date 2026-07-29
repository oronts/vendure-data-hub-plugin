import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetricStatus } from '../../constants/enums';
import { DataHubLogger } from './datahub-logger';
import { MetricsRegistry } from './metrics';

describe('DataHubLogger operation logging', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
        infoSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves pipeline and step spans, messages, and metric labels', () => {
        const metrics = new MetricsRegistry();
        const logger = new DataHubLogger('Runtime', {}, metrics);

        logger.logPipelineStart('catalog', 17).end();
        logger.logPipelineComplete('catalog', {
            totalRecords: 20,
            succeeded: 18,
            failed: 2,
            durationMs: 1000,
        });
        logger.logPipelineFailed('catalog', new Error('network unavailable'), 25);
        logger.logStepStart('load-products', 'LOAD', 20).end();
        logger.logStepComplete('load-products', 'LOAD', 20, 18, 200);
        logger.logStepError('load-products', 'LOAD', new Error('invalid record'), 2);

        expect(metrics.getCounter('datahub_pipeline_runs_total').getValue({
            pipeline: 'catalog',
            status: MetricStatus.STARTED,
        })).toBe(1);
        expect(metrics.getCounter('datahub_pipeline_runs_total').getValue({
            pipeline: 'catalog',
            status: MetricStatus.COMPLETED_WITH_ERRORS,
        })).toBe(1);
        expect(metrics.getCounter('datahub_pipeline_runs_total').getValue({
            pipeline: 'catalog',
            status: MetricStatus.FAILED,
        })).toBe(1);
        expect(metrics.getHistogram('datahub_pipeline_duration_ms').getSum({
            pipeline: 'catalog',
        })).toBe(1000);
        expect(metrics.getCounter('datahub_step_records_in_total').getValue({
            step: 'load-products',
            type: 'LOAD',
        })).toBe(20);
        expect(metrics.getCounter('datahub_step_records_out_total').getValue({
            step: 'load-products',
            type: 'LOAD',
        })).toBe(18);
        expect(metrics.getCounter('datahub_step_errors_total').getValue({
            step: 'load-products',
            type: 'LOAD',
        })).toBe(1);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(
            'Pipeline execution completed | stepType=pipeline adapterCode=catalog',
        ));
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Step "load-products" failed'),
            expect.any(String),
        );
    });

    it('preserves adapter metric names, values, and labels', () => {
        const metrics = new MetricsRegistry();
        const logger = new DataHubLogger('Adapters', {}, metrics);

        logger.logExtractorOperation('rest', 12, 60, { page: 2 });
        logger.logLoaderOperation('product', 'upsert', 10, 1, 1, 80);
        logger.logSinkOperation('search', 'index', 9, 1, 90);
        logger.logExporterOperation('csv', 'write', 9, 0, 40);

        expect(metrics.getCounter('datahub_extractor_records_total').getValue({
            extractor: 'rest',
        })).toBe(12);
        expect(metrics.getCounter('datahub_loader_succeeded_total').getValue({
            loader: 'product',
            operation: 'upsert',
        })).toBe(10);
        expect(metrics.getCounter('datahub_loader_failed_total').getValue({
            loader: 'product',
            operation: 'upsert',
        })).toBe(1);
        expect(metrics.getCounter('datahub_loader_skipped_total').getValue({
            loader: 'product',
            operation: 'upsert',
        })).toBe(1);
        expect(metrics.getCounter('datahub_sink_indexed_total').getValue({
            sink: 'search',
            operation: 'index',
        })).toBe(9);
        expect(metrics.getCounter('datahub_exporter_succeeded_total').getValue({
            exporter: 'csv',
            operation: 'write',
        })).toBe(9);
    });

    it('preserves validation and entity log formatting', () => {
        const metrics = new MetricsRegistry();
        const logger = new DataHubLogger('Validation', {}, metrics);

        logger.logValidationErrors(4, ['sku is required', 'price is invalid']);
        logger.logValidationSummary(10, 8, 2);
        logger.logEntityOperation('update', 'Product', 42);

        expect(metrics.getCounter('datahub_validation_errors_total').getValue()).toBe(2);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(
            'Validation failed for record 4 | recordCount=1 recordsFailed=1',
        ));
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(
            'Validation complete | recordCount=10 recordsSucceeded=8 recordsFailed=2',
        ));
        expect(debugSpy).toHaveBeenCalledWith(
            'UPDATE Product | entityId=42',
        );
    });
});
