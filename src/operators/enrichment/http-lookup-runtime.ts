import type { JsonObject, JsonValue } from '../types';
import { deepClone, getNestedValue, setNestedValue } from '../helpers';
import type { HttpLookupOperatorConfig } from './types';
import {
    HTTP_LOOKUP,
    HTTP_STATUS,
    OUTBOUND_RESPONSE_LIMITS,
    SAFE_EVALUATOR,
    SINK,
} from '../../constants/defaults';
import { CONTENT_TYPES } from '../../constants/services';
import { HttpMethod } from '../../constants/enums';
import { validateUrlSafety } from '../../utils/url-security.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { readResponseJson, readResponseText } from '../../utils/secure-response-body.utils';
import { calculateSimpleBackoff, sleep } from '../../utils/retry.utils';
import { ensureError } from '../../utils/error.utils';
import {
    createHttpLookupCacheKey,
    createHttpLookupStateKey,
    type HttpLookupRuntimeContext,
    type PreparedHttpLookupSecurity,
    prepareHttpLookupSecurity,
} from './http-lookup-security';
import {
    cacheHttpLookupValue,
    getCachedHttpLookupValue,
} from './http-lookup-cache';
import {
    acquireCircuitPermit,
    type CircuitPermit,
    recordCircuitFailure,
    recordCircuitSuccess,
} from './http-lookup-circuit-breaker';
import { waitForHttpLookupRateLimit } from './http-lookup-rate-limiter';

export interface HttpLookupResult {
    record: JsonObject;
    error?: string;
    skipped?: boolean;
}

interface RequestDetails {
    readonly body?: string;
    readonly url: string;
}

interface ValidatedRequestDetails extends RequestDetails {
    readonly endpoint: string;
}

interface RequestOutcome {
    readonly data?: JsonValue;
    readonly error?: Error;
    readonly notFound?: boolean;
}

function buildUrl(urlTemplate: string, record: JsonObject): string {
    return urlTemplate.replace(/\{\{([^}]+)\}\}/g, (_match, fieldPath: string) => {
        const value = getNestedValue(record, fieldPath.trim());
        return value == null ? '' : encodeURIComponent(String(value));
    });
}

function createRequestDetails(
    record: JsonObject,
    config: HttpLookupOperatorConfig,
    security: PreparedHttpLookupSecurity,
): RequestDetails {
    const url = buildUrl(security.urlTemplate, record);
    const body = config.method === HttpMethod.POST
        ? JSON.stringify(config.bodyField
            ? getNestedValue(record, config.bodyField)
            : config.body)
        : undefined;
    return { body, url };
}

function applyFallback(
    result: JsonObject,
    config: HttpLookupOperatorConfig,
    message?: string,
): HttpLookupResult {
    if (message && config.failOnError) return { record: result, error: message };
    setNestedValue(result, config.target, config.default ?? null);
    return { record: result };
}

function createCacheKey(
    record: JsonObject,
    config: HttpLookupOperatorConfig,
    security: PreparedHttpLookupSecurity,
    request: ValidatedRequestDetails,
): string {
    return createHttpLookupCacheKey({
        body: request.body,
        cacheNamespace: security.cacheNamespace,
        headers: security.headers,
        keyFieldValue: config.keyField
            ? String(getNestedValue(record, config.keyField) ?? '')
            : undefined,
        method: config.method ?? HttpMethod.GET,
        responsePath: config.responsePath,
        url: request.url,
    });
}

async function readLookupResponse(
    response: Response,
    responsePath?: string,
): Promise<JsonValue> {
    const contentType = response.headers.get('content-type') ?? '';
    const responseData = contentType.includes(CONTENT_TYPES.JSON)
        ? await readResponseJson<JsonValue>(response, {
            maxBytes: OUTBOUND_RESPONSE_LIMITS.CONNECTOR_EXTRACT_BYTES,
            context: 'HTTP lookup JSON response',
        })
        : await readResponseText(response, {
            maxBytes: OUTBOUND_RESPONSE_LIMITS.CONNECTOR_EXTRACT_BYTES,
            context: 'HTTP lookup text response',
        });
    if (!responsePath || typeof responseData !== 'object' || responseData === null) {
        return responseData;
    }
    return getNestedValue(responseData as JsonObject, responsePath) ?? responseData;
}

async function executeRequestAttempt(
    request: ValidatedRequestDetails,
    config: HttpLookupOperatorConfig,
    security: PreparedHttpLookupSecurity,
): Promise<RequestOutcome> {
    const response = await secureFetch(request.url, {
        method: config.method ?? HttpMethod.GET,
        headers: security.headers,
        body: request.body,
        signal: AbortSignal.timeout(config.timeoutMs ?? SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS),
    }, undefined, security.fetchPolicy);
    if (response.status === HTTP_STATUS.NOT_FOUND) {
        await response.body?.cancel();
        return { notFound: true };
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return { data: await readLookupResponse(response, config.responsePath) };
}

async function executeRequestWithRetries(
    request: ValidatedRequestDetails,
    config: HttpLookupOperatorConfig,
    security: PreparedHttpLookupSecurity,
): Promise<RequestOutcome> {
    const maxRetries = config.maxRetries ?? HTTP_LOOKUP.DEFAULT_MAX_RETRIES;
    const timeoutMs = config.timeoutMs ?? SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await executeRequestAttempt(request, config, security);
        } catch (error) {
            lastError = ensureError(error);
            if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') {
                return { error: new Error(`Request timeout after ${timeoutMs}ms`) };
            }
            if (attempt < maxRetries) {
                await sleep(calculateSimpleBackoff(attempt, SINK.BACKOFF_BASE_DELAY_MS));
            }
        }
    }
    return { error: lastError ?? new Error('HTTP lookup failed') };
}

async function applyPreparedHttpLookup(
    record: JsonObject,
    config: HttpLookupOperatorConfig,
    security: PreparedHttpLookupSecurity,
): Promise<HttpLookupResult> {
    const result = deepClone(record);
    const unvalidatedRequest = createRequestDetails(record, config, security);
    const safety = await validateUrlSafety(unvalidatedRequest.url);
    if (!safety.safe) {
        return applyFallback(result, config, `SSRF protection: ${safety.reason}`);
    }
    const request: ValidatedRequestDetails = {
        ...unvalidatedRequest,
        endpoint: new URL(unvalidatedRequest.url).origin,
    };

    const cacheTtlSec = config.cacheTtlSec ?? HTTP_LOOKUP.DEFAULT_CACHE_TTL_SEC;
    const cacheKey = createCacheKey(record, config, security, request);
    if (cacheTtlSec > 0) {
        const cached = getCachedHttpLookupValue(cacheKey);
        if (cached !== undefined) {
            setNestedValue(result, config.target, cached);
            return { record: result };
        }
    }

    const stateKey = createHttpLookupStateKey({
        endpoint: request.endpoint,
        headers: security.headers,
        stateNamespace: security.stateNamespace,
    });
    const permit = acquireCircuitPermit(request.endpoint, undefined, stateKey);
    if (!permit) {
        return applyFallback(result, config, `Circuit breaker open for ${request.endpoint}`);
    }
    await waitForHttpLookupRateLimit(
        request.endpoint,
        config.rateLimitPerSecond,
        stateKey,
    );
    return completeHttpLookup(result, config, request, security, permit, cacheKey, cacheTtlSec);
}

async function completeHttpLookup(
    result: JsonObject,
    config: HttpLookupOperatorConfig,
    request: ValidatedRequestDetails,
    security: PreparedHttpLookupSecurity,
    permit: CircuitPermit,
    cacheKey: string,
    cacheTtlSec: number,
): Promise<HttpLookupResult> {
    const outcome = await executeRequestWithRetries(request, config, security);
    if (outcome.error) {
        recordCircuitFailure(permit);
        return applyFallback(result, config, outcome.error.message);
    }
    recordCircuitSuccess(permit);
    if (outcome.notFound) {
        if (config.skipOn404) return { record: result, skipped: true };
        return applyFallback(result, config);
    }

    const data = outcome.data ?? null;
    if (cacheTtlSec > 0) cacheHttpLookupValue(cacheKey, data, cacheTtlSec);
    setNestedValue(result, config.target, deepClone(data));
    return { record: result };
}

export async function applyHttpLookup(
    record: JsonObject,
    config: HttpLookupOperatorConfig,
    runtime: HttpLookupRuntimeContext = {},
): Promise<HttpLookupResult> {
    const security = await prepareHttpLookupSecurity(config, runtime);
    return applyPreparedHttpLookup(record, config, security);
}

export async function applyHttpLookupBatch(
    records: readonly JsonObject[],
    config: HttpLookupOperatorConfig,
    runtime: HttpLookupRuntimeContext = {},
): Promise<{ records: JsonObject[]; errors: Array<{ record: JsonObject; message: string }> }> {
    const security = await prepareHttpLookupSecurity(config, runtime);
    const outcomes = new Array<HttpLookupResult>(records.length);
    let nextIndex = 0;
    const workerCount = Math.min(
        records.length,
        config.batchSize ?? HTTP_LOOKUP.DEFAULT_BATCH_SIZE,
    );
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < records.length) {
            const index = nextIndex;
            nextIndex += 1;
            outcomes[index] = await applyPreparedHttpLookup(records[index], config, security);
        }
    });
    await Promise.all(workers);

    const resultRecords: JsonObject[] = [];
    const errors: Array<{ record: JsonObject; message: string }> = [];
    for (const outcome of outcomes) {
        if (outcome.error) errors.push({ record: outcome.record, message: outcome.error });
        if (!outcome.skipped) resultRecords.push(outcome.record);
    }
    return { records: resultRecords, errors };
}
