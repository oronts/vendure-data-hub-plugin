import { randomUUID } from 'node:crypto';
import {
    Inject,
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS } from '../../constants/core';
import { OTLP_TELEMETRY } from '../../constants/defaults/telemetry-defaults';
import type { DataHubPluginOptions } from '../../types';
import type { SpanData } from './logger.types';
import type { MetricsRegistry } from './metrics';
import {
    createMetricsPayload,
    createOtlpSpan,
    createTracesPayload,
    resolveOtlpConfig,
    toUnixNano,
} from './otlp-payload';
import type {
    OtlpSpan,
    ResolvedTelemetryConfig,
} from './otlp-payload';

const TRACE_SIGNAL_PATH = '/v1/traces';
const METRIC_SIGNAL_PATH = '/v1/metrics';
const CONTENT_TYPE_HEADER = 'content-type';
const CONTENT_TYPE_JSON = 'application/json';
const TELEMETRY_FAILURE_EVENT = 'datahub_otlp_export_failure';
const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([
    429,
    502,
    503,
    504,
]);

class OtlpHttpError extends Error {
    readonly retryable: boolean;

    constructor(status: number) {
        super(`OTLP collector returned HTTP ${status}`);
        this.name = `OtlpHttpStatus${status}`;
        this.retryable = RETRYABLE_HTTP_STATUSES.has(status);
    }
}

function createTelemetryError(name: string): Error {
    const error = new Error(name);
    error.name = name;
    return error;
}

function hasRejectedItems(value: unknown): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        try {
            return BigInt(value) > 0n;
        } catch {
            return false;
        }
    }
    return false;
}

async function readBoundedBody(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (
        Number.isFinite(declaredLength)
        && declaredLength > OTLP_TELEMETRY.MAX_RESPONSE_BODY_BYTES
    ) {
        await response.body?.cancel();
        throw createTelemetryError('OtlpResponseTooLarge');
    }
    if (!response.body) {
        return '';
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    let complete = false;
    while (!complete) {
        const { done, value } = await reader.read();
        complete = done;
        if (!value) {
            continue;
        }
        totalLength += value.byteLength;
        if (totalLength > OTLP_TELEMETRY.MAX_RESPONSE_BODY_BYTES) {
            await reader.cancel();
            throw createTelemetryError('OtlpResponseTooLarge');
        }
        chunks.push(value);
    }

    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

@Injectable()
export class OtlpExporterService implements OnModuleInit, OnModuleDestroy {
    private readonly config: ResolvedTelemetryConfig | undefined;
    private readonly startTimeUnixNano = toUnixNano(Date.now());
    private readonly spanQueue: OtlpSpan[] = [];
    private metricsRegistry?: MetricsRegistry;
    private interval?: ReturnType<typeof setInterval>;
    private activeFlush?: Promise<void>;
    private lastFailureReportAt = 0;

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS)
        options: DataHubPluginOptions,
    ) {
        const config = resolveOtlpConfig(options.telemetry);
        this.config = config
            ? { ...config, serviceInstanceId: randomUUID() }
            : undefined;
    }

    onModuleInit(): void {
        if (!this.config) {
            return;
        }
        this.interval = setInterval(() => {
            void this.flush();
        }, this.config.exportIntervalMs);
        this.interval.unref();
    }

    async onModuleDestroy(): Promise<void> {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        await this.flush();
        if (this.spanQueue.length > 0) {
            await this.flush();
        }
    }

    bindMetricsRegistry(registry: MetricsRegistry): void {
        this.metricsRegistry = registry;
    }

    enqueueSpan(span: Readonly<SpanData>): void {
        if (!this.config?.traces || span.endTime === undefined) {
            return;
        }
        if (this.spanQueue.length >= this.config.maxQueueSize) {
            this.reportFailure('traces', new Error('SpanQueueFull'));
            return;
        }
        this.spanQueue.push(createOtlpSpan(span));
    }

    flush(): Promise<void> {
        if (!this.config) {
            return Promise.resolve();
        }
        if (this.activeFlush) {
            return this.activeFlush;
        }
        this.activeFlush = this.performFlush().finally(() => {
            this.activeFlush = undefined;
        });
        return this.activeFlush;
    }

    private async performFlush(): Promise<void> {
        if (!this.config) {
            return;
        }
        const exports: Promise<void>[] = [];
        if (this.config.metrics && this.metricsRegistry) {
            const metricsPayload = createMetricsPayload(
                this.config,
                this.metricsRegistry,
                this.startTimeUnixNano,
                Date.now(),
            );
            if (metricsPayload) {
                exports.push(this.exportPayload(METRIC_SIGNAL_PATH, metricsPayload, 'metrics'));
            }
        }
        if (this.config.traces && this.spanQueue.length > 0) {
            const batch = this.spanQueue.splice(0, this.config.maxBatchSize);
            const tracesPayload = createTracesPayload(this.config, batch);
            exports.push(
                this.exportPayload(TRACE_SIGNAL_PATH, tracesPayload, 'traces')
                    .catch(error => {
                        if (!(error instanceof OtlpHttpError) || error.retryable) {
                            this.requeueSpans(batch);
                        }
                        this.reportFailure('traces', error);
                    }),
            );
        }
        await Promise.all(exports);
    }

    private async exportPayload(
        signalPath: string,
        payload: object,
        signal: 'metrics' | 'traces',
    ): Promise<void> {
        if (!this.config) {
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
        timeout.unref();
        try {
            const response = await fetch(`${this.config.endpoint}${signalPath}`, {
                method: 'POST',
                headers: {
                    ...this.config.headers,
                    [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new OtlpHttpError(response.status);
            }
            await this.inspectPartialSuccess(response, signal);
        } catch (error) {
            if (signal === 'metrics') {
                this.reportFailure(signal, error);
                return;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async inspectPartialSuccess(
        response: Response,
        signal: 'metrics' | 'traces',
    ): Promise<void> {
        let body: string;
        try {
            body = await readBoundedBody(response);
        } catch (error) {
            this.reportFailure(signal, error);
            return;
        }
        if (!body.trim()) {
            return;
        }

        let responsePayload: unknown;
        try {
            responsePayload = JSON.parse(body);
        } catch {
            this.reportFailure(signal, createTelemetryError('OtlpInvalidResponse'));
            return;
        }
        if (!responsePayload || typeof responsePayload !== 'object') {
            return;
        }
        const partialSuccess = Reflect.get(responsePayload, 'partialSuccess');
        if (!partialSuccess || typeof partialSuccess !== 'object') {
            return;
        }
        const rejectedField = signal === 'traces'
            ? 'rejectedSpans'
            : 'rejectedDataPoints';
        if (hasRejectedItems(Reflect.get(partialSuccess, rejectedField))) {
            this.reportFailure(signal, createTelemetryError('OtlpPartialSuccess'));
        }
    }

    private requeueSpans(batch: OtlpSpan[]): void {
        if (!this.config) {
            return;
        }
        const available = Math.max(0, this.config.maxQueueSize - this.spanQueue.length);
        if (available > 0) {
            this.spanQueue.unshift(...batch.slice(0, available));
        }
    }

    private reportFailure(signal: 'metrics' | 'traces', error: unknown): void {
        const now = Date.now();
        if (now - this.lastFailureReportAt < OTLP_TELEMETRY.FAILURE_REPORT_INTERVAL_MS) {
            return;
        }
        this.lastFailureReportAt = now;
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        try {
            process.stderr.write(`${JSON.stringify({
                event: TELEMETRY_FAILURE_EVENT,
                signal,
                errorName,
            })}\n`);
        } catch {
            // Observability failures must never interrupt application execution.
        }
    }
}
