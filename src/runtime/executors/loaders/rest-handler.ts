/**
 * REST POST loader handler
 */
import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
// Direct import to avoid circular dependencies
import { SecretService } from '../../../services/config/secret.service';
import { sleep, chunk } from '../../utils';
import { LoaderHandler } from './types';
import { TIME, LOGGER_CONTEXTS, HTTP } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

@Injectable()
export class RestPostHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
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
        const cfg: any = step.config ?? {};
        const endpoint = String(cfg.endpoint ?? '');
        const method = String(cfg.method ?? 'POST').toUpperCase();
        let headers = cfg.headers ?? {};
        // Use step config first, fall back to pipeline context errorHandling
        const retries = Math.max(0, Number(cfg.retries ?? errorHandling?.maxRetries ?? 0) || 0);
        const retryDelayMs = Math.max(0, Number(cfg.retryDelayMs ?? errorHandling?.retryDelayMs ?? 0) || 0);
        const maxRetryDelayMs = Math.max(0, Number(cfg.maxRetryDelayMs ?? errorHandling?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS);
        const backoffMultiplier = Number(cfg.backoffMultiplier ?? errorHandling?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER;
        const timeoutMs = Math.max(0, Number(cfg.timeoutMs ?? 0) || 0);
        const maxBatchSize = Math.max(0, Number(cfg.maxBatchSize ?? 0) || 0);

        try {
            const auth = String(cfg.auth ?? 'none');
            if (auth === 'bearer' && cfg.bearerTokenSecretCode) {
                const token = await this.secretService.resolve(ctx, String(cfg.bearerTokenSecretCode));
                if (token) headers = { ...(headers ?? {}), Authorization: `Bearer ${token}` };
            } else if (auth === 'basic' && cfg.basicSecretCode) {
                const credentials = await this.secretService.resolve(ctx, String(cfg.basicSecretCode));
                if (credentials && credentials.includes(':')) {
                    const token = Buffer.from(credentials).toString('base64');
                    headers = { ...(headers ?? {}), Authorization: `Basic ${token}` };
                }
            }
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for REST loader', {
                stepKey: step.key,
                endpoint,
                error: (error as Error)?.message,
            });
        }

        const fetchImpl: any = (global as any).fetch;
        if (!fetchImpl) return { ok, fail: input.length };

        const doFetch = async (body: any): Promise<boolean> => {
            const controller = timeoutMs > 0 ? new AbortController() : undefined;
            let timer: any;
            if (controller && timeoutMs > 0) {
                timer = setTimeout(() => controller.abort(), timeoutMs);
            }
            try {
                let reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(headers ?? {}) } as any;
                try {
                    if (String(cfg.auth ?? 'none') === 'hmac' && cfg.hmacSecretCode && cfg.hmacHeader) {
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
                        let strToSign = payloadTemplate;
                        for (const [k, v] of Object.entries(replMap)) {
                            strToSign = strToSign.split(k).join(v);
                        }
                        if (secret) {
                            const signature = crypto.createHmac('sha256', secret).update(strToSign).digest('hex');
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
                return Boolean(res?.ok);
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        const execWithRetry = async (body: any): Promise<boolean> => {
            let attempt = 0;
            while (attempt <= retries) {
                const okRes = await doFetch(body).catch(() => false);
                if (okRes) return true;
                attempt++;
                if (attempt <= retries && retryDelayMs > 0) {
                    // Calculate exponential backoff delay
                    const expDelay = Math.min(retryDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxRetryDelayMs);
                    await sleep(expDelay);
                }
            }
            return false;
        };

        const batchMode = String(cfg.batchMode ?? 'single');
        try {
            if (batchMode === 'array') {
                const chunks = maxBatchSize > 0 ? chunk(input, maxBatchSize) : [input];
                for (const arr of chunks) {
                    const okRes = await execWithRetry(arr);
                    if (okRes) ok += arr.length;
                    else {
                        fail += arr.length;
                        for (const rec of arr) {
                            if (onRecordError) await onRecordError(step.key, `REST ${method} ${endpoint} failed`, rec as any);
                        }
                    }
                }
            } else {
                for (const rec of input) {
                    const okRes = await execWithRetry(rec);
                    if (okRes) ok++;
                    else {
                        fail++;
                        if (onRecordError) await onRecordError(step.key, `REST ${method} ${endpoint} failed`, rec as any);
                    }
                }
            }
        } catch (e: any) {
            fail += input.length;
            for (const rec of input) {
                if (onRecordError) await onRecordError(step.key, e?.message ?? 'restPost failed', rec as any);
            }
        }
        return { ok, fail };
    }
}
