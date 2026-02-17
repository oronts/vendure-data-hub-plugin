/**
 * GraphQL Mutation loader handler
 *
 * Sends records as GraphQL mutations to external APIs.
 * Follows the RestPostHandler pattern for auth, retry, circuit-breaking.
 */
import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { SecretService } from '../../../services/config/secret.service';
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { sleep, chunk } from '../../utils';
import { LoaderHandler } from './types';
import { LOGGER_CONTEXTS, HTTP, HTTP_STATUS, HTTP_HEADERS, CONTENT_TYPES } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { assertUrlSafe } from '../../../utils/url-security.utils';
import { resolveAuthHeaders } from './shared-http-auth';

/** Delay in ms when circuit breaker is open, to give the downstream service time to recover */
const CIRCUIT_OPEN_BACKOFF_MS = 1_000;

/**
 * Configuration for GraphQL Mutation loader step
 */
interface GraphqlMutationConfig {
    endpoint?: string;
    mutation?: string;
    variableMapping?: Record<string, string>;
    headers?: Record<string, string>;
    auth?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    retries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffMultiplier?: number;
    timeoutMs?: number;
    maxBatchSize?: number;
    batchMode?: string;
}

@Injectable()
export class GraphqlMutationHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private circuitBreaker?: CircuitBreakerService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOAD_EXECUTOR ?? 'GraphqlMutationHandler');
    }

    /**
     * Get circuit breaker key for an endpoint
     */
    private getCircuitKey(endpoint: string): string {
        try {
            const url = new URL(endpoint);
            return `graphql-loader:${url.host}`;
        } catch {
            return `graphql-loader:${endpoint}`;
        }
    }

    /**
     * Map record fields to GraphQL variables using the variableMapping config.
     * Each key in variableMapping is a GraphQL variable name, and each value is the
     * dot-notation path in the record to read from.
     */
    private mapVariables(record: RecordObject, variableMapping: Record<string, string>): Record<string, unknown> {
        const variables: Record<string, unknown> = {};
        for (const [variableName, recordPath] of Object.entries(variableMapping)) {
            // Support nested variable paths by splitting on '.' for the target
            const value = this.getRecordValue(record, recordPath);
            this.setNestedVariable(variables, variableName, value);
        }
        return variables;
    }

    /**
     * Get a value from a record using dot-notation path
     */
    private getRecordValue(record: RecordObject, path: string): unknown {
        const parts = path.split('.');
        let current: unknown = record;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }

    /**
     * Set a value at a dot-notation path in the variables object
     */
    private setNestedVariable(obj: Record<string, unknown>, path: string, value: unknown): void {
        const parts = path.split('.');
        let current: Record<string, unknown> = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current[part] == null || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as GraphqlMutationConfig;
        const endpoint = String(cfg.endpoint ?? '');
        const mutation = String(cfg.mutation ?? '');
        const variableMapping = cfg.variableMapping ?? {};
        let headers: Record<string, string> = cfg.headers ?? {};
        // Use step config first, fall back to pipeline context errorHandling
        const retries = Math.max(0, Number(cfg.retries ?? errorHandling?.maxRetries ?? 0) || 0);
        const retryDelayMs = Math.max(0, Number(cfg.retryDelayMs ?? errorHandling?.retryDelayMs ?? 0) || 0);
        const maxRetryDelayMs = Math.max(0, Number(cfg.maxRetryDelayMs ?? errorHandling?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS);
        const backoffMultiplier = Number(cfg.backoffMultiplier ?? errorHandling?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER;
        const timeoutMs = Math.max(0, Number(cfg.timeoutMs ?? 0) || 0);
        const maxBatchSize = Math.max(0, Number(cfg.maxBatchSize ?? 0) || 0);

        try {
            headers = await resolveAuthHeaders(ctx, this.secretService, cfg, headers);
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for GraphQL mutation loader', {
                stepKey: step.key,
                endpoint,
                error: getErrorMessage(error),
            });
        }

        const fetchImpl = globalThis.fetch;
        if (!fetchImpl) return { ok, fail: input.length };

        await assertUrlSafe(endpoint);

        // Circuit breaker key based on endpoint host
        const circuitKey = this.getCircuitKey(endpoint);

        type FetchResult = { ok: true } | { ok: false; error: string; isCircuitOpen?: boolean };

        const doFetch = async (body: { query: string; variables: Record<string, unknown> }): Promise<FetchResult> => {
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
                const reqHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };

                const res = await fetchImpl(endpoint, {
                    method: 'POST',
                    headers: reqHeaders,
                    body: JSON.stringify(body),
                    signal: controller?.signal,
                });
                if (res?.ok) {
                    // Check for GraphQL-level errors in the response body
                    try {
                        const responseBody = await res.json() as { errors?: Array<{ message: string }> };
                        if (responseBody.errors && responseBody.errors.length > 0) {
                            const errorMessages = responseBody.errors.map(e => e.message).join('; ');
                            this.circuitBreaker?.recordFailure(circuitKey);
                            return { ok: false, error: `GraphQL errors: ${errorMessages}` };
                        }
                    } catch {
                        // If we can't parse the response, treat HTTP 2xx as success
                    }
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
                this.logger.warn('GraphQL mutation fetch failed', {
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

        const execWithRetry = async (body: { query: string; variables: Record<string, unknown> }): Promise<FetchResult> => {
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
            if (batchMode === 'batch') {
                // In batch mode, send multiple records as a single variables array
                const chunks = maxBatchSize > 0 ? chunk(input, maxBatchSize) : [input];
                for (const arr of chunks) {
                    const batchVariables = arr.map(rec => this.mapVariables(rec, variableMapping));
                    const body = { query: mutation, variables: { input: batchVariables } };
                    const result = await execWithRetry(body);
                    if (result.ok) {
                        ok += arr.length;
                    } else {
                        fail += arr.length;
                        const errorMsg = `GraphQL mutation ${endpoint} failed: ${result.error}`;
                        for (const rec of arr) {
                            if (onRecordError) {
                                try {
                                    await onRecordError(step.key, errorMsg, rec as JsonObject);
                                } catch {
                                    // Ensure all records get error reporting even if callback fails
                                }
                            }
                        }
                    }
                }
            } else {
                for (const rec of input) {
                    // When circuit breaker is open, wait before trying the next record
                    // to give the downstream service time to recover
                    if (this.circuitBreaker && !this.circuitBreaker.canExecute(circuitKey)) {
                        await sleep(CIRCUIT_OPEN_BACKOFF_MS);
                    }
                    const variables = this.mapVariables(rec, variableMapping);
                    const body = { query: mutation, variables };
                    const result = await execWithRetry(body);
                    if (result.ok) {
                        ok++;
                    } else {
                        fail++;
                        const errorMsg = `GraphQL mutation ${endpoint} failed: ${result.error}`;
                        if (onRecordError) {
                            try {
                                await onRecordError(step.key, errorMsg, rec as JsonObject);
                            } catch {
                                // Ensure error reporting doesn't break the processing loop
                            }
                        }
                    }
                }
            }
        } catch (e: unknown) {
            fail += input.length;
            for (const rec of input) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'graphqlMutation failed', rec as JsonObject);
            }
        }
        return { ok, fail };
    }
}
