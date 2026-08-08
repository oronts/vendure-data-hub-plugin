/**
 * REST POST loader handler
 */
import * as crypto from 'crypto';
import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import type { RestPostLoaderConfig } from '../../../../shared/types';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { SecretService } from '../../../services/config/secret.service';
import { CircuitBreakerService } from '../../../services/runtime/circuit-breaker.service';
import { chunk } from '../../../utils/array.utils';
import { LoaderHandler } from './types';
import { TIME } from '../../../constants/time';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { ConnectionAuthType } from '../../../constants/enums';
import { HTTP_HEADERS, CONTENT_TYPES } from '../../../constants/services';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { resolveAuthHeaders } from './shared-http-auth';
import {
    doHttpFetch,
    execHttpWithRetry,
    deriveCircuitKey,
    resolveHttpRetryConfig,
    resolveRestBatchMode,
    resolveRestWriteMethod,
    HttpFetchResult,
} from './shared-http-client';

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
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as unknown as RestPostLoaderConfig;
        const endpoint = String(cfg.endpoint ?? '');
        const method = resolveRestWriteMethod(cfg.method);
        let headers: Record<string, string> = cfg.headers ?? {};
        // Resolve retry/timeout/batch config from step config with pipeline error handling fallbacks
        const { retries, retryDelayMs, maxRetryDelayMs, backoffMultiplier, timeoutMs, maxBatchSize } = resolveHttpRetryConfig(cfg, errorHandling);

        const authType = String(cfg.auth ?? ConnectionAuthType.NONE);
        let hmacSecret: string | undefined;
        if (authType === ConnectionAuthType.HMAC) {
            if (!cfg.hmacSecretCode || !cfg.hmacHeader) {
                throw new Error('HMAC authentication requires hmacSecretCode and hmacHeader');
            }
            hmacSecret = await this.secretService.resolve(ctx, cfg.hmacSecretCode) ?? undefined;
            if (!hmacSecret) {
                throw new Error(`HMAC authentication secret "${cfg.hmacSecretCode}" is empty or unavailable`);
            }
        } else {
            headers = await resolveAuthHeaders(ctx, this.secretService, cfg, headers);
        }



        const circuitKey = deriveCircuitKey('rest-loader', endpoint);

        /**
         * Build merged headers for a single request, including optional HMAC signing.
         */
        const buildRequestHeaders = (body: RecordObject | RecordObject[]): Record<string, string> => {
            const requestHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };
            if (authType !== ConnectionAuthType.HMAC) {
                return requestHeaders;
            }
            if (!hmacSecret || !cfg.hmacHeader) {
                throw new Error('HMAC authentication was not initialized');
            }
            const urlObj = new URL(endpoint);
            const payloadTemplate = String(cfg.hmacPayloadTemplate ?? '${method}:${path}:${timestamp}');
            const timestamp = Math.floor(Date.now() / TIME.SECOND);
            const replacements: Record<string, string> = {
                '${method}': method,
                '${path}': urlObj.pathname,
                '${timestamp}': String(timestamp),
                '${body}': JSON.stringify(body),
            };
            let payloadToSign = payloadTemplate;
            for (const [placeholder, value] of Object.entries(replacements)) {
                payloadToSign = payloadToSign.split(placeholder).join(value);
            }
            const signature = crypto.createHmac('sha256', hmacSecret).update(payloadToSign).digest('hex');
            return { ...requestHeaders, [cfg.hmacHeader]: signature, 'x-timestamp': String(timestamp) };
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

        const batchMode = resolveRestBatchMode(cfg.batchMode);
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
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'restPost failed', rec as JsonObject, getErrorStack(e));
            }
        }
        return { ok, fail, skipped: 0 };
    }
}
