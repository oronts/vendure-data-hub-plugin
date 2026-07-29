import * as crypto from 'crypto';
import type { RequestContext } from '@vendure/core';
import { AUTH_SCHEMES, CONTENT_TYPES, HTTP_HEADERS } from '../../constants/services';
import { TIME } from '../../constants/time';
import { WEBHOOK } from '../../constants/defaults/webhook-defaults';
import { HTTP, SINK, TRUNCATION } from '../../constants/defaults';
import { ConnectionAuthType, HttpMethod } from '../../constants/enums';
import { parseDestinationConfig } from '../../services/destinations/destination-config.validation';
import { ensureError } from '../../utils/error.utils';
import { calculateSimpleBackoff, sleep } from '../../utils/retry.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { assertUrlSafe } from '../../utils/url-security.utils';
import { chunk } from '../../utils/array.utils';
import type { ExecutionResult, RecordObject } from '../executor-types';
import { checkCircuit, getCircuitKey, readSinkResponseText, resolveRequiredSecret } from './sink-handler-common';
import { SINK_ADAPTER_CODES, type BaseSinkCfg, type SinkHandlerContext, type SinkServices, type WebhookSinkCfg } from './sink-handler-types';

interface ValidatedWebhookSecurityConfig {
    staticHeaders: Record<string, string>;
    bearerTokenSecretCode?: string;
    apiKeySecretCode?: string;
    apiKeyHeader: string;
    hmacSecretCode?: string;
    signatureHeaderName: string;
}

interface ResolvedWebhookSecurityConfig {
    staticHeaders: Record<string, string>;
    bearerToken?: string;
    apiKey?: string;
    apiKeyHeader: string;
    hmacSecret?: string;
    signatureHeaderName: string;
}

function assertWebhookCredentialConfiguration(cfg: WebhookSinkCfg): void {
    const hasBearer = cfg.bearerTokenSecretCode !== undefined;
    const hasApiKey = cfg.apiKeySecretCode !== undefined;
    if (hasBearer && hasApiKey) {
        throw new Error('Webhook sink cannot configure both bearerTokenSecretCode and apiKeySecretCode');
    }
    if (cfg.apiKeyHeader !== undefined && !hasApiKey) {
        throw new Error('Webhook sink apiKeyHeader requires apiKeySecretCode');
    }
    if (cfg.signatureHeaderName !== undefined && cfg.hmacSecretCode === undefined) {
        throw new Error('Webhook sink signatureHeaderName requires hmacSecretCode');
    }
}

function validateWebhookSecurity(cfg: WebhookSinkCfg, method: string): ValidatedWebhookSecurityConfig {
    assertWebhookCredentialConfiguration(cfg);
    const apiKeyHeader = cfg.apiKeyHeader ?? HTTP_HEADERS.X_API_KEY;
    const signatureHeaderName = cfg.signatureHeaderName ?? WEBHOOK.SIGNATURE_HEADER;
    const auth = cfg.bearerTokenSecretCode !== undefined
        ? { type: ConnectionAuthType.BEARER, secretCode: cfg.bearerTokenSecretCode }
        : cfg.apiKeySecretCode !== undefined
            ? { type: ConnectionAuthType.API_KEY, secretCode: cfg.apiKeySecretCode, headerName: apiKeyHeader }
            : { type: ConnectionAuthType.NONE };
    const parsed = parseDestinationConfig({
        id: 'sink:webhook',
        name: 'Webhook sink',
        type: 'HTTP',
        url: cfg.url,
        method: method === HttpMethod.DELETE ? HttpMethod.POST : method,
        headers: cfg.headers,
        headerSecretCodes: cfg.hmacSecretCode === undefined
            ? undefined
            : { [signatureHeaderName]: cfg.hmacSecretCode },
        auth,
    });
    if (parsed.type !== 'HTTP') throw new Error('Invalid webhook destination configuration');

    const staticHeaderNames = new Set(Object.keys(parsed.headers ?? {}).map(name => name.toLowerCase()));
    const credentialHeader = cfg.bearerTokenSecretCode !== undefined
        ? HTTP_HEADERS.AUTHORIZATION
        : cfg.apiKeySecretCode !== undefined ? apiKeyHeader : undefined;
    const generatedHeaders = [
        credentialHeader,
        cfg.hmacSecretCode === undefined ? undefined : signatureHeaderName,
    ].filter((name): name is string => name !== undefined);
    if (generatedHeaders.some(name => name.toLowerCase() === HTTP_HEADERS.CONTENT_TYPE.toLowerCase())) {
        throw new Error(`Webhook credential and signature headers cannot replace ${HTTP_HEADERS.CONTENT_TYPE}`);
    }
    if (credentialHeader && staticHeaderNames.has(credentialHeader.toLowerCase())) {
        throw new Error(`Webhook header "${credentialHeader}" cannot be configured as both static and secret-backed`);
    }
    return {
        staticHeaders: parsed.headers ?? {},
        bearerTokenSecretCode: cfg.bearerTokenSecretCode,
        apiKeySecretCode: cfg.apiKeySecretCode,
        apiKeyHeader,
        hmacSecretCode: cfg.hmacSecretCode,
        signatureHeaderName,
    };
}

async function resolveWebhookSecurity(
    cfg: WebhookSinkCfg,
    services: SinkServices,
    ctx: RequestContext,
    method: string,
): Promise<ResolvedWebhookSecurityConfig> {
    const validated = validateWebhookSecurity(cfg, method);
    const [bearerToken, apiKey, hmacSecret] = await Promise.all([
        validated.bearerTokenSecretCode === undefined ? undefined : resolveRequiredSecret(
            services, ctx, validated.bearerTokenSecretCode, 'bearerTokenSecretCode',
        ),
        validated.apiKeySecretCode === undefined ? undefined : resolveRequiredSecret(
            services, ctx, validated.apiKeySecretCode, 'apiKeySecretCode',
        ),
        validated.hmacSecretCode === undefined ? undefined : resolveRequiredSecret(
            services, ctx, validated.hmacSecretCode, 'hmacSecretCode',
        ),
    ]);
    return {
        staticHeaders: validated.staticHeaders,
        bearerToken,
        apiKey,
        apiKeyHeader: validated.apiKeyHeader,
        hmacSecret,
        signatureHeaderName: validated.signatureHeaderName,
    };
}


export async function handleWebhook(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, onRecordError } = hCtx;
    const cfg = hCtx.cfg as WebhookSinkCfg;
    const url = cfg.url;
    const method = (cfg.method ?? HttpMethod.POST).toUpperCase();
    const batchSize = Number(cfg.batchSize ?? SINK.WEBHOOK_BATCH_SIZE) || SINK.WEBHOOK_BATCH_SIZE;
    const timeoutMs = Number(cfg.timeoutMs ?? HTTP.TIMEOUT_MS) || HTTP.TIMEOUT_MS;
    const maxRetries = Math.max(0, Number(cfg.retries ?? HTTP.MAX_RETRIES));

    let ok = 0;
    let fail = 0;

    if (!url) {
        services.logger.error(`Webhook URL not configured`, undefined, { stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, 'Webhook URL not configured', {});
        return { ok: 0, fail: input.length };
    }

    const security = await resolveWebhookSecurity(cfg, services, ctx, method);

    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.WEBHOOK, url);

    await assertUrlSafe(url);

    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...security.staticHeaders,
    };

    if (security.bearerToken) {
        headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${security.bearerToken}`;
    } else if (security.apiKey) {
        headers[security.apiKeyHeader] = security.apiKey;
    }

    const batches = chunk(input, batchSize);
    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for webhook (${url}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        let lastError: Error | undefined;
        let success = false;

        for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const body = JSON.stringify(batch);
                const batchHeaders = { ...headers };

                if (security.hmacSecret) {
                    const signature = crypto.createHmac('sha256', security.hmacSecret).update(body).digest('hex');
                    batchHeaders[security.signatureHeaderName] = `sha256=${signature}`;
                }

                const response = await secureFetch(url, {
                    method,
                    headers: batchHeaders,
                    body,
                    signal: controller.signal,
                });

                const responseText = await readSinkResponseText(response);

                if (response.ok) {
                    ok += batch.length;
                    success = true;
                    services.circuitBreaker.recordSuccess(circuitKey);
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}${responseText ? ` - ${responseText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`);
                }
            } catch (e) {
                lastError = ensureError(e);

                if (e instanceof Error && e.name === 'AbortError') {
                    lastError = new Error(`Request timeout after ${timeoutMs}ms`);
                }

                if (attempt < maxRetries) {
                    await sleep(calculateSimpleBackoff(attempt, SINK.BACKOFF_BASE_DELAY_MS));
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }

        if (!success) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) {
                await onRecordError(step.key, lastError?.message ?? 'Webhook request failed', {}, lastError?.stack);
            }
        }
    }

    return { ok, fail };
}


export async function handleWebhookDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const modifiedCtx: SinkHandlerContext = {
        ...hCtx,
        input: ids.map(id => ({ [hCtx.idField]: id }) as RecordObject),
        cfg: { ...hCtx.cfg, method: 'DELETE' } as unknown as BaseSinkCfg,
    };
    return handleWebhook(modifiedCtx, services);
}
