import { createHash } from 'node:crypto';
import { SPAN_TRACKER } from '../../constants/defaults/runtime-defaults';
import { OTLP_TELEMETRY } from '../../constants/defaults/telemetry-defaults';
import type { OtlpTelemetryConfig } from '../../types';
import type { SpanData } from './logger.types';
import type { MetricsRegistry } from './metrics';

type OtlpAnyValue =
    | { stringValue: string }
    | { doubleValue: number }
    | { boolValue: boolean };

interface OtlpAttribute {
    key: string;
    value: OtlpAnyValue;
}

export interface OtlpSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: OtlpAttribute[];
    events: Array<{
        name: string;
        timeUnixNano: string;
        attributes: OtlpAttribute[];
    }>;
    droppedEventsCount?: number;
    status: { code: number };
}

export interface ResolvedTelemetryConfig {
    endpoint: string;
    metrics: boolean;
    traces: boolean;
    headers: Readonly<Record<string, string>>;
    serviceName: string;
    serviceInstanceId: string;
    serviceVersion?: string;
    environment?: string;
    exportIntervalMs: number;
    requestTimeoutMs: number;
    maxQueueSize: number;
    maxBatchSize: number;
    maxRequestBodyBytes: number;
}

const SAFE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
    'abandoned',
    'adapterCode',
    'category',
    'channelCode',
    'component',
    'durationMs',
    'entityType',
    'errorCategory',
    'errorCode',
    'evicted',
    'exporter',
    'exporterCode',
    'extractor',
    'extractorCode',
    'loader',
    'loaderCode',
    'operation',
    'pipeline',
    'pipelineCode',
    'pipelineId',
    'recordCount',
    'recordsFailed',
    'recordsIn',
    'recordsIndexed',
    'recordsOut',
    'recordsSkipped',
    'recordsSucceeded',
    'runId',
    'sink',
    'sinkCode',
    'status',
    'step',
    'stepKey',
    'stepType',
    'throughput',
    'type',
]);

const CONTENT_TYPE_HEADER = 'content-type';
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SPAN_KIND_INTERNAL = 1;
const STATUS_CODE_UNSET = 0;
const STATUS_CODE_OK = 1;
const STATUS_CODE_ERROR = 2;
const AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

export function toUnixNano(timestampMs: number): string {
    return (BigInt(Math.trunc(timestampMs)) * 1_000_000n).toString();
}

function truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function requireBoundedInteger(
    name: string,
    value: number,
    minimum: number,
    maximum: number,
): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function resolveHeaders(headers: Record<string, string> | undefined): Readonly<Record<string, string>> {
    const entries = Object.entries(headers ?? {});
    if (entries.length > OTLP_TELEMETRY.MAX_HEADER_COUNT) {
        throw new Error(`telemetry.headers supports at most ${OTLP_TELEMETRY.MAX_HEADER_COUNT} entries`);
    }

    const resolved: Record<string, string> = {};
    for (const [name, value] of entries) {
        if (
            name.length === 0
            || name.length > OTLP_TELEMETRY.MAX_HEADER_NAME_LENGTH
            || !HEADER_NAME_PATTERN.test(name)
        ) {
            throw new Error('telemetry.headers contains an invalid header name');
        }
        if (
            typeof value !== 'string'
            || value.length > OTLP_TELEMETRY.MAX_HEADER_VALUE_LENGTH
            || /[\r\n]/.test(value)
        ) {
            throw new Error(`telemetry.headers contains an invalid value for ${name}`);
        }
        if (name.toLowerCase() !== CONTENT_TYPE_HEADER) {
            resolved[name] = value;
        }
    }
    return resolved;
}

function resolveEndpoint(endpoint: string): string {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        throw new Error('telemetry.endpoint must be a valid HTTP or HTTPS URL');
    }
    if (
        (url.protocol !== 'http:' && url.protocol !== 'https:')
        || url.username
        || url.password
        || url.search
        || url.hash
    ) {
        throw new Error('telemetry.endpoint must be an HTTP or HTTPS collector base URL without credentials, query, or fragment');
    }
    return url.toString().replace(/\/$/, '');
}

export function resolveOtlpConfig(
    config: OtlpTelemetryConfig | undefined,
): Omit<ResolvedTelemetryConfig, 'serviceInstanceId'> | undefined {
    if (!config || config.enabled === false) {
        return undefined;
    }

    const metrics = config.metrics ?? true;
    const traces = config.traces ?? true;
    if (!metrics && !traces) {
        return undefined;
    }

    return {
        endpoint: resolveEndpoint(config.endpoint),
        metrics,
        traces,
        headers: resolveHeaders(config.headers),
        serviceName: truncate(
            config.serviceName?.trim() || OTLP_TELEMETRY.DEFAULT_SERVICE_NAME,
            OTLP_TELEMETRY.MAX_RESOURCE_ATTRIBUTE_LENGTH,
        ),
        serviceVersion: config.serviceVersion
            ? truncate(config.serviceVersion.trim(), OTLP_TELEMETRY.MAX_RESOURCE_ATTRIBUTE_LENGTH)
            : undefined,
        environment: config.environment
            ? truncate(config.environment.trim(), OTLP_TELEMETRY.MAX_RESOURCE_ATTRIBUTE_LENGTH)
            : undefined,
        exportIntervalMs: requireBoundedInteger(
            'telemetry.exportIntervalMs',
            config.exportIntervalMs ?? OTLP_TELEMETRY.DEFAULT_EXPORT_INTERVAL_MS,
            OTLP_TELEMETRY.MIN_EXPORT_INTERVAL_MS,
            OTLP_TELEMETRY.MAX_EXPORT_INTERVAL_MS,
        ),
        requestTimeoutMs: requireBoundedInteger(
            'telemetry.requestTimeoutMs',
            config.requestTimeoutMs ?? OTLP_TELEMETRY.DEFAULT_REQUEST_TIMEOUT_MS,
            OTLP_TELEMETRY.MIN_REQUEST_TIMEOUT_MS,
            OTLP_TELEMETRY.MAX_REQUEST_TIMEOUT_MS,
        ),
        maxQueueSize: requireBoundedInteger(
            'telemetry.maxQueueSize',
            config.maxQueueSize ?? OTLP_TELEMETRY.DEFAULT_MAX_QUEUE_SIZE,
            OTLP_TELEMETRY.MIN_MAX_QUEUE_SIZE,
            OTLP_TELEMETRY.MAX_MAX_QUEUE_SIZE,
        ),
        maxBatchSize: requireBoundedInteger(
            'telemetry.maxBatchSize',
            config.maxBatchSize ?? OTLP_TELEMETRY.DEFAULT_MAX_BATCH_SIZE,
            OTLP_TELEMETRY.MIN_MAX_BATCH_SIZE,
            OTLP_TELEMETRY.MAX_MAX_BATCH_SIZE,
        ),
        maxRequestBodyBytes: requireBoundedInteger(
            'telemetry.maxRequestBodyBytes',
            config.maxRequestBodyBytes ?? OTLP_TELEMETRY.DEFAULT_MAX_REQUEST_BODY_BYTES,
            OTLP_TELEMETRY.MIN_MAX_REQUEST_BODY_BYTES,
            OTLP_TELEMETRY.MAX_MAX_REQUEST_BODY_BYTES,
        ),
    };
}

function toAttributeValue(value: unknown): OtlpAnyValue | undefined {
    if (typeof value === 'string') {
        return { stringValue: truncate(value, OTLP_TELEMETRY.MAX_ATTRIBUTE_LENGTH) };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return { doubleValue: value };
    }
    if (typeof value === 'boolean') {
        return { boolValue: value };
    }
    return undefined;
}

function toSafeAttributes(attributes: Record<string, unknown> | undefined): OtlpAttribute[] {
    if (!attributes) {
        return [];
    }
    const result: OtlpAttribute[] = [];
    for (const [key, value] of Object.entries(attributes)) {
        if (!SAFE_ATTRIBUTE_NAMES.has(key)) {
            continue;
        }
        const otlpValue = toAttributeValue(value);
        if (otlpValue) {
            result.push({ key, value: otlpValue });
        }
    }
    return result;
}

function hashIdentifier(value: string, length: number): string {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function toStatusCode(status: SpanData['status']): number {
    if (status === 'ok') {
        return STATUS_CODE_OK;
    }
    if (status === 'error' || status === 'cancelled') {
        return STATUS_CODE_ERROR;
    }
    return STATUS_CODE_UNSET;
}

export function createOtlpSpan(span: Readonly<SpanData>): OtlpSpan {
    const retainedEvents = span.events.slice(0, SPAN_TRACKER.MAX_EVENTS_PER_SPAN);
    const droppedEventsCount = (span.droppedEventsCount ?? 0)
        + Math.max(0, span.events.length - retainedEvents.length);

    return {
        traceId: TRACE_ID_PATTERN.test(span.traceId)
            ? span.traceId
            : hashIdentifier(span.traceId, 32),
        spanId: hashIdentifier(span.spanId, 16),
        parentSpanId: span.parentSpanId
            ? hashIdentifier(span.parentSpanId, 16)
            : undefined,
        name: truncate(span.name, OTLP_TELEMETRY.MAX_ATTRIBUTE_LENGTH),
        kind: SPAN_KIND_INTERNAL,
        startTimeUnixNano: toUnixNano(span.startTime),
        endTimeUnixNano: toUnixNano(span.endTime ?? span.startTime),
        attributes: toSafeAttributes(span.attributes),
        events: retainedEvents.map(event => ({
            name: truncate(event.name, OTLP_TELEMETRY.MAX_ATTRIBUTE_LENGTH),
            timeUnixNano: toUnixNano(event.timestamp),
            attributes: toSafeAttributes(event.attributes),
        })),
        ...(droppedEventsCount > 0 ? { droppedEventsCount } : {}),
        status: { code: toStatusCode(span.status) },
    };
}

function createResourceAttributes(config: ResolvedTelemetryConfig): OtlpAttribute[] {
    const attributes: OtlpAttribute[] = [
        { key: 'service.name', value: { stringValue: config.serviceName } },
        { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
        {
            key: 'service.instance.id',
            value: { stringValue: config.serviceInstanceId },
        },
    ];
    if (config.serviceVersion) {
        attributes.push({
            key: 'service.version',
            value: { stringValue: config.serviceVersion },
        });
    }
    if (config.environment) {
        attributes.push({
            key: 'deployment.environment.name',
            value: { stringValue: config.environment },
        });
    }
    return attributes;
}

function createScope(): { name: string } {
    return { name: OTLP_TELEMETRY.INSTRUMENTATION_SCOPE_NAME };
}

export function createTracesPayload(
    config: ResolvedTelemetryConfig,
    spans: OtlpSpan[],
): object {
    return {
        resourceSpans: [{
            resource: { attributes: createResourceAttributes(config) },
            scopeSpans: [{
                scope: createScope(),
                spans,
            }],
        }],
    };
}

export function createMetricsPayload(
    config: ResolvedTelemetryConfig,
    registry: MetricsRegistry,
    startTimeUnixNano: string,
    timestampMs: number,
): object | undefined {
    const snapshot = registry.getSeriesSnapshot();
    const timeUnixNano = toUnixNano(timestampMs);
    const countersByName = new Map<string, typeof snapshot.counters>();
    for (const counter of snapshot.counters) {
        const series = countersByName.get(counter.name) ?? [];
        series.push(counter);
        countersByName.set(counter.name, series);
    }
    const histogramsByName = new Map<string, typeof snapshot.histograms>();
    for (const histogram of snapshot.histograms) {
        const series = histogramsByName.get(histogram.name) ?? [];
        series.push(histogram);
        histogramsByName.set(histogram.name, series);
    }
    const metrics = [
        ...Array.from(countersByName.entries()).map(([name, series]) => ({
            name,
            sum: {
                aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
                isMonotonic: true,
                dataPoints: series.map(counter => ({
                    attributes: toSafeAttributes(counter.labels),
                    startTimeUnixNano,
                    timeUnixNano,
                    asDouble: counter.value,
                })),
            },
        })),
        ...Array.from(histogramsByName.entries()).map(([name, series]) => ({
            name,
            summary: {
                dataPoints: series
                    .filter(histogram => histogram.count > 0)
                    .map(histogram => ({
                        attributes: toSafeAttributes(histogram.labels),
                        startTimeUnixNano,
                        timeUnixNano,
                        count: String(histogram.count),
                        sum: histogram.sum,
                    })),
            },
        })),
    ];
    if (metrics.length === 0) {
        return undefined;
    }
    return {
        resourceMetrics: [{
            resource: { attributes: createResourceAttributes(config) },
            scopeMetrics: [{
                scope: createScope(),
                metrics,
            }],
        }],
    };
}
