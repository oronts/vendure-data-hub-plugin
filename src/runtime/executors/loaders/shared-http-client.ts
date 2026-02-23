/**
 * Shared HTTP client for loader handlers (REST POST, GraphQL Mutation).
 *
 * Encapsulates the duplicated fetch + retry + circuit-breaker logic that was
 * previously copy-pasted across RestPostHandler and GraphqlMutationHandler.
 */
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { sleep } from '../../utils';
import { HTTP_STATUS, HTTP } from '../../../constants/index';
import { DataHubLogger } from '../../../services/logger';

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
    /** Request timeout in ms (0 = no timeout) */
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

/**
 * Resolve retry/timeout/batch config from step config with pipeline error handling fallbacks.
 * Single source of truth for both RestPostHandler and GraphqlMutationHandler.
 */
export function resolveHttpRetryConfig(
    cfg: RetryConfigSource,
    errorHandling?: { maxRetries?: number; retryDelayMs?: number; maxRetryDelayMs?: number; backoffMultiplier?: number },
): ResolvedHttpConfig {
    return {
        retries: Math.max(0, Number(cfg.retries ?? errorHandling?.maxRetries ?? 0) || 0),
        retryDelayMs: Math.max(0, Number(cfg.retryDelayMs ?? errorHandling?.retryDelayMs ?? 0) || 0),
        maxRetryDelayMs: Math.max(0, Number(cfg.maxRetryDelayMs ?? errorHandling?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS),
        backoffMultiplier: Number(cfg.backoffMultiplier ?? errorHandling?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER,
        timeoutMs: Math.max(0, Number(cfg.timeoutMs ?? 0) || 0),
        maxBatchSize: Math.max(0, Number(cfg.maxBatchSize ?? 0) || 0),
    };
}

/**
 * Perform a single HTTP fetch with circuit-breaker awareness, timeout, and
 * error normalisation.
 */
export async function doHttpFetch(opts: HttpFetchOptions): Promise<HttpFetchResult> {
    const { endpoint, method, headers, body, timeoutMs, circuitKey, circuitBreaker, logger, stepKey, onResponse } = opts;
    const fetchImpl = globalThis.fetch;

    // Circuit breaker guard
    if (circuitBreaker && !circuitBreaker.canExecute(circuitKey)) {
        return { ok: false, error: 'Circuit breaker is open - endpoint temporarily unavailable', isCircuitOpen: true };
    }

    const controller = timeoutMs > 0 ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (controller && timeoutMs > 0) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
        const res = await fetchImpl(endpoint, {
            method,
            headers,
            body,
            signal: controller?.signal,
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
        if (timer) clearTimeout(timer);
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
