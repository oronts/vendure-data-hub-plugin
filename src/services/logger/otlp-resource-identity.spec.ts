import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataHubLoggerFactory } from './datahub-logger';
import { OtlpExporterService } from './otlp-exporter.service';

const INSTANCE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function getInstanceId(payload: string, signal: 'metrics' | 'traces'): string {
    const parsed = JSON.parse(payload);
    const resource = signal === 'metrics'
        ? parsed.resourceMetrics[0].resource
        : parsed.resourceSpans[0].resource;
    return resource.attributes.find(
        (attribute: { key: string }) => attribute.key === 'service.instance.id',
    ).value.stringValue;
}

describe('OTLP resource identity', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uses one stable random instance ID for metrics and traces', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const exporter = new OtlpExporterService({
            telemetry: {
                endpoint: 'https://collector.example.com',
            },
        });
        new DataHubLoggerFactory(exporter)
            .createLogger('runner')
            .startSpan('pipeline.execute')
            .end();

        await exporter.flush();

        const requests = new Map(
            fetchMock.mock.calls.map(([url, request]) => [
                String(url).endsWith('/v1/metrics') ? 'metrics' : 'traces',
                String((request as RequestInit).body),
            ]),
        );
        const metricsBody = requests.get('metrics');
        const tracesBody = requests.get('traces');
        expect(metricsBody).toBeDefined();
        expect(tracesBody).toBeDefined();
        const metricsInstanceId = getInstanceId(metricsBody ?? '{}', 'metrics');
        const tracesInstanceId = getInstanceId(tracesBody ?? '{}', 'traces');
        expect(metricsInstanceId).toMatch(INSTANCE_ID_PATTERN);
        expect(tracesInstanceId).toBe(metricsInstanceId);
    });
});
