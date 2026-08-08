/**
 * DataHub Logger Span Tracking
 *
 * Span tracking for trace context management.
 * Compatible with OpenTelemetry patterns for future instrumentation.
 */

import { randomBytes } from 'node:crypto';
import { SpanData, SpanStatus } from './logger.types';
import { MetricsRegistry } from './metrics';
import { SPAN_TRACKER } from '../../constants/defaults/runtime-defaults';
import { generateTimestampedId } from '../../utils/id-generation.utils';

/**
 * Generate a unique span ID (simplified UUID-like)
 */
export function generateSpanId(): string {
    return generateTimestampedId('span');
}

export function generateTraceId(): string {
    return randomBytes(16).toString('hex');
}

/**
 * Tracks active spans for trace context
 */
export class SpanTracker {
    private spans = new Map<string, SpanData>();
    private completedSpans: SpanData[] = [];
    private readonly maxCompletedSpans = SPAN_TRACKER.MAX_COMPLETED_SPANS;

    constructor(
        private readonly onSpanCompleted?: (span: Readonly<SpanData>) => void,
    ) {}

    startSpan(
        name: string,
        attributes: Record<string, unknown> = {},
        parentSpanId?: string,
    ): SpanData {
        this.cleanupAbandonedSpans();

        const parentSpan = parentSpanId ? this.spans.get(parentSpanId) : undefined;
        const span: SpanData = {
            traceId: parentSpan?.traceId ?? generateTraceId(),
            spanId: generateSpanId(),
            parentSpanId,
            name,
            startTime: Date.now(),
            attributes,
            events: [],
        };
        this.spans.set(span.spanId, span);
        return span;
    }

    private cleanupAbandonedSpans(): void {
        const now = Date.now();
        const cutoff = now - SPAN_TRACKER.SPAN_TIMEOUT_MS;

        for (const [spanId, span] of this.spans.entries()) {
            if (span.startTime < cutoff) {
                span.endTime = now;
                span.status = 'error';
                span.attributes['abandoned'] = true;
                this.spans.delete(spanId);
                this.completeSpan(span);
            }
        }

        if (this.spans.size > SPAN_TRACKER.MAX_ACTIVE_SPANS) {
            const entries = Array.from(this.spans.entries())
                .sort((a, b) => a[1].startTime - b[1].startTime);
            const toRemove = entries.slice(0, this.spans.size - SPAN_TRACKER.MAX_ACTIVE_SPANS);
            for (const [spanId, span] of toRemove) {
                span.endTime = now;
                span.status = 'error';
                span.attributes['evicted'] = true;
                this.spans.delete(spanId);
                this.completeSpan(span);
            }
        }
    }

    private completeSpan(span: SpanData): void {
        this.completedSpans.push(span);
        if (this.completedSpans.length > this.maxCompletedSpans) {
            this.completedSpans.shift();
        }
        try {
            this.onSpanCompleted?.(span);
        } catch {
            // Telemetry callbacks must never interrupt application execution.
        }
    }

    addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
        const span = this.spans.get(spanId);
        if (span) {
            if (span.events.length >= SPAN_TRACKER.MAX_EVENTS_PER_SPAN) {
                span.droppedEventsCount = (span.droppedEventsCount ?? 0) + 1;
                return;
            }
            span.events.push({
                name,
                timestamp: Date.now(),
                attributes,
            });
        }
    }

    endSpan(spanId: string, status: SpanStatus = 'ok'): SpanData | undefined {
        const span = this.spans.get(spanId);
        if (span) {
            span.endTime = Date.now();
            span.status = status;
            this.spans.delete(spanId);

            this.completeSpan(span);

            return span;
        }
        return undefined;
    }

    getSpan(spanId: string): SpanData | undefined {
        return this.spans.get(spanId);
    }

    getActiveSpans(): SpanData[] {
        return Array.from(this.spans.values());
    }

    getCompletedSpans(): SpanData[] {
        return [...this.completedSpans];
    }

    clear(): void {
        this.spans.clear();
        this.completedSpans = [];
    }
}

/**
 * SpanContext - Manages the lifecycle of a single span.
 * Fluent interface for adding events and ending the span.
 */
export class SpanContext {
    constructor(
        private readonly span: SpanData,
        private readonly tracker: SpanTracker,
        private readonly metricsRegistry?: MetricsRegistry,
    ) {}

    /**
     * Get span ID
     */
    get spanId(): string {
        return this.span.spanId;
    }

    /**
     * Add an event to this span
     */
    addEvent(name: string, attributes?: Record<string, unknown>): SpanContext {
        this.tracker.addEvent(this.span.spanId, name, attributes);
        return this;
    }

    /**
     * Set an attribute on this span
     */
    setAttribute(key: string, value: unknown): SpanContext {
        this.span.attributes[key] = value;
        return this;
    }

    /**
     * End this span
     */
    end(status: SpanStatus = 'ok'): SpanData {
        const completed = this.tracker.endSpan(this.span.spanId, status);

        // Record span duration in histogram
        if (completed && this.metricsRegistry) {
            const durationMs = (completed.endTime ?? Date.now()) - completed.startTime;
            this.metricsRegistry.getHistogram('datahub_span_duration_ms').record(durationMs, {
                operation: completed.name,
                status,
            });
        }

        return completed ?? this.span;
    }

    /**
     * Get duration so far (or final duration if ended)
     */
    getDuration(): number {
        return (this.span.endTime ?? Date.now()) - this.span.startTime;
    }
}
