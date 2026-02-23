/**
 * GraphQL Mutation loader handler
 *
 * Sends records as GraphQL mutations to external APIs.
 * Follows the RestPostHandler pattern for auth, retry, circuit-breaking.
 */
import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, JsonValue, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { SecretService } from '../../../services/config/secret.service';
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { sleep, chunk } from '../../utils';
import { LoaderHandler } from './types';
import { LOGGER_CONTEXTS, HTTP_HEADERS, CONTENT_TYPES } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { assertUrlSafe } from '../../../utils/url-security.utils';
import { setNestedValue } from '../../../utils/object-path.utils';
import { resolveAuthHeaders } from './shared-http-auth';
import { doHttpFetch, execHttpWithRetry, deriveCircuitKey, resolveHttpRetryConfig, HttpFetchResult } from './shared-http-client';

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
     * Map record fields to GraphQL variables using the variableMapping config.
     * Each key in variableMapping is a GraphQL variable name, and each value is the
     * dot-notation path in the record to read from.
     */
    private mapVariables(record: RecordObject, variableMapping: Record<string, string>): Record<string, unknown> {
        const variables: JsonObject = {};
        for (const [variableName, recordPath] of Object.entries(variableMapping)) {
            // Support nested variable paths by splitting on '.' for the target
            const value = this.getRecordValue(record, recordPath);
            setNestedValue(variables, variableName, value as JsonValue);
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
        // Resolve retry/timeout/batch config from step config with pipeline error handling fallbacks
        const { retries, retryDelayMs, maxRetryDelayMs, backoffMultiplier, timeoutMs, maxBatchSize } = resolveHttpRetryConfig(cfg, errorHandling);

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

        const circuitKey = deriveCircuitKey('graphql-loader', endpoint);
        const reqHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };

        /** GraphQL-specific response checker: inspect body for GraphQL-level errors */
        const onGraphqlResponse = async (res: Response): Promise<HttpFetchResult | undefined> => {
            try {
                const responseBody = await res.json() as { errors?: Array<{ message: string }> };
                if (responseBody.errors && responseBody.errors.length > 0) {
                    const errorMessages = responseBody.errors.map(e => e.message).join('; ');
                    return { ok: false, error: `GraphQL errors: ${errorMessages}` };
                }
            } catch {
                // If we can't parse the response, treat HTTP 2xx as success
            }
            return undefined;
        };

        const fetchWithRetry = async (body: { query: string; variables: Record<string, unknown> }): Promise<HttpFetchResult> => {
            return execHttpWithRetry(
                () => doHttpFetch({
                    endpoint,
                    method: 'POST',
                    headers: reqHeaders,
                    body: JSON.stringify(body),
                    timeoutMs,
                    circuitKey,
                    circuitBreaker: this.circuitBreaker,
                    logger: this.logger,
                    stepKey: step.key,
                    onResponse: onGraphqlResponse,
                }),
                { retries, retryDelayMs, maxRetryDelayMs, backoffMultiplier },
            );
        };

        const batchMode = String(cfg.batchMode ?? 'single');
        try {
            if (batchMode === 'batch') {
                // In batch mode, send multiple records as a single variables array
                const chunks = maxBatchSize > 0 ? chunk(input, maxBatchSize) : [input];
                for (const arr of chunks) {
                    const batchVariables = arr.map(rec => this.mapVariables(rec, variableMapping));
                    const body = { query: mutation, variables: { input: batchVariables } };
                    const result = await fetchWithRetry(body);
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
                    const result = await fetchWithRetry(body);
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
            const processedCount = ok + fail;
            const unprocessed = input.slice(processedCount);
            fail += unprocessed.length;
            for (const rec of unprocessed) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'graphqlMutation failed', rec as JsonObject);
            }
        }
        return { ok, fail };
    }
}
