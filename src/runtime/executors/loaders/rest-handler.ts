/**
 * REST POST loader handler
 */
import * as crypto from 'crypto';
import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { SecretService } from '../../../services/config/secret.service';
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { sleep, chunk } from '../../utils';
import { LoaderHandler } from './types';
import { TIME, LOGGER_CONTEXTS, HTTP, HTTP_STATUS, AuthType, HttpMethod, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { assertUrlSafe } from '../../../utils/url-security.utils';

/**
 * Configuration for REST POST loader step
 */
interface RestPostConfig {
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    auth?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    hmacHeader?: string;
    hmacPayloadTemplate?: string;
    retries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffMultiplier?: number;
    timeoutMs?: number;
    maxBatchSize?: number;
    batchMode?: string;
}

@Injectable()
export class RestPostHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private circuitBreaker?: CircuitBreakerService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOADER_REGISTRY ?? 'RestPostHandler');
    }

    /**
     * Get circuit breaker key for an endpoint
     */
    private getCircuitKey(endpoint: string): string {
        try {
            const url = new URL(endpoint);
            return `rest-loader:${url.host}`;
        } catch {
            return `rest-loader:${endpoint}`;
        }
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as RestPostConfig;
        const endpoint = String(cfg.endpoint ?? '');
        const method = String(cfg.method ?? HttpMethod.POST).toUpperCase();
        let headers: Record<string, string> = cfg.headers ?? {};
        // Use step config first, fall back to pipeline context errorHandling
        const retries = Math.max(0, Number(cfg.retries ?? errorHandling?.maxRetries ?? 0) || 0);
        const retryDelayMs = Math.max(0, Number(cfg.retryDelayMs ?? errorHandling?.retryDelayMs ?? 0) || 0);
        const maxRetryDelayMs = Math.max(0, Number(cfg.maxRetryDelayMs ?? errorHandling?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS);
        const backoffMultiplier = Number(cfg.backoffMultiplier ?? errorHandling?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER;
        const timeoutMs = Math.max(0, Number(cfg.timeoutMs ?? 0) || 0);
        const maxBatchSize = Math.max(0, Number(cfg.maxBatchSize ?? 0) || 0);

        try {
            const auth = String(cfg.auth ?? AuthType.NONE);
            if (auth === AuthType.BEARER && cfg.bearerTokenSecretCode) {
                const token = await this.secretService.resolve(ctx, String(cfg.bearerTokenSecretCode));
                if (token) headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${token}` };
            } else if (auth === AuthType.BASIC && cfg.basicSecretCode) {
                const credentials = await this.secretService.resolve(ctx, String(cfg.basicSecretCode));
                if (credentials && credentials.includes(':')) {
                    const token = Buffer.from(credentials).toString('base64');
                    headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BASIC} ${token}` };
                }
            }
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for REST loader', {
                stepKey: step.key,
                endpoint,
                error: (error as Error)?.message,
            });
        }

        const fetchImpl = globalThis.fetch;
        if (!fetchImpl) return { ok, fail: input.length };

        await assertUrlSafe(endpoint);

        // Circuit breaker key based on endpoint host
        const circuitKey = this.getCircuitKey(endpoint);

        type FetchResult = { ok: true } | { ok: false; error: string; isCircuitOpen?: boolean };

        const doFetch = async (body: RecordObject | RecordObject[]): Promise<FetchResult> => {
            // Check circuit breaker before making request
            if (this.circuitBreaker && !this.circuitBreaker.canExecute(circuitKey)) {
                return { ok: false, error: 'Circuit breaker is open - endpoint temporarily unavailable', isCircuitOpen: true };
            }

            const controller = timeoutMs > 0 ? new AbortController() : undefined;
            let timer: ReturnType<typeof setTimeout> | undefined;
            if (controller && timeoutMs > 0) {
                timer = setTimeout(() => controller.abort(), timeoutMs);
            }
            try {
                let reqHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };
                try {
                    if (String(cfg.auth ?? AuthType.NONE) === AuthType.HMAC && cfg.hmacSecretCode && cfg.hmacHeader) {
                        const secret = await this.secretService.resolve(ctx, String(cfg.hmacSecretCode));
                        const urlObj = new URL(endpoint);
                        const payloadTemplate = String(cfg.hmacPayloadTemplate ?? '${method}:${path}:${timestamp}');
                        const ts = Math.floor(Date.now() / TIME.SECOND);
                        const replMap: Record<string, string> = {
                            '${method}': method,
                            '${path}': urlObj.pathname,
                            '${timestamp}': String(ts),
                            '${body}': JSON.stringify(body),
                        };
                        let payloadToSign = payloadTemplate;
                        for (const [k, v] of Object.entries(replMap)) {
                            payloadToSign = payloadToSign.split(k).join(v);
                        }
                        if (secret) {
                            const signature = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
                            reqHeaders = { ...reqHeaders, [String(cfg.hmacHeader)]: signature, 'x-timestamp': String(ts) };
                        }
                    }
                } catch (error) {
                    this.logger.warn('Failed to generate HMAC signature for REST request', {
                        stepKey: step.key,
                        endpoint,
                        error: (error as Error)?.message,
                    });
                }

                const res = await fetchImpl(endpoint, {
                    method,
                    headers: reqHeaders,
                    body: JSON.stringify(body),
                    signal: controller?.signal,
                });
                if (res?.ok) {
                    // Record success with circuit breaker
                    this.circuitBreaker?.recordSuccess(circuitKey);
                    return { ok: true };
                }
                // Record failure with circuit breaker for server errors
                if (res?.status && res.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
                    this.circuitBreaker?.recordFailure(circuitKey);
                }
                return { ok: false, error: `HTTP ${res?.status ?? 'unknown'}: ${res?.statusText ?? 'Request failed'}` };
            } catch (err: unknown) {
                const error = err as Error & { name?: string };
                const errorMsg = error?.name === 'AbortError'
                    ? `Request timeout after ${timeoutMs}ms`
                    : (error?.message ?? 'Unknown fetch error');
                this.logger.warn('REST fetch failed', {
                    stepKey: step.key,
                    endpoint,
                    error: errorMsg,
                });
                // Record failure with circuit breaker for network errors
                this.circuitBreaker?.recordFailure(circuitKey);
                return { ok: false, error: errorMsg };
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        const execWithRetry = async (body: RecordObject | RecordObject[]): Promise<FetchResult> => {
            let attempt = 0;
            let lastResult: FetchResult = { ok: false, error: 'No attempts made' };
            while (attempt <= retries) {
                lastResult = await doFetch(body);
                if (lastResult.ok) return lastResult;
                // Don't retry if circuit is open
                if ('isCircuitOpen' in lastResult && lastResult.isCircuitOpen) {
                    return lastResult;
                }
                attempt++;
                if (attempt <= retries && retryDelayMs > 0) {
                    // Calculate exponential backoff delay
                    const expDelay = Math.min(retryDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxRetryDelayMs);
                    await sleep(expDelay);
                }
            }
            return lastResult;
        };

        const batchMode = String(cfg.batchMode ?? 'single');
        try {
            if (batchMode === 'array') {
                const chunks = maxBatchSize > 0 ? chunk(input, maxBatchSize) : [input];
                for (const arr of chunks) {
                    const result = await execWithRetry(arr);
                    if (result.ok) {
                        ok += arr.length;
                    } else {
                        fail += arr.length;
                        const errorMsg = `REST ${method} ${endpoint} failed: ${result.error}`;
                        for (const rec of arr) {
                            if (onRecordError) await onRecordError(step.key, errorMsg, rec as JsonObject);
                        }
                    }
                }
            } else {
                for (const rec of input) {
                    const result = await execWithRetry(rec);
                    if (result.ok) {
                        ok++;
                    } else {
                        fail++;
                        const errorMsg = `REST ${method} ${endpoint} failed: ${result.error}`;
                        if (onRecordError) await onRecordError(step.key, errorMsg, rec as JsonObject);
                    }
                }
            }
        } catch (e: unknown) {
            fail += input.length;
            for (const rec of input) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'restPost failed', rec as JsonObject);
            }
        }
        return { ok, fail };
    }
}
