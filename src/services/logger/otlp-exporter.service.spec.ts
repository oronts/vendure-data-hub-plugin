import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { METRICS } from '../../constants/defaults/reliability-defaults';
import type { DataHubPluginOptions } from '../../types';
import { DataHubLoggerFactory } from './datahub-logger';
import { MetricsRegistry } from './metrics';
import { OtlpExporterService } from './otlp-exporter.service';
import { SpanTracker } from './span-tracker';

const COLLECTOR_ENDPOINT = 'https://collector.example.com/otel';
const FIXED_TIME = new Date('2026-07-24T10:00:00.000Z');
const FIXED_TIME_UNIX_NANO = '1784887200000000000';
const INSTANCE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createExporter(
    telemetry: NonNullable<DataHubPluginOptions['telemetry']>,
): OtlpExporterService {
    return new OtlpExporterService({ telemetry });
}

function successfulResponse(): Response {
    return new Response(null, { status: 200 });
}

describe('OtlpExporterService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_TIME);
        vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('exports cumulative metrics with the OTLP HTTP JSON shape and stable start time', async () => {
        const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            traces: false,
            headers: { Authorization: 'Bearer collector-token' },
            serviceName: 'vendure-data-hub',
            serviceVersion: '0.1.7',
            environment: 'test',
        });
        const registry = new MetricsRegistry();
        registry.getCounter('records_total').increment(3, { pipeline: 'catalog' });
        const duration = registry.getHistogram('duration_ms');
        duration.record(10, { step: 'extract' });
        duration.record(30, { step: 'load' });
        exporter.bindMetricsRegistry(registry);

        await exporter.flush();
        vi.setSystemTime(new Date(FIXED_TIME.getTime() + 5_000));
        registry.getCounter('records_total').increment(2);
        await exporter.flush();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(url).toBe(`${COLLECTOR_ENDPOINT}/v1/metrics`);
        expect(request.headers).toEqual({
            Authorization: 'Bearer collector-token',
            'content-type': 'application/json',
        });
        expect(JSON.parse(String(request.body))).toEqual({
            resourceMetrics: [{
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'vendure-data-hub' } },
                        { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
                        {
                            key: 'service.instance.id',
                            value: { stringValue: expect.stringMatching(INSTANCE_ID_PATTERN) },
                        },
                        { key: 'service.version', value: { stringValue: '0.1.7' } },
                        {
                            key: 'deployment.environment.name',
                            value: { stringValue: 'test' },
                        },
                    ],
                },
                scopeMetrics: [{
                    scope: { name: '@oronts/vendure-data-hub-plugin' },
                    metrics: [
                        {
                            name: 'records_total',
                            sum: {
                                aggregationTemporality: 2,
                                isMonotonic: true,
                                dataPoints: [
                                    {
                                        attributes: [{
                                            key: 'pipeline',
                                            value: { stringValue: 'catalog' },
                                        }],
                                        startTimeUnixNano: FIXED_TIME_UNIX_NANO,
                                        timeUnixNano: '1784887205000000000',
                                        asDouble: 3,
                                    },
                                    {
                                        attributes: [],
                                        startTimeUnixNano: FIXED_TIME_UNIX_NANO,
                                        timeUnixNano: '1784887205000000000',
                                        asDouble: 2,
                                    },
                                ],
                            },
                        },
                        {
                            name: 'duration_ms',
                            summary: {
                                dataPoints: [
                                    {
                                        attributes: [{
                                            key: 'step',
                                            value: { stringValue: 'extract' },
                                        }],
                                        startTimeUnixNano: FIXED_TIME_UNIX_NANO,
                                        timeUnixNano: '1784887205000000000',
                                        count: '1',
                                        sum: 10,
                                    },
                                    {
                                        attributes: [{
                                            key: 'step',
                                            value: { stringValue: 'load' },
                                        }],
                                        startTimeUnixNano: FIXED_TIME_UNIX_NANO,
                                        timeUnixNano: '1784887205000000000',
                                        count: '1',
                                        sum: 30,
                                    },
                                ],
                            },
                        },
                    ],
                }],
            }],
        });
    });

    it('exports cumulative histogram count and sum after local samples are evicted', async () => {
        const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            traces: false,
        });
        const registry = new MetricsRegistry();
        const histogram = registry.getHistogram('bounded_duration_ms');
        const recordedCount = METRICS.MAX_SAMPLES + 2;
        for (let index = 0; index < recordedCount; index += 1) {
            histogram.record(2, { operation: 'pipeline.extract' });
        }
        exporter.bindMetricsRegistry(registry);

        await exporter.flush();

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const payload = JSON.parse(String(request.body));
        const metric = payload.resourceMetrics[0].scopeMetrics[0].metrics
            .find((item: { name: string }) => item.name === 'bounded_duration_ms');
        expect(metric.summary.dataPoints).toEqual([{
            attributes: [{
                key: 'operation',
                value: { stringValue: 'pipeline.extract' },
            }],
            startTimeUnixNano: FIXED_TIME_UNIX_NANO,
            timeUnixNano: FIXED_TIME_UNIX_NANO,
            count: String(recordedCount),
            sum: recordedCount * 2,
        }]);
        expect(metric.summary.dataPoints[0]).not.toHaveProperty('quantileValues');
    });

    it('keeps span duration operations distinct in OTLP metric attributes', async () => {
        const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            traces: false,
        });
        const factory = new DataHubLoggerFactory(exporter);

        factory.createLogger('runner').startSpan('pipeline.extract').end('ok');
        factory.createLogger('runner').startSpan('pipeline.load').end('ok');
        await exporter.flush();

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const payload = JSON.parse(String(request.body));
        const metric = payload.resourceMetrics[0].scopeMetrics[0].metrics
            .find((item: { name: string }) => item.name === 'datahub_span_duration_ms');
        expect(metric.summary.dataPoints).toEqual([
            expect.objectContaining({
                attributes: [
                    { key: 'operation', value: { stringValue: 'pipeline.extract' } },
                    { key: 'status', value: { stringValue: 'ok' } },
                ],
            }),
            expect.objectContaining({
                attributes: [
                    { key: 'operation', value: { stringValue: 'pipeline.load' } },
                    { key: 'status', value: { stringValue: 'ok' } },
                ],
            }),
        ]);
    });

    it('exports valid trace identifiers and only safe scalar operational attributes', async () => {
        const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            metrics: false,
            serviceName: 'vendure-data-hub',
        });
        const factory = new DataHubLoggerFactory(exporter);
        const logger = factory.createLogger('PipelineRunner', {
            runId: 'run-1',
            pipelineId: '7',
            pipelineCode: 'catalog-sync',
            userId: 'private-user-id',
        });
        const span = logger.startSpan('pipeline.execute', {
            recordCount: 2,
            payload: { apiKey: 'record-secret' },
            password: 'credential-secret',
        });
        span.addEvent('batch.completed', {
            recordsOut: 2,
            record: { email: 'person@example.com' },
        });
        span.end('ok');

        await exporter.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${COLLECTOR_ENDPOINT}/v1/traces`);
        const payload = JSON.parse(String(request.body));
        const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
        expect(payload).toEqual({
            resourceSpans: [{
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'vendure-data-hub' } },
                        { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
                        {
                            key: 'service.instance.id',
                            value: { stringValue: expect.stringMatching(INSTANCE_ID_PATTERN) },
                        },
                    ],
                },
                scopeSpans: [{
                    scope: { name: '@oronts/vendure-data-hub-plugin' },
                    spans: [{
                        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
                        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
                        name: 'pipeline.execute',
                        kind: 1,
                        startTimeUnixNano: FIXED_TIME_UNIX_NANO,
                        endTimeUnixNano: FIXED_TIME_UNIX_NANO,
                        attributes: [
                            {
                                key: 'component',
                                value: { stringValue: 'PipelineRunner' },
                            },
                            { key: 'runId', value: { stringValue: 'run-1' } },
                            { key: 'pipelineId', value: { stringValue: '7' } },
                            {
                                key: 'pipelineCode',
                                value: { stringValue: 'catalog-sync' },
                            },
                            { key: 'recordCount', value: { doubleValue: 2 } },
                        ],
                        events: [{
                            name: 'batch.completed',
                            timeUnixNano: FIXED_TIME_UNIX_NANO,
                            attributes: [
                                { key: 'recordsOut', value: { doubleValue: 2 } },
                            ],
                        }],
                        status: { code: 1 },
                    }],
                }],
            }],
        });
        expect(exportedSpan.traceId).toHaveLength(32);
        expect(exportedSpan.spanId).toHaveLength(16);
        const serialized = JSON.stringify(payload);
        expect(serialized).not.toContain('record-secret');
        expect(serialized).not.toContain('credential-secret');
        expect(serialized).not.toContain('person@example.com');
        expect(serialized).not.toContain('private-user-id');
        expect(serialized).not.toContain('payload');
        expect(serialized).not.toContain('password');
    });

    it.each([429, 502, 503, 504])(
        'bounds the trace queue and retries HTTP %i without rejecting callers',
        async status => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(new Response(null, { status }))
                .mockResolvedValueOnce(successfulResponse());
            vi.stubGlobal('fetch', fetchMock);
            const exporter = createExporter({
                endpoint: COLLECTOR_ENDPOINT,
                metrics: false,
                maxQueueSize: 1,
                maxBatchSize: 1,
            });
            const factory = new DataHubLoggerFactory(exporter);

            factory.createLogger('first').startSpan('first.operation').end();
            factory.createLogger('second').startSpan('second.operation').end();

            await expect(exporter.flush()).resolves.toBeUndefined();
            await expect(exporter.flush()).resolves.toBeUndefined();

            expect(fetchMock).toHaveBeenCalledTimes(2);
            const firstBody = String((fetchMock.mock.calls[0][1] as RequestInit).body);
            const retryBody = String((fetchMock.mock.calls[1][1] as RequestInit).body);
            expect(retryBody).toBe(firstBody);
            expect(firstBody).toContain('first.operation');
            expect(firstBody).not.toContain('second.operation');
        },
    );

    it.each([400, 401, 403, 404, 500])(
        'reports and drops a trace batch after non-retryable HTTP %i',
        async status => {
            const fetchMock = vi.fn()
                .mockResolvedValue(new Response(null, { status }));
            vi.stubGlobal('fetch', fetchMock);
            const exporter = createExporter({
                endpoint: COLLECTOR_ENDPOINT,
                metrics: false,
            });
            new DataHubLoggerFactory(exporter)
                .createLogger('permanent-failure')
                .startSpan('permanent-failure.operation')
                .end();

            await expect(exporter.flush()).resolves.toBeUndefined();
            await expect(exporter.flush()).resolves.toBeUndefined();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(vi.mocked(process.stderr.write)).toHaveBeenCalledWith(
                expect.stringContaining(`OtlpHttpStatus${status}`),
            );
        },
    );

    it('contains request timeouts and keeps the timed-out trace queued for retry', async () => {
        const fetchMock = vi.fn((_url: string, request: RequestInit) => (
            new Promise<Response>((_resolve, reject) => {
                request.signal?.addEventListener('abort', () => {
                    const error = new Error('collector request timed out');
                    error.name = 'AbortError';
                    reject(error);
                });
            })
        ));
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            metrics: false,
            requestTimeoutMs: 100,
        });
        new DataHubLoggerFactory(exporter)
            .createLogger('timeout')
            .startSpan('timeout.operation')
            .end();

        const flush = exporter.flush();
        await vi.advanceTimersByTimeAsync(100);

        await expect(flush).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const failureOutput = vi.mocked(process.stderr.write).mock.calls
            .map(call => String(call[0]))
            .join('');
        expect(failureOutput).toContain('datahub_otlp_export_failure');
        expect(failureOutput).toContain('AbortError');
        expect(failureOutput).not.toContain(COLLECTOR_ENDPOINT);
        expect(failureOutput).not.toContain('collector request timed out');
    });

    it('reports OTLP partial success without logging the response or retrying accepted data', async () => {
        const collectorMessage = 'collector diagnostic containing private context';
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            partialSuccess: {
                rejectedSpans: '1',
                errorMessage: collectorMessage,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            metrics: false,
        });
        new DataHubLoggerFactory(exporter)
            .createLogger('partial')
            .startSpan('partial.operation')
            .end();

        await exporter.flush();
        await exporter.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const failureOutput = vi.mocked(process.stderr.write).mock.calls
            .map(call => String(call[0]))
            .join('');
        expect(failureOutput).toContain('OtlpPartialSuccess');
        expect(failureOutput).not.toContain(collectorMessage);
        expect(failureOutput).not.toContain(COLLECTOR_ENDPOINT);
    });

    it('bounds successful collector response reads without retrying accepted data', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('x', {
            status: 200,
            headers: { 'content-length': '65537' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const exporter = createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            metrics: false,
        });
        new DataHubLoggerFactory(exporter)
            .createLogger('large-response')
            .startSpan('large-response.operation')
            .end();

        await exporter.flush();
        await exporter.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(vi.mocked(process.stderr.write)).toHaveBeenCalledWith(
            expect.stringContaining('OtlpResponseTooLarge'),
        );
    });

    it('is inert when telemetry is absent or explicitly disabled', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const absent = new OtlpExporterService({});
        const disabled = createExporter({
            endpoint: 'not-a-valid-url',
            enabled: false,
        });
        const absentTracker = new SpanTracker(span => absent.enqueueSpan(span));
        const disabledTracker = new SpanTracker(span => disabled.enqueueSpan(span));

        absentTracker.endSpan(absentTracker.startSpan('absent').spanId);
        disabledTracker.endSpan(disabledTracker.startSpan('disabled').spanId);
        absent.onModuleInit();
        disabled.onModuleInit();
        await absent.flush();
        await disabled.flush();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects invalid active collector configuration before starting background work', () => {
        expect(() => createExporter({
            endpoint: 'ftp://collector.example.com',
        })).toThrow('telemetry.endpoint');
        expect(() => createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            requestTimeoutMs: 99,
        })).toThrow('telemetry.requestTimeoutMs');
        expect(() => createExporter({
            endpoint: COLLECTOR_ENDPOINT,
            headers: { Authorization: 'Bearer token\nInjected: value' },
        })).toThrow('telemetry.headers');
    });
});

describe('SpanTracker OTLP identity', () => {
    it('creates lowercase hex trace IDs, inherits them, and isolates callback failures', () => {
        const completed: string[] = [];
        const tracker = new SpanTracker(span => {
            completed.push(span.spanId);
            throw new Error('telemetry callback failed');
        });
        const parent = tracker.startSpan('parent');
        const child = tracker.startSpan('child', {}, parent.spanId);

        expect(parent.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(child.traceId).toBe(parent.traceId);
        expect(() => tracker.endSpan(child.spanId)).not.toThrow();
        expect(completed).toEqual([child.spanId]);
    });
});
