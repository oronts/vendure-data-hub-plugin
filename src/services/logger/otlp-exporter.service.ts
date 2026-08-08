import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
    Inject,
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Agent, type Dispatcher } from 'undici';
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
type TelemetrySignal = 'metrics' | 'traces';
type OtlpRequestInit = RequestInit & { dispatcher?: Dispatcher };

interface RetryState {
    failures: number;
    nextAttemptAt: number;
}

class OtlpExportError extends Error {
    constructor(
        name: string,
        message: string,
        readonly retryable: boolean,
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = name;
    }
}

class OtlpHttpError extends OtlpExportError {
    constructor(status: number, retryAfterMs?: number) {
        super(
            `OtlpHttpStatus${status}`,
            `OTLP collector returned HTTP ${status}`,
            RETRYABLE_HTTP_STATUSES.has(status),
            retryAfterMs,
        );
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

function parseRetryAfter(value: string | null, now: number): number | undefined {
    const normalized = value?.trim();
    if (!normalized) {
        return undefined;
    }
    let delayMs: number;
    if (/^\d+$/.test(normalized)) {
        delayMs = Number(normalized) * 1_000;
    } else {
        delayMs = Date.parse(normalized) - now;
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
        return undefined;
    }
    return Math.min(delayMs, OTLP_TELEMETRY.MAX_RETRY_AFTER_MS);
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
    private readonly dispatcher?: Agent;
    private metricsRegistry?: MetricsRegistry;
    private interval?: ReturnType<typeof setInterval>;
    private activeFlush?: Promise<void>;
    private lastFailureReportAt = 0;
    private readonly retryStates: Record<TelemetrySignal, RetryState> = {
        metrics: { failures: 0, nextAttemptAt: 0 },
        traces: { failures: 0, nextAttemptAt: 0 },
    };

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS)
        options: DataHubPluginOptions,
    ) {
        const config = resolveOtlpConfig(options.telemetry);
        this.config = config
            ? { ...config, serviceInstanceId: randomUUID() }
            : undefined;
        this.dispatcher = config?.tls
            ? new Agent({
                connect: {
                    ca: config.tls.caFile
                        ? readFileSync(config.tls.caFile)
                        : undefined,
                    cert: config.tls.clientCertificateFile
                        ? readFileSync(config.tls.clientCertificateFile)
                        : undefined,
                    key: config.tls.clientKeyFile
                        ? readFileSync(config.tls.clientKeyFile)
                        : undefined,
                    passphrase: config.tls.clientKeyPassphrase,
                    rejectUnauthorized: true,
                },
            })
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
        if (!this.config) {
            return;
        }
        const remainingBatchCount = Math.ceil(
            this.spanQueue.length / this.config.maxBatchSize,
        );
        for (
            let batchIndex = 0;
            batchIndex < remainingBatchCount && this.spanQueue.length > 0;
            batchIndex += 1
        ) {
            const queuedBeforeFlush = this.spanQueue.length;
            await this.flush();
            if (this.spanQueue.length >= queuedBeforeFlush) {
                break;
            }
        }
        await this.dispatcher?.close();
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
        if (
            this.config.metrics
            && this.metricsRegistry
            && this.canAttemptExport('metrics')
        ) {
            const metricsPayload = createMetricsPayload(
                this.config,
                this.metricsRegistry,
                this.startTimeUnixNano,
                Date.now(),
            );
            if (metricsPayload) {
                exports.push(
                    this.exportPayload(METRIC_SIGNAL_PATH, metricsPayload, 'metrics')
                        .then(() => this.resetRetryState('metrics'))
                        .catch(error => this.handleExportFailure('metrics', error)),
                );
            }
        }
        if (
            this.config.traces
            && this.spanQueue.length > 0
            && this.canAttemptExport('traces')
        ) {
            const batch = this.spanQueue.splice(0, this.config.maxBatchSize);
            const tracesPayload = createTracesPayload(this.config, batch);
            exports.push(
                this.exportPayload(TRACE_SIGNAL_PATH, tracesPayload, 'traces')
                    .then(() => this.resetRetryState('traces'))
                    .catch(error => {
                        if (this.isRetryable(error)) {
                            this.requeueSpans(batch);
                        }
                        this.handleExportFailure('traces', error);
                    }),
            );
        }
        await Promise.all(exports);
    }

    private async exportPayload(
        signalPath: string,
        payload: object,
        signal: TelemetrySignal,
    ): Promise<void> {
        if (!this.config) {
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
        timeout.unref();
        try {
            const body = JSON.stringify(payload);
            if (Buffer.byteLength(body, 'utf8') > this.config.maxRequestBodyBytes) {
                throw new OtlpExportError(
                    'OtlpRequestTooLarge',
                    'OTLP request body exceeds the configured limit',
                    false,
                );
            }
            const request: OtlpRequestInit = {
                method: 'POST',
                headers: {
                    ...this.config.headers,
                    [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
                },
                body,
                signal: controller.signal,
                ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
            };
            const response = await fetch(`${this.config.endpoint}${signalPath}`, request);
            if (!response.ok) {
                const retryAfterMs = parseRetryAfter(
                    response.headers.get('retry-after'),
                    Date.now(),
                );
                await response.body?.cancel();
                throw new OtlpHttpError(response.status, retryAfterMs);
            }
            await this.inspectPartialSuccess(response, signal);
        } finally {
            clearTimeout(timeout);
        }
    }

    private async inspectPartialSuccess(
        response: Response,
        signal: TelemetrySignal,
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

    private canAttemptExport(signal: TelemetrySignal): boolean {
        return Date.now() >= this.retryStates[signal].nextAttemptAt;
    }

    private isRetryable(error: unknown): boolean {
        return !(error instanceof OtlpExportError) || error.retryable;
    }

    private handleExportFailure(signal: TelemetrySignal, error: unknown): void {
        if (this.isRetryable(error)) {
            this.scheduleRetry(signal, error);
        } else {
            this.resetRetryState(signal);
        }
        this.reportFailure(signal, error);
    }

    private scheduleRetry(signal: TelemetrySignal, error: unknown): void {
        const state = this.retryStates[signal];
        state.failures += 1;
        const exponentialDelay = Math.min(
            OTLP_TELEMETRY.INITIAL_RETRY_DELAY_MS * 2 ** (state.failures - 1),
            OTLP_TELEMETRY.MAX_RETRY_DELAY_MS,
        );
        const jitterRange = exponentialDelay * OTLP_TELEMETRY.RETRY_JITTER_RATIO;
        const jitteredDelay = Math.round(
            exponentialDelay - jitterRange + Math.random() * jitterRange * 2,
        );
        const retryAfterMs = error instanceof OtlpExportError
            ? error.retryAfterMs
            : undefined;
        state.nextAttemptAt = Date.now() + (retryAfterMs ?? jitteredDelay);
    }

    private resetRetryState(signal: TelemetrySignal): void {
        this.retryStates[signal] = { failures: 0, nextAttemptAt: 0 };
    }

    private reportFailure(signal: TelemetrySignal, error: unknown): void {
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
