import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { LogPersistenceLevel } from '../../constants/enums';
import { TRUNCATION } from '../../constants/index';
import type { DataHubSettingsService } from '../config/settings.service';
import type { PipelineLogService } from '../pipeline/pipeline-log.service';
import type { DataHubLogger, DataHubLoggerFactory } from './datahub-logger';
import { ExecutionLogger } from './execution-logger';

function createFixture(level: LogPersistenceLevel) {
    const consoleLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as DataHubLogger;
    const pipelineLogService = {
        debug: vi.fn(async () => undefined),
        info: vi.fn(async () => undefined),
        warn: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
    } as unknown as PipelineLogService;
    const settingsService = {
        getLogPersistenceLevel: vi.fn(async () => level),
    } as unknown as DataHubSettingsService;
    const loggerFactory = {
        createLogger: vi.fn(() => consoleLogger),
    } as unknown as DataHubLoggerFactory;
    const service = new ExecutionLogger(
        pipelineLogService,
        settingsService,
        loggerFactory,
    );
    const ctx = { channelId: 7 } as RequestContext;

    return {
        consoleLogger,
        ctx,
        pipelineLogService,
        service,
        settingsService,
    };
}

describe('ExecutionLogger', () => {
    it('always logs lifecycle events to console and applies persistence levels', async () => {
        const fixture = createFixture(LogPersistenceLevel.ERROR_ONLY);
        const error = new Error('source unavailable');

        await fixture.service.logPipelineStart(fixture.ctx, 'catalog', {
            pipelineId: 11,
            runId: 12,
        });
        await fixture.service.logPipelineFailed(
            fixture.ctx,
            'catalog',
            error,
            { pipelineId: 11, runId: 12, durationMs: 25 },
        );

        expect(fixture.consoleLogger.info).toHaveBeenCalledWith(
            'Pipeline "catalog" execution started',
            { pipelineCode: 'catalog' },
        );
        expect(fixture.pipelineLogService.info).not.toHaveBeenCalled();
        expect(fixture.consoleLogger.error).toHaveBeenCalledWith(
            'Pipeline "catalog" execution failed: source unavailable',
            error,
            { pipelineCode: 'catalog', durationMs: 25 },
        );
        expect(fixture.pipelineLogService.error).toHaveBeenCalledWith(
            fixture.ctx,
            'Pipeline "catalog" execution failed: source unavailable',
            expect.objectContaining({
                pipelineId: 11,
                runId: 12,
                durationMs: 25,
            }),
        );
    });

    it('preserves sanitized record-error persistence and transaction context', async () => {
        const fixture = createFixture(LogPersistenceLevel.ERROR_ONLY);

        await fixture.service.logRecordError(
            fixture.ctx,
            'load-products',
            'invalid product',
            {
                password: 'never-log-this',
                email: 'john@example.com',
                sku: 'SKU-1',
            },
            { pipelineId: 3, runId: 4 },
            'validation stack',
        );

        expect(fixture.pipelineLogService.warn).toHaveBeenCalledWith(
            fixture.ctx,
            'Record error in step "load-products": invalid product',
            {
                pipelineId: 3,
                runId: 4,
                stepKey: 'load-products',
                context: { error: 'invalid product' },
                metadata: {
                    password: '[REDACTED]',
                    email: 'jo***@example.com',
                    sku: 'SKU-1',
                    stack: 'validation stack',
                },
            },
        );
    });

    it('keeps detailed samples sanitized, bounded, and truncated at debug level', async () => {
        const fixture = createFixture(LogPersistenceLevel.DEBUG);
        const longValue = 'x'.repeat(TRUNCATION.MAX_FIELD_VALUE_LENGTH + 1);
        const records = Array.from({ length: TRUNCATION.SAMPLE_VALUES_LIMIT + 2 }, (_, index) => ({
            sku: `SKU-${index}`,
            password: `secret-${index}`,
            description: longValue,
        }));

        await fixture.service.logExtractedData(
            fixture.ctx,
            'extract-products',
            'rest',
            records,
            { pipelineId: 8, runId: 9 },
        );

        expect(fixture.pipelineLogService.debug).toHaveBeenCalledWith(
            fixture.ctx,
            'Extract "extract-products" (rest): 7 records with 3 fields',
            expect.objectContaining({
                pipelineId: 8,
                runId: 9,
                stepKey: 'extract-products',
                metadata: expect.objectContaining({
                    fields: ['sku', 'password', 'description'],
                    sampleRecords: expect.any(Array),
                }),
            }),
        );
        const persisted = vi.mocked(fixture.pipelineLogService.debug).mock.calls[0][2];
        const samples = persisted?.metadata?.sampleRecords as Array<Record<string, unknown>>;
        expect(samples).toHaveLength(TRUNCATION.SAMPLE_VALUES_LIMIT);
        expect(samples[0]).toEqual({
            sku: 'SKU-0',
            password: '[REDACTED]',
            description: `${'x'.repeat(TRUNCATION.MAX_FIELD_VALUE_LENGTH)}...`,
        });
    });

    it('includes sanitized step samples only at debug persistence level', async () => {
        const debugFixture = createFixture(LogPersistenceLevel.DEBUG);
        const stepInfo = {
            stepKey: 'transform-products',
            stepType: 'TRANSFORM',
            adapterCode: 'map',
            recordsIn: 10,
            recordsOut: 9,
            succeeded: 9,
            failed: 1,
            durationMs: 100,
            sampleRecord: {
                sku: 'SKU-1',
                apiToken: 'hidden',
            },
        };

        await debugFixture.service.logStepExecution(
            debugFixture.ctx,
            stepInfo,
            { pipelineId: 1, runId: 2 },
        );

        expect(debugFixture.pipelineLogService.info).toHaveBeenCalledWith(
            debugFixture.ctx,
            expect.stringContaining('Step "transform-products" (TRANSFORM) completed'),
            expect.objectContaining({
                metadata: {
                    sampleRecord: {
                        sku: 'SKU-1',
                        apiToken: '[REDACTED]',
                    },
                    fieldMappings: null,
                },
            }),
        );

        const stepFixture = createFixture(LogPersistenceLevel.STEP);
        await stepFixture.service.logStepExecution(
            stepFixture.ctx,
            stepInfo,
            { pipelineId: 1, runId: 2 },
        );
        expect(stepFixture.pipelineLogService.info).toHaveBeenCalledWith(
            stepFixture.ctx,
            expect.any(String),
            expect.objectContaining({ metadata: undefined }),
        );
    });

    it('reuses the current persistence level during a burst', async () => {
        const fixture = createFixture(LogPersistenceLevel.PIPELINE);

        await fixture.service.getCurrentLevel();
        await fixture.service.getCurrentLevel();
        expect(fixture.settingsService.getLogPersistenceLevel).toHaveBeenCalledOnce();
    });

    it('contains persistence failures after console logging', async () => {
        const fixture = createFixture(LogPersistenceLevel.PIPELINE);
        vi.mocked(fixture.pipelineLogService.info)
            .mockRejectedValueOnce(new Error('database unavailable'));

        await expect(fixture.service.logPipelineStart(
            fixture.ctx,
            'products',
            { pipelineId: 1, runId: 2 },
        )).resolves.toBeUndefined();

        expect(fixture.consoleLogger.warn).toHaveBeenCalledWith(
            'Execution log persistence failed',
            expect.objectContaining({
                eventType: 'pipeline.start',
                error: 'database unavailable',
            }),
        );
    });

    it('contains detailed sample persistence failures', async () => {
        const fixture = createFixture(LogPersistenceLevel.DEBUG);
        vi.mocked(fixture.pipelineLogService.debug)
            .mockRejectedValueOnce(new Error('sample write unavailable'));

        await expect(fixture.service.logExtractedData(
            fixture.ctx,
            'extract-products',
            'csv',
            [{ sku: 'SKU-1' }],
            { pipelineId: 1, runId: 2 },
        )).resolves.toBeUndefined();

        expect(fixture.consoleLogger.warn).toHaveBeenCalledWith(
            'Execution log detail persistence failed',
            expect.objectContaining({
                eventType: 'extract.source',
                error: 'sample write unavailable',
            }),
        );
    });
});
