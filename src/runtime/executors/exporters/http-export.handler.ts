/**
 * HTTP Export Handler
 *
 * Sends records via HTTP POST/PUT to a remote endpoint.
 * Used by both REST_POST and WEBHOOK export adapters.
 */

import { JsonValue } from '../../../types/index';
import { chunk } from '../../utils';
import { executeWithRetry, createRetryConfig, ResolvedRetryConfig } from '../../../utils/retry.utils';
import { BATCH, HTTP, HttpMethod, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES, TRUNCATION, OUTBOUND_RESPONSE_LIMITS } from '../../../constants/index';
import { secureFetch } from '../../../utils/secure-fetch.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { readResponseText } from '../../../utils/secure-response-body.utils';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';
import { parseDestinationConfig } from '../../../services/destinations/destination-config.validation';
import type { HTTPDestinationConfig } from '../../../services/destinations/destination.types';

function resolveRetryConfig(cfg: Record<string, JsonValue>): ResolvedRetryConfig {
    const retries = Math.max(0, Number(cfg.retryCount ?? 0) || 0);
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

    const method = ((config.method as string) ?? HttpMethod.POST).toUpperCase();
    const batchSize = Number(config.batchSize ?? BATCH.BULK_SIZE) || BATCH.BULK_SIZE;
    const retryConfig = resolveRetryConfig(config);
    const timeoutMs = Math.max(0, Number(config.timeoutMs ?? HTTP.TIMEOUT_MS) || HTTP.TIMEOUT_MS);

    let destination: HTTPDestinationConfig;
    try {
        destination = parseDestinationConfig({
            id: `pipeline:${stepKey}`,
            name: `Pipeline HTTP export ${stepKey}`,
            type: 'HTTP',
            url: config.url,
            method,
            headers: config.headers,
            headerSecretCodes: config.headerSecretCodes,
        }) as HTTPDestinationConfig;
    } catch (error) {
        const message = getErrorMessage(error);
        if (onRecordError) {
            await onRecordError(stepKey, message, { _configError: true, recordCount: records.length });
        }
        return { ok: 0, fail: records.length };
    }
    const endpoint = destination.url;

    // Get auth headers from secrets
    const bearerSecret = config.bearerTokenSecretCode as string | undefined;
    const basicSecret = config.basicSecretCode as string | undefined;
    const secretHeaders: Record<string, string> = {};
    for (const [name, code] of Object.entries(destination.headerSecretCodes ?? {})) {
        if (
            name.toLowerCase() === HTTP_HEADERS.AUTHORIZATION.toLowerCase() &&
            (bearerSecret || basicSecret)
        ) {
            const message = 'Authorization cannot be configured by both authentication and headerSecretCodes';
            if (onRecordError) {
                await onRecordError(stepKey, message, { _configError: true, recordCount: records.length });
            }
            return { ok: 0, fail: records.length };
        }
        const value = await secretService.resolve(ctx, code);
        if (!value) {
            const message = `Header Secret Code "${code}" could not be resolved`;
            if (onRecordError) {
                await onRecordError(stepKey, message, { _configError: true, secretCode: code });
            }
            return { ok: 0, fail: records.length };
        }
        secretHeaders[name] = value;
    }
    const finalHeaders: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...destination.headers,
        ...secretHeaders,
    };

    if (bearerSecret) {
        const token = await secretService.resolve(ctx, bearerSecret);
        if (token) {
            finalHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
        } else {
            if (onRecordError) {
                await onRecordError(stepKey, `Bearer token secret "${bearerSecret}" could not be resolved`, { _configError: true, secretCode: bearerSecret });
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
                await onRecordError(stepKey, `Basic auth secret "${basicSecret}" could not be resolved`, { _configError: true, secretCode: basicSecret });
            }
            return { ok: 0, fail: records.length };
        }
    }


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
                        const response = await secureFetch(endpoint, {
                            method,
                            headers: finalHeaders,
                            body: payload,
                            signal: controller?.signal,
                        });
                        // Always consume response body to prevent memory leaks
                        const bodyText = await readResponseText(response, {
                            maxBytes: OUTBOUND_RESPONSE_LIMITS.ERROR_BODY_BYTES,
                            context: 'HTTP exporter response',
                        }).catch(() => '');
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
                await onRecordError(stepKey, message, { _batchError: true, endpoint, batchSize: batch.length });
            }
        }
    }

    return { ok, fail };
}
