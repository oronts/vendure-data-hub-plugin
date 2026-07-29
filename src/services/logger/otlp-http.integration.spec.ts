import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OTLP_TELEMETRY } from '../../constants/defaults/telemetry-defaults';
import { DataHubLoggerFactory } from './datahub-logger';
import { OtlpExporterService } from './otlp-exporter.service';

interface CollectorRequest {
    path: string;
    headers: IncomingHttpHeaders;
    payload: Record<string, unknown>;
}

interface CollectorHandle {
    endpoint: string;
    requests: CollectorRequest[];
    close(): Promise<void>;
}

interface OtlpAttribute {
    key: string;
    value: {
        stringValue?: string;
        doubleValue?: number;
        boolValue?: boolean;
    };
}

type Signal = 'metrics' | 'traces';

async function startCollector(
    resolveStatus: (request: CollectorRequest, requestIndex: number) => number = () => 200,
): Promise<CollectorHandle> {
    const requests: CollectorRequest[] = [];
    const server = createServer(async (request, response) => {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString('utf8');
            const collectedRequest: CollectorRequest = {
                path: request.url ?? '',
                headers: request.headers,
                payload: JSON.parse(body) as Record<string, unknown>,
            };
            requests.push(collectedRequest);
            response.writeHead(resolveStatus(collectedRequest, requests.length - 1), {
                'content-type': 'application/json',
            });
            response.end('{}');
        } catch {
            response.writeHead(400);
            response.end();
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address() as AddressInfo;

    return {
        endpoint: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        }),
    };
}

function getResourceAttributes(
    payload: Record<string, unknown>,
    signal: Signal,
): OtlpAttribute[] {
    if (signal === 'metrics') {
        const resourceMetrics = Reflect.get(payload, 'resourceMetrics') as Array<{
            resource: { attributes: OtlpAttribute[] };
        }>;
        return resourceMetrics[0].resource.attributes;
    }
    const resourceSpans = Reflect.get(payload, 'resourceSpans') as Array<{
        resource: { attributes: OtlpAttribute[] };
    }>;
    return resourceSpans[0].resource.attributes;
}

function attributesByName(attributes: OtlpAttribute[]): Map<string, OtlpAttribute['value']> {
    return new Map(attributes.map(attribute => [attribute.key, attribute.value]));
}

describe('OTLP HTTP integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exports metrics and traces with shared resource identity to a real receiver', async () => {
        const collector = await startCollector();
        try {
            const exporter = new OtlpExporterService({
                telemetry: {
                    endpoint: collector.endpoint,
                    headers: { 'x-collector-token': 'local-test-token' },
                    serviceName: 'vendure-data-hub',
                    serviceVersion: '0.1.7',
                    environment: 'integration',
                },
            });
            const factory = new DataHubLoggerFactory(exporter);
            factory.getMetricsRegistry()
                .getCounter('datahub_records_total')
                .increment(4, { pipelineCode: 'catalog-sync' });
            factory.createLogger('PipelineRunner', {
                pipelineCode: 'catalog-sync',
                runId: 'run-42',
                userId: 'private-user-id',
            }).startSpan('pipeline.execute', {
                recordCount: 4,
                password: 'private-credential',
            }).end('ok');

            await exporter.flush();

            expect(collector.requests).toHaveLength(2);
            const metricsRequest = collector.requests.find(request => request.path === '/v1/metrics');
            const tracesRequest = collector.requests.find(request => request.path === '/v1/traces');
            expect(metricsRequest).toBeDefined();
            expect(tracesRequest).toBeDefined();
            expect(metricsRequest?.headers['content-type']).toBe('application/json');
            expect(tracesRequest?.headers['content-type']).toBe('application/json');
            expect(metricsRequest?.headers['x-collector-token']).toBe('local-test-token');
            expect(tracesRequest?.headers['x-collector-token']).toBe('local-test-token');

            const metricAttributes = attributesByName(
                getResourceAttributes(metricsRequest?.payload ?? {}, 'metrics'),
            );
            const traceAttributes = attributesByName(
                getResourceAttributes(tracesRequest?.payload ?? {}, 'traces'),
            );
            expect(metricAttributes.get('service.name')?.stringValue).toBe('vendure-data-hub');
            expect(metricAttributes.get('service.version')?.stringValue).toBe('0.1.7');
            expect(metricAttributes.get('deployment.environment.name')?.stringValue)
                .toBe('integration');
            expect(metricAttributes.get('telemetry.sdk.language')?.stringValue).toBe('nodejs');
            expect(metricAttributes.get('service.instance.id')?.stringValue)
                .toMatch(/^[0-9a-f-]{36}$/);
            expect(traceAttributes).toEqual(metricAttributes);

            const metricsBody = JSON.stringify(metricsRequest?.payload);
            const tracesBody = JSON.stringify(tracesRequest?.payload);
            expect(metricsBody).toContain('datahub_records_total');
            expect(metricsBody).toContain('datahub_span_duration_ms');
            expect(tracesBody).toContain('pipeline.execute');
            expect(tracesBody).toContain('catalog-sync');
            expect(tracesBody).toContain('run-42');
            expect(tracesBody).not.toContain('private-user-id');
            expect(tracesBody).not.toContain('private-credential');
            expect(tracesBody).not.toContain('password');
        } finally {
            await collector.close();
        }
    });

    it('requeues a batch after a real retryable collector response', async () => {
        const collector = await startCollector((_request, requestIndex) => (
            requestIndex === 0 ? 503 : 200
        ));
        const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        try {
            const exporter = new OtlpExporterService({
                telemetry: {
                    endpoint: collector.endpoint,
                    metrics: false,
                    maxBatchSize: 1,
                },
            });
            new DataHubLoggerFactory(exporter)
                .createLogger('PipelineRunner')
                .startSpan('pipeline.retryable')
                .end('error');

            await exporter.flush();
            await new Promise(resolve => setTimeout(
                resolve,
                OTLP_TELEMETRY.INITIAL_RETRY_DELAY_MS
                    * (1 + OTLP_TELEMETRY.RETRY_JITTER_RATIO)
                    + 50,
            ));
            await exporter.flush();

            expect(collector.requests).toHaveLength(2);
            expect(collector.requests[0].path).toBe('/v1/traces');
            expect(collector.requests[1].payload).toEqual(collector.requests[0].payload);
            expect(stderr).toHaveBeenCalledWith(
                expect.stringContaining('OtlpHttpStatus503'),
            );
        } finally {
            await collector.close();
        }
    });

    it('drains every queued trace batch during graceful shutdown', async () => {
        const collector = await startCollector();
        try {
            const exporter = new OtlpExporterService({
                telemetry: {
                    endpoint: collector.endpoint,
                    metrics: false,
                    maxBatchSize: 1,
                },
            });
            const factory = new DataHubLoggerFactory(exporter);
            for (let spanIndex = 0; spanIndex < 3; spanIndex += 1) {
                factory.createLogger('PipelineRunner')
                    .startSpan(`pipeline.shutdown.${spanIndex}`)
                    .end();
            }

            await exporter.onModuleDestroy();

            expect(collector.requests).toHaveLength(3);
            expect(collector.requests.map(request => request.path))
                .toEqual(['/v1/traces', '/v1/traces', '/v1/traces']);
            const exportedBodies = collector.requests.map(request => JSON.stringify(request.payload));
            expect(exportedBodies[0]).toContain('pipeline.shutdown.0');
            expect(exportedBodies[1]).toContain('pipeline.shutdown.1');
            expect(exportedBodies[2]).toContain('pipeline.shutdown.2');
        } finally {
            await collector.close();
        }
    });
});
