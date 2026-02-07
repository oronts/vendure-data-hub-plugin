import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, hasNestedValue, deepClone } from '../helpers';
import { HttpLookupOperatorConfig } from './types';
// Import directly from individual modules to avoid circular dependency with constants/index.ts
// which imports ../operators (this module's parent)
import { INTERNAL_TIMINGS, SAFE_EVALUATOR, CIRCUIT_BREAKER, SINK, HTTP_LOOKUP, HTTP_STATUS } from '../../constants/defaults';
import { TIME_UNITS } from '../../../shared/constants';
import { HTTP_HEADERS, AUTH_SCHEMES, CONTENT_TYPES } from '../../constants/services';
import { CircuitState, HttpMethod } from '../../constants/enums';
import { validateUrlSafety } from '../../utils/url-security.utils';

/**
 * In-memory cache for HTTP lookup responses
 * Key: cache key (URL or keyField value)
 * Value: { data, expiresAt }
 */
interface CacheEntry {
    data: JsonValue;
    expiresAt: number;
}

const httpLookupCache = new Map<string, CacheEntry>();

/**
 * Circuit breaker state for each endpoint
 */
interface CircuitBreakerState {
    failures: number;
    lastFailure: number;
    state: CircuitState;
    openedAt?: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Rate limiter state per endpoint domain
 */
interface RateLimitState {
    tokens: number;
    lastRefill: number;
    requestsInWindow: number;
    windowStart: number;
}

const rateLimiters = new Map<string, RateLimitState>();

/**
 * Circuit breaker configuration (using constants from defaults)
 */
const CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: CIRCUIT_BREAKER.FAILURE_THRESHOLD,  // Open circuit after this many failures
    resetTimeoutMs: CIRCUIT_BREAKER.RESET_TIMEOUT_MS,     // Try half-open after this time
    halfOpenMaxAttempts: CIRCUIT_BREAKER.SUCCESS_THRESHOLD, // Close circuit after this many successes in half-open
};

/**
 * Rate limiter configuration (using constants from defaults)
 */
const RATE_LIMIT_CONFIG = {
    defaultRequestsPerSecond: INTERNAL_TIMINGS.DEFAULT_WEBHOOK_RATE_LIMIT,  // Default rate limit
    windowMs: TIME_UNITS.SECOND,  // 1 second sliding window
};

/**
 * Get circuit breaker state for an endpoint
 */
function getCircuitBreaker(endpoint: string): CircuitBreakerState {
    const existing = circuitBreakers.get(endpoint);
    if (existing) {
        return existing;
    }
    const state: CircuitBreakerState = {
        failures: 0,
        lastFailure: 0,
        state: CircuitState.CLOSED,
    };
    circuitBreakers.set(endpoint, state);
    return state;
}

/**
 * Check if circuit breaker allows request
 */
function isCircuitOpen(endpoint: string): boolean {
    const breaker = getCircuitBreaker(endpoint);
    const now = Date.now();

    if (breaker.state === CircuitState.CLOSED) {
        return false;
    }

    if (breaker.state === CircuitState.OPEN) {
        // Check if we should try half-open
        if (breaker.openedAt && now - breaker.openedAt >= CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
            breaker.state = CircuitState.HALF_OPEN;
            breaker.failures = 0;
            return false;
        }
        return true;
    }

    // half-open: allow request
    return false;
}

/**
 * Record circuit breaker success
 */
function recordCircuitSuccess(endpoint: string): void {
    const breaker = getCircuitBreaker(endpoint);
    if (breaker.state === CircuitState.HALF_OPEN) {
        breaker.failures = 0;
        breaker.state = CircuitState.CLOSED;
        breaker.openedAt = undefined;
    } else if (breaker.state === CircuitState.CLOSED) {
        // Gradually reduce failure count on success
        breaker.failures = Math.max(0, breaker.failures - 1);
    }
}

/**
 * Record circuit breaker failure
 */
function recordCircuitFailure(endpoint: string): void {
    const breaker = getCircuitBreaker(endpoint);
    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.state === CircuitState.HALF_OPEN) {
        // Any failure in half-open immediately re-opens
        breaker.state = CircuitState.OPEN;
        breaker.openedAt = Date.now();
    } else if (breaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
        breaker.state = CircuitState.OPEN;
        breaker.openedAt = Date.now();
    }
}

/**
 * Check rate limit and wait if necessary
 */
async function checkRateLimit(endpoint: string, requestsPerSecond?: number): Promise<void> {
    const domain = new URL(endpoint).hostname;
    const limit = requestsPerSecond ?? RATE_LIMIT_CONFIG.defaultRequestsPerSecond;
    const now = Date.now();

    let state = rateLimiters.get(domain);
    if (!state) {
        state = {
            tokens: limit,
            lastRefill: now,
            requestsInWindow: 0,
            windowStart: now,
        };
        rateLimiters.set(domain, state);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - state.lastRefill;
    const tokensToAdd = (elapsed / 1000) * limit;
    state.tokens = Math.min(limit, state.tokens + tokensToAdd);
    state.lastRefill = now;

    // Reset window if needed
    if (now - state.windowStart >= RATE_LIMIT_CONFIG.windowMs) {
        state.requestsInWindow = 0;
        state.windowStart = now;
    }

    // Wait if no tokens available
    if (state.tokens < 1) {
        const waitTime = Math.ceil((1 - state.tokens) * (TIME_UNITS.SECOND / limit));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        state.tokens = 1;
    }

    // Consume a token
    state.tokens--;
    state.requestsInWindow++;
}

/**
 * Get circuit breaker statistics (for monitoring)
 */
export function getCircuitBreakerStats(): Map<string, CircuitBreakerState> {
    return new Map(circuitBreakers);
}

/**
 * Reset circuit breaker for an endpoint (for testing/admin)
 */
export function resetCircuitBreaker(endpoint: string): void {
    circuitBreakers.delete(endpoint);
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
    circuitBreakers.clear();
}

/**
 * Get rate limiter statistics (for monitoring)
 */
export function getRateLimiterStats(): Map<string, RateLimitState> {
    return new Map(rateLimiters);
}

/**
 * Clean expired cache entries periodically
 */
function cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of httpLookupCache.entries()) {
        if (entry.expiresAt < now) {
            httpLookupCache.delete(key);
        }
    }
}

// Clean cache periodically
// Use unref() to allow the process to exit even with this timer running
const cleanupInterval = setInterval(cleanExpiredCache, INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

/**
 * Build the request URL with placeholder substitution
 */
function buildUrl(urlTemplate: string, record: JsonObject): string {
    return urlTemplate.replace(/\{\{([^}]+)\}\}/g, (_match, fieldPath) => {
        const value = getNestedValue(record, fieldPath.trim());
        if (value === null || value === undefined) {
            return '';
        }
        return encodeURIComponent(String(value));
    });
}

/**
 * HTTP Lookup with caching, retries, circuit breaker, and rate limiting
 *
 * Production features:
 * - Response caching with configurable TTL
 * - Circuit breaker pattern for failing endpoints
 * - Rate limiting per domain
 * - Multiple authentication methods (Bearer, API Key, Basic)
 * - URL templates with field placeholders
 * - Automatic retries with exponential backoff
 * - Configurable 404 handling
 */
export async function applyHttpLookup(
    record: JsonObject,
    config: HttpLookupOperatorConfig,
    secretResolver?: {
        get: (code: string) => Promise<string | undefined>;
    },
): Promise<{ record: JsonObject; error?: string; skipped?: boolean }> {
    const {
        url: urlTemplate,
        method = 'GET',
        keyField,
        target,
        responsePath,
        default: defaultValue,
        timeoutMs = SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS,
        cacheTtlSec = HTTP_LOOKUP.DEFAULT_CACHE_TTL_SEC,
        headers: staticHeaders = {},
        bearerTokenSecretCode,
        apiKeySecretCode,
        apiKeyHeader = HTTP_LOOKUP.DEFAULT_API_KEY_HEADER,
        basicAuthSecretCode,
        bodyField,
        body: staticBody,
        skipOn404 = false,
        failOnError = false,
        maxRetries = HTTP_LOOKUP.DEFAULT_MAX_RETRIES,
        rateLimitPerSecond,
    } = config;

    const result = deepClone(record);

    // Build URL with placeholders
    const url = buildUrl(urlTemplate, record);
    if (!url) {
        if (failOnError) {
            return { record: result, error: 'Failed to build URL from template' };
        }
        setNestedValue(result, target, defaultValue ?? null);
        return { record: result };
    }

    // SSRF protection: validate URL before making request
    const urlSafetyResult = await validateUrlSafety(url);
    if (!urlSafetyResult.safe) {
        if (failOnError) {
            return { record: result, error: `SSRF protection: ${urlSafetyResult.reason}` };
        }
        setNestedValue(result, target, defaultValue ?? null);
        return { record: result };
    }

    // Extract endpoint base for circuit breaker (use origin)
    let endpointBase: string;
    try {
        const parsedUrl = new URL(url);
        endpointBase = parsedUrl.origin;
    } catch {
        // URL parsing failed - use raw URL as endpoint base
        endpointBase = url;
    }

    // Check circuit breaker
    if (isCircuitOpen(endpointBase)) {
        if (failOnError) {
            return { record: result, error: `Circuit breaker open for ${endpointBase}` };
        }
        setNestedValue(result, target, defaultValue ?? null);
        return { record: result };
    }

    // Generate cache key
    const cacheKey = keyField
        ? `${urlTemplate}:${String(getNestedValue(record, keyField) ?? '')}`
        : url;

    // Check cache
    if (cacheTtlSec > 0) {
        const cached = httpLookupCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            setNestedValue(result, target, cached.data);
            return { record: result };
        }
    }

    // Apply rate limiting
    try {
        await checkRateLimit(url, rateLimitPerSecond);
    } catch {
        // If rate limit check fails (e.g., invalid URL), continue without rate limiting
    }

    // Build headers
    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...staticHeaders,
    };

    // Add authentication
    if (bearerTokenSecretCode && secretResolver) {
        const token = await secretResolver.get(bearerTokenSecretCode);
        if (token) {
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
        }
    } else if (apiKeySecretCode && secretResolver) {
        const apiKey = await secretResolver.get(apiKeySecretCode);
        if (apiKey) {
            headers[apiKeyHeader] = apiKey;
        }
    } else if (basicAuthSecretCode && secretResolver) {
        const credentials = await secretResolver.get(basicAuthSecretCode);
        if (credentials) {
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(credentials).toString('base64')}`;
        }
    }

    // Build request body for POST
    let requestBody: string | undefined;
    if (method === HttpMethod.POST) {
        if (bodyField) {
            const bodyValue = getNestedValue(record, bodyField);
            requestBody = JSON.stringify(bodyValue);
        } else if (staticBody !== undefined) {
            requestBody = JSON.stringify(staticBody);
        }
    }

    // Execute request with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(url, {
                method,
                headers,
                body: requestBody,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Handle 404 (not a failure for circuit breaker)
            if (response.status === HTTP_STATUS.NOT_FOUND) {
                recordCircuitSuccess(endpointBase); // 404 is a valid response
                if (skipOn404) {
                    return { record: result, skipped: true };
                }
                setNestedValue(result, target, defaultValue ?? null);
                return { record: result };
            }

            // Handle other errors
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Parse response
            let responseData: JsonValue;
            const contentType = response.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
                responseData = await response.json() as JsonValue;
            } else {
                responseData = await response.text();
            }

            // Extract from response path if specified
            let extractedData = responseData;
            if (responsePath && typeof responseData === 'object' && responseData !== null) {
                extractedData = getNestedValue(responseData as JsonObject, responsePath) ?? responseData;
            }

            // Cache the result
            if (cacheTtlSec > 0) {
                httpLookupCache.set(cacheKey, {
                    data: extractedData,
                    expiresAt: Date.now() + cacheTtlSec * 1000,
                });
            }

            // Record success for circuit breaker
            recordCircuitSuccess(endpointBase);

            setNestedValue(result, target, extractedData);
            return { record: result };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry on abort (timeout) or non-retryable errors
            if (error instanceof Error && error.name === 'AbortError') {
                lastError = new Error(`Request timeout after ${timeoutMs}ms`);
                recordCircuitFailure(endpointBase);
                break;
            }

            // Record failure for circuit breaker (only on last attempt)
            if (attempt === maxRetries) {
                recordCircuitFailure(endpointBase);
            }

            // Exponential backoff for retries
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * SINK.BACKOFF_BASE_DELAY_MS));
            }
        }
    }

    // All retries failed
    if (failOnError) {
        return { record: result, error: lastError?.message ?? 'HTTP lookup failed' };
    }

    setNestedValue(result, target, defaultValue ?? null);
    return { record: result };
}

/**
 * Batch HTTP lookup for multiple records (when endpoint supports batch)
 */
export async function applyHttpLookupBatch(
    records: readonly JsonObject[],
    config: HttpLookupOperatorConfig,
    secretResolver?: {
        get: (code: string) => Promise<string | undefined>;
    },
): Promise<{ records: JsonObject[]; errors: Array<{ record: JsonObject; message: string }> }> {
    const results: JsonObject[] = [];
    const errors: Array<{ record: JsonObject; message: string }> = [];

    // Process records in parallel with concurrency limit
    const batchSize = config.batchSize ?? HTTP_LOOKUP.DEFAULT_BATCH_SIZE;
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const promises = batch.map(record => applyHttpLookup(record, config, secretResolver));
        const batchResults = await Promise.all(promises);

        for (const { record, error, skipped } of batchResults) {
            if (error) {
                errors.push({ record, message: error });
            }
            if (!skipped) {
                results.push(record);
            }
        }
    }

    return { records: results, errors };
}

/**
 * Clear the HTTP lookup cache (useful for testing)
 */
export function clearHttpLookupCache(): void {
    httpLookupCache.clear();
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getHttpLookupCacheStats(): { size: number; keys: string[] } {
    return {
        size: httpLookupCache.size,
        keys: Array.from(httpLookupCache.keys()),
    };
}

export function applyLookup(
    record: JsonObject,
    source: string,
    map: Record<string, JsonValue>,
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);

    let lookupResult: JsonValue;
    if (sourceValue !== undefined && sourceValue !== null) {
        const key = String(sourceValue);
        lookupResult = map[key] ?? defaultValue ?? null;
    } else {
        lookupResult = defaultValue ?? null;
    }

    setNestedValue(result, target, lookupResult);
    return result;
}

export function applyEnrich(
    record: JsonObject,
    setFields?: Record<string, JsonValue>,
    defaultFields?: Record<string, JsonValue>,
): JsonObject {
    const result = deepClone(record);

    // Apply defaults first (only if field doesn't exist or is null)
    if (defaultFields) {
        for (const [path, value] of Object.entries(defaultFields)) {
            if (!hasNestedValue(result, path)) {
                setNestedValue(result, path, value);
            } else {
                const current = getNestedValue(result, path);
                if (current === null || current === undefined) {
                    setNestedValue(result, path, value);
                }
            }
        }
    }

    // Apply set fields (always overwrite)
    if (setFields) {
        for (const [path, value] of Object.entries(setFields)) {
            setNestedValue(result, path, value);
        }
    }

    return result;
}

export function applyCoalesce(
    record: JsonObject,
    paths: string[],
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);

    let foundValue: JsonValue = null;
    for (const path of paths) {
        const value = getNestedValue(record, path);
        if (value !== null && value !== undefined && value !== '') {
            foundValue = value;
            break;
        }
    }

    if (foundValue === null && defaultValue !== undefined) {
        foundValue = defaultValue;
    }

    setNestedValue(result, target, foundValue);
    return result;
}

export function applyDefault(
    record: JsonObject,
    path: string,
    defaultValue: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const currentValue = getNestedValue(record, path);

    if (currentValue === null || currentValue === undefined) {
        setNestedValue(result, path, defaultValue);
    }

    return result;
}
