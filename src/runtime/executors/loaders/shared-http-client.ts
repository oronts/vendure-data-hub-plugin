/**
 * Shared HTTP client for loader handlers (REST POST, GraphQL Mutation).
 *
 * Encapsulates the duplicated fetch + retry + circuit-breaker logic that was
 * previously copy-pasted across RestPostHandler and GraphqlMutationHandler.
 */
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { sleep } from '../../../utils/retry.utils';
import { HTTP_STATUS, HTTP } from '../../../constants/defaults/http-defaults';
import { HttpMethod } from '../../../constants/enums';
import { DataHubLogger } from '../../../services/logger/datahub-logger';
import { secureFetch } from '../../../utils/secure-fetch.utils';
import { PIPELINE_RETRY } from '../../../../shared/constants';
import { FIELD_LIMITS } from '../../../constants/validation';
import { resolveBoundedInteger, resolveBoundedNumber } from '../../execution-config';

/** Result of a single HTTP fetch attempt */
export type HttpFetchResult = { ok: true } | { ok: false; error: string; isCircuitOpen?: boolean };

/** Options for the shared HTTP fetch function */
export interface HttpFetchOptions {
    /** Full URL to fetch */
    endpoint: string;
    /** HTTP method */
    method: string;
    /** Merged headers (including auth, content-type) */
    headers: Record<string, string>;
    /** Serialised request body */
    body: string;
    /** Request timeout in milliseconds */
    timeoutMs: number;
    /** Circuit breaker key (derived from endpoint host) */
    circuitKey: string;
    /** Optional circuit breaker service */
    circuitBreaker?: CircuitBreakerService;
    /** Logger for warnings on fetch failure */
    logger: DataHubLogger;
    /** Step key for log metadata */
    stepKey: string;
    /**
     * Optional hook called after a successful HTTP response to inspect
     * the body (e.g., GraphQL error checking). Return a FetchResult to
     * override the default "ok" behaviour.
     */
    onResponse?: (res: Response) => Promise<HttpFetchResult | undefined>;
}

/** Retry configuration for execHttpWithRetry */
export interface HttpRetryOptions {
    retries: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
    backoffMultiplier: number;
}

/** Raw step config with optional retry/timeout/batch fields */
interface RetryConfigSource {
    retries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffMultiplier?: number;
    timeoutMs?: number;
    maxBatchSize?: number;
}

/** Resolved retry + request config from step config + pipeline error handling */
export interface ResolvedHttpConfig extends HttpRetryOptions {
    timeoutMs: number;
    maxBatchSize: number;
}

export type RestBatchMode = 'single' | 'array';
export type GraphqlBatchMode = 'single' | 'batch';

export function resolveRestWriteMethod(value: unknown): HttpMethod.POST | HttpMethod.PUT {
    const method = value === undefined ? HttpMethod.POST : value;
    if (typeof method !== 'string') {
        throw new Error('REST loader method must be POST or PUT');
    }
    const normalized = method.toUpperCase();
    if (normalized !== HttpMethod.POST && normalized !== HttpMethod.PUT) {
        throw new Error('REST loader method must be POST or PUT');
    }
    return normalized;
}

export function resolveRestBatchMode(value: unknown): RestBatchMode {
    if (value === undefined) return 'single';
    if (value !== 'single' && value !== 'array') {
        throw new Error('REST loader batchMode must be single or array');
    }
    return value;
}

export function resolveGraphqlBatchMode(value: unknown): GraphqlBatchMode {
    if (value === undefined) return 'single';
    if (value !== 'single' && value !== 'batch') {
        throw new Error('GraphQL loader batchMode must be single or batch');
    }
    return value;
}

/**
 * Resolve retry/timeout/batch config from step config with pipeline error handling fallbacks.
 * Single source of truth for both RestPostHandler and GraphqlMutationHandler.
 */
export function resolveHttpRetryConfig(
    cfg: RetryConfigSource,
    errorHandling?: { maxRetries?: number; retryDelayMs?: number; maxRetryDelayMs?: number; backoffMultiplier?: number },
): ResolvedHttpConfig {
    const retries = resolveBoundedInteger(
        cfg.retries === undefined ? errorHandling?.maxRetries : cfg.retries,
        {
            fieldName: 'HTTP loader retries',
            defaultValue: PIPELINE_RETRY.DEFAULT_MAX_RETRIES,
            minimum: 0,
            maximum: PIPELINE_RETRY.MAX_RETRIES,
        },
    );
    const retryDelayMs = resolveBoundedInteger(
        cfg.retryDelayMs === undefined ? errorHandling?.retryDelayMs : cfg.retryDelayMs,
        {
            fieldName: 'HTTP loader retryDelayMs',
            defaultValue: PIPELINE_RETRY.DEFAULT_DELAY_MS,
            minimum: 0,
            maximum: PIPELINE_RETRY.MAX_DELAY_MS,
        },
    );
    const maxRetryDelayMs = resolveBoundedInteger(
        cfg.maxRetryDelayMs === undefined ? errorHandling?.maxRetryDelayMs : cfg.maxRetryDelayMs,
        {
            fieldName: 'HTTP loader maxRetryDelayMs',
            defaultValue: PIPELINE_RETRY.DEFAULT_MAX_DELAY_MS,
            minimum: 0,
            maximum: PIPELINE_RETRY.MAX_DELAY_MS,
        },
    );
    const backoffMultiplier = resolveBoundedNumber(
        cfg.backoffMultiplier === undefined
            ? errorHandling?.backoffMultiplier
            : cfg.backoffMultiplier,
        {
            fieldName: 'HTTP loader backoffMultiplier',
            defaultValue: PIPELINE_RETRY.DEFAULT_BACKOFF_MULTIPLIER,
            minimum: 1,
            maximum: PIPELINE_RETRY.MAX_BACKOFF_MULTIPLIER,
        },
    );
    if (maxRetryDelayMs < retryDelayMs) {
        throw new Error('HTTP loader maxRetryDelayMs cannot be less than retryDelayMs');
    }
    return {
        retries,
        retryDelayMs,
        maxRetryDelayMs,
        backoffMultiplier,
        timeoutMs: resolveBoundedInteger(cfg.timeoutMs, {
            fieldName: 'HTTP loader timeoutMs',
            defaultValue: HTTP.TIMEOUT_MS,
            minimum: 1,
            maximum: HTTP.MAX_TIMEOUT_MS,
        }),
        maxBatchSize: resolveBoundedInteger(cfg.maxBatchSize, {
            fieldName: 'HTTP loader maxBatchSize',
            defaultValue: 0,
            minimum: 0,
            maximum: FIELD_LIMITS.BATCH_SIZE_MAX,
        }),
    };
}

/**
 * Perform a single HTTP fetch with circuit-breaker awareness, timeout, and
 * error normalisation.
 */
export async function doHttpFetch(opts: HttpFetchOptions): Promise<HttpFetchResult> {
    const { endpoint, method, headers, body, timeoutMs, circuitKey, circuitBreaker, logger, stepKey, onResponse } = opts;

    // Circuit breaker guard
    if (circuitBreaker && !circuitBreaker.canExecute(circuitKey)) {
        return { ok: false, error: 'Circuit breaker is open - endpoint temporarily unavailable', isCircuitOpen: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await secureFetch(endpoint, {
            method,
            headers,
            body,
            signal: controller.signal,
        });

        if (res?.ok) {
            // Let caller inspect body (e.g., GraphQL error check)
            if (onResponse) {
                const override = await onResponse(res);
                if (override) {
                    if (!override.ok) {
                        circuitBreaker?.recordFailure(circuitKey);
                    }
                    return override;
                }
            }
            circuitBreaker?.recordSuccess(circuitKey);
            return { ok: true };
        }

        // Server errors feed the circuit breaker
        if (res?.status && res.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
            circuitBreaker?.recordFailure(circuitKey);
        }
        return { ok: false, error: `HTTP ${res?.status ?? 'unknown'}: ${res?.statusText ?? 'Request failed'}` };
    } catch (err: unknown) {
        const error = err as Error & { name?: string };
        const errorMsg = error?.name === 'AbortError'
            ? `Request timeout after ${timeoutMs}ms`
            : (error?.message ?? 'Unknown fetch error');
        logger.warn(`HTTP fetch failed`, {
            stepKey,
            endpoint,
            error: errorMsg,
        });
        circuitBreaker?.recordFailure(circuitKey);
        return { ok: false, error: errorMsg };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Execute an HTTP fetch with configurable retry + exponential backoff.
 * Stops retrying when the circuit breaker is open.
 */
export async function execHttpWithRetry(
    fetchFn: () => Promise<HttpFetchResult>,
    retry: HttpRetryOptions,
): Promise<HttpFetchResult> {
    let attempt = 0;
    let lastResult: HttpFetchResult = { ok: false, error: 'No attempts made' };

    while (attempt <= retry.retries) {
        lastResult = await fetchFn();
        if (lastResult.ok) return lastResult;

        // Don't retry if circuit is open
        if ('isCircuitOpen' in lastResult && lastResult.isCircuitOpen) {
            return lastResult;
        }

        attempt++;
        if (attempt <= retry.retries && retry.retryDelayMs > 0) {
            const expDelay = Math.min(
                retry.retryDelayMs * Math.pow(retry.backoffMultiplier, attempt - 1),
                retry.maxRetryDelayMs,
            );
            await sleep(expDelay);
        }
    }

    return lastResult;
}

/**
 * Derive a circuit-breaker key from an endpoint URL.
 * Falls back to the raw endpoint string if URL parsing fails.
 */
export function deriveCircuitKey(prefix: string, endpoint: string): string {
    try {
        const url = new URL(endpoint);
        return `${prefix}:${url.host}`;
    } catch {
        return `${prefix}:${endpoint}`;
    }
}
