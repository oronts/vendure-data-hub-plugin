import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPAN_TRACKER } from '../../constants/defaults/runtime-defaults';
import { DataHubLoggerFactory } from './datahub-logger';
import { OtlpExporterService } from './otlp-exporter.service';

describe('OTLP span event limits', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('retains the earliest events and reports later events as dropped', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const exporter = new OtlpExporterService({
            telemetry: {
                endpoint: 'https://collector.example.com',
                metrics: false,
            },
        });
        const span = new DataHubLoggerFactory(exporter)
            .createLogger('runner')
            .startSpan('pipeline.execute');
        const omittedEvents = 3;

        for (
            let eventIndex = 0;
            eventIndex < SPAN_TRACKER.MAX_EVENTS_PER_SPAN + omittedEvents;
            eventIndex += 1
        ) {
            span.addEvent(`event-${eventIndex}`, { recordsOut: eventIndex });
        }
        span.end();
        await exporter.flush();

        const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
        const payload = JSON.parse(String(request.body));
        const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
        expect(exportedSpan.events).toHaveLength(SPAN_TRACKER.MAX_EVENTS_PER_SPAN);
        expect(exportedSpan.events[0].name).toBe('event-0');
        expect(exportedSpan.events.at(-1).name).toBe(
            `event-${SPAN_TRACKER.MAX_EVENTS_PER_SPAN - 1}`,
        );
        expect(exportedSpan.droppedEventsCount).toBe(omittedEvents);
    });
});
