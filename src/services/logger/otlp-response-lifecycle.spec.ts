import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataHubLoggerFactory } from './datahub-logger';
import { OtlpExporterService } from './otlp-exporter.service';

describe('OTLP response lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('cancels a non-success response body before classifying the failure', async () => {
        const cancel = vi.fn();
        const responseBody = new ReadableStream<Uint8Array>({ cancel });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(responseBody, { status: 503 })),
        );
        vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        const exporter = new OtlpExporterService({
            telemetry: {
                endpoint: 'https://collector.example.com',
                metrics: false,
            },
        });
        new DataHubLoggerFactory(exporter)
            .createLogger('runner')
            .startSpan('pipeline.execute')
            .end();

        await exporter.flush();

        expect(cancel).toHaveBeenCalledOnce();
    });
});
