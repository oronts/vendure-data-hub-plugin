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
import { chunk } from '../../utils';
import { LoaderHandler } from './types';
import { TIME, LOGGER_CONTEXTS, ConnectionAuthType, HttpMethod, HTTP_HEADERS, CONTENT_TYPES } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { assertUrlSafe } from '../../../utils/url-security.utils';
import { resolveAuthHeaders } from './shared-http-auth';
import { doHttpFetch, execHttpWithRetry, deriveCircuitKey, resolveHttpRetryConfig, HttpFetchResult } from './shared-http-client';

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
        // Resolve retry/timeout/batch config from step config with pipeline error handling fallbacks
        const { retries, retryDelayMs, maxRetryDelayMs, backoffMultiplier, timeoutMs, maxBatchSize } = resolveHttpRetryConfig(cfg, errorHandling);

        try {
            headers = await resolveAuthHeaders(ctx, this.secretService, cfg, headers);
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for REST loader', {
                stepKey: step.key,
                endpoint,
                error: getErrorMessage(error),
            });
        }

        const fetchImpl = globalThis.fetch;
        if (!fetchImpl) return { ok, fail: input.length };

        await assertUrlSafe(endpoint);

        const circuitKey = deriveCircuitKey('rest-loader', endpoint);

        /**
         * Build merged headers for a single request, including optional HMAC signing.
         */
        const buildRequestHeaders = async (body: RecordObject | RecordObject[]): Promise<Record<string, string>> => {
            let reqHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };
            try {
                if (String(cfg.auth ?? ConnectionAuthType.NONE) === ConnectionAuthType.HMAC && cfg.hmacSecretCode && cfg.hmacHeader) {
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
                    error: getErrorMessage(error),
                });
            }
            return reqHeaders;
        };

        const fetchWithRetry = async (body: RecordObject | RecordObject[]): Promise<HttpFetchResult> => {
            return execHttpWithRetry(
                async () => {
                    const reqHeaders = await buildRequestHeaders(body);
                    return doHttpFetch({
                        endpoint,
                        method,
                        headers: reqHeaders,
                        body: JSON.stringify(body),
                        timeoutMs,
                        circuitKey,
                        circuitBreaker: this.circuitBreaker,
                        logger: this.logger,
                        stepKey: step.key,
                    });
                },
                { retries, retryDelayMs, maxRetryDelayMs, backoffMultiplier },
            );
        };

        const batchMode = String(cfg.batchMode ?? 'single');
        try {
            if (batchMode === 'array') {
                const chunks = maxBatchSize > 0 ? chunk(input, maxBatchSize) : [input];
                for (const arr of chunks) {
                    const result = await fetchWithRetry(arr);
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
                    const result = await fetchWithRetry(rec);
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
            const processedCount = ok + fail;
            const unprocessed = input.slice(processedCount);
            fail += unprocessed.length;
            for (const rec of unprocessed) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'restPost failed', rec as JsonObject);
            }
        }
        return { ok, fail };
    }
}
