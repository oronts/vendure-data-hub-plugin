/**
 * HTTP Export Handler
 *
 * Sends records via HTTP POST/PUT to a remote endpoint.
 * Used by both REST_POST and WEBHOOK export adapters.
 */

import { JsonValue } from '../../../types/index';
import { chunk } from '../../utils';
import { executeWithRetry, createRetryConfig, ResolvedRetryConfig } from '../../../utils/retry.utils';
import { BATCH, HTTP, HttpMethod, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES, TRUNCATION } from '../../../constants/index';
import { assertUrlSafe } from '../../../utils/url-security.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';

function resolveRetryConfig(cfg: Record<string, JsonValue>): ResolvedRetryConfig {
    const retries = Math.max(0, Number(cfg.retries ?? 0) || 0);
    const retryDelayMs = Math.max(0, Number(cfg.retryDelayMs ?? 0) || 0);
    const maxRetryDelayMs = Math.max(0, Number(cfg.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS) || HTTP.RETRY_MAX_DELAY_MS);
    const backoffMultiplier = Math.max(1, Number(cfg.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER) || HTTP.BACKOFF_MULTIPLIER);
    return createRetryConfig({
        maxAttempts: retries + 1,
        initialDelayMs: retryDelayMs,
        maxDelayMs: maxRetryDelayMs,
        backoffMultiplier,
    });
}

export async function httpExportHandler(params: ExportHandlerParams): Promise<ExportHandlerResult> {
    const { ctx, config, records, onRecordError, stepKey, secretService, logger } = params;
    let ok = 0;
    let fail = 0;

    const endpoint = config.url as string | undefined;
    const method = ((config.method as string) ?? HttpMethod.POST).toUpperCase();
    const headers = (config.headers as Record<string, string>) ?? {};
    const batchSize = Number(config.batchSize ?? BATCH.BULK_SIZE) || BATCH.BULK_SIZE;
    const retryConfig = resolveRetryConfig(config);
    const timeoutMs = Math.max(0, Number(config.timeoutMs ?? 0) || 0);

    if (!endpoint) {
        if (onRecordError) {
            await onRecordError(stepKey, 'Export endpoint is not configured', {});
        }
        return { ok: 0, fail: records.length };
    }

    // Get auth headers from secrets
    const bearerSecret = config.bearerTokenSecretCode as string | undefined;
    const basicSecret = config.basicSecretCode as string | undefined;
    const finalHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };

    if (bearerSecret) {
        const token = await secretService.resolve(ctx, bearerSecret);
        if (token) {
            finalHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
        } else {
            if (onRecordError) {
                await onRecordError(stepKey, `Bearer token secret "${bearerSecret}" could not be resolved`, {});
            }
            return { ok: 0, fail: records.length };
        }
    }
    if (basicSecret) {
        const creds = await secretService.resolve(ctx, basicSecret);
        if (creds) {
            finalHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(creds).toString('base64')}`;
        } else {
            if (onRecordError) {
                await onRecordError(stepKey, `Basic auth secret "${basicSecret}" could not be resolved`, {});
            }
            return { ok: 0, fail: records.length };
        }
    }

    await assertUrlSafe(endpoint);

    const batches = chunk(records, batchSize);
    for (const batch of batches) {
        const payload = JSON.stringify(batch);
        try {
            await executeWithRetry(
                async () => {
                    const controller = timeoutMs > 0 ? new AbortController() : undefined;
                    let timer: NodeJS.Timeout | undefined;
                    try {
                        if (controller && timeoutMs > 0) {
                            timer = setTimeout(() => controller.abort(), timeoutMs);
                        }
                        const response = await fetch(endpoint, {
                            method,
                            headers: finalHeaders,
                            body: payload,
                            signal: controller?.signal,
                        });
                        // Always consume response body to prevent memory leaks
                        const bodyText = await response.text().catch(() => '');
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}${bodyText ? ` - ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`);
                        }
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                },
                {
                    config: retryConfig,
                    logger,
                    context: { stepKey, endpoint },
                },
            );
            ok += batch.length;
        } catch (e: unknown) {
            fail += batch.length;
            const message = getErrorMessage(e);
            if (onRecordError) {
                await onRecordError(stepKey, message, {});
            }
        }
    }

    return { ok, fail };
}
