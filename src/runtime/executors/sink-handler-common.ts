import type { RequestContext } from '@vendure/core';
import { CODE_PATTERN } from '../../../shared';
import { CIRCUIT_BREAKER, HTTP, OUTBOUND_RESPONSE_LIMITS, SINK, TRUNCATION } from '../../constants/defaults';
import { TIME } from '../../constants/time';
import { CircuitState } from '../../constants/enums';
import { readResponseText } from '../../utils/secure-response-body.utils';
import { getErrorMessage, getErrorStack } from '../../utils/error.utils';
import { chunk } from '../../utils/array.utils';
import type { ExecutionResult, OnRecordErrorCallback, RecordObject } from '../executor-types';
import type { SearchBatchResult } from './search-sink-results';
import { readSearchResponseText, reportSearchBatchErrors } from './search-sink-execution';
import type { BaseSinkCfg, SinkServices } from './sink-handler-types';

export async function resolveRequiredSecret(
    services: SinkServices,
    ctx: RequestContext,
    secretCode: string,
    field: string,
): Promise<string> {
    if (!CODE_PATTERN.test(secretCode)) {
        throw new Error(`Sink field "${field}" contains an invalid Secret Code`);
    }
    let value: string | null;
    try {
        value = await services.secretService.resolve(ctx, secretCode);
    } catch {
        throw new Error(`Secret Code "${secretCode}" configured for sink field "${field}" could not be resolved`);
    }
    if (!value) {
        throw new Error(`Secret Code "${secretCode}" configured for sink field "${field}" is empty or unavailable`);
    }
    return value;
}

function optionalSinkSecretCode(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        throw new Error(`Sink field "${field}" must contain a Secret Code`);
    }
    return value;
}

export async function resolveRequiredConfiguredSecret(
    services: SinkServices,
    ctx: RequestContext,
    value: unknown,
    field: string,
): Promise<string> {
    const secretCode = optionalSinkSecretCode(value, field);
    if (!secretCode) {
        throw new Error(`Sink field "${field}" requires a Secret Code`);
    }
    return resolveRequiredSecret(services, ctx, secretCode, field);
}

interface ElasticsearchCredentials {
    apiKey?: string;
    basicAuth?: string;
}

export async function resolveElasticsearchCredentials(
    services: SinkServices,
    ctx: RequestContext,
    cfg: BaseSinkCfg,
): Promise<ElasticsearchCredentials> {
    const apiKeyCode = optionalSinkSecretCode(cfg.apiKeySecretCode, 'apiKeySecretCode');
    const usernameCode = optionalSinkSecretCode(cfg.usernameSecretCode, 'usernameSecretCode');
    const passwordCode = optionalSinkSecretCode(cfg.passwordSecretCode, 'passwordSecretCode');
    if (apiKeyCode && (usernameCode || passwordCode)) {
        throw new Error('Elasticsearch/OpenSearch sink cannot combine API-key and basic credentials');
    }
    if (Boolean(usernameCode) !== Boolean(passwordCode)) {
        throw new Error('Elasticsearch/OpenSearch basic authentication requires both usernameSecretCode and passwordSecretCode');
    }
    if (apiKeyCode) {
        return { apiKey: await resolveRequiredSecret(services, ctx, apiKeyCode, 'apiKeySecretCode') };
    }
    if (!usernameCode || !passwordCode) return {};

    const [username, password] = await Promise.all([
        resolveRequiredSecret(services, ctx, usernameCode, 'usernameSecretCode'),
        resolveRequiredSecret(services, ctx, passwordCode, 'passwordSecretCode'),
    ]);
    return { basicAuth: `${username}:${password}` };
}


export function getCircuitKey(adapterCode: string, host: string): string {
    try {
        const url = new URL(host);
        return `sink:${adapterCode}:${url.protocol}//${url.host}`;
    } catch {
        return `sink:${adapterCode}:${host.replace(/\/+$/, '')}`;
    }
}

export async function readSinkResponseText(response: Response): Promise<string> {
    return readResponseText(response, {
        maxBytes: OUTBOUND_RESPONSE_LIMITS.ERROR_BODY_BYTES,
        context: 'Sink HTTP response',
    }).catch(() => '');
}

export function resolveTypesenseHost(cfg: BaseSinkCfg): string {
    if (!cfg.host) throw new Error('Typesense sink requires a host');
    const protocol = cfg.protocol ?? 'https';
    const port = cfg.port ?? SINK.TYPESENSE_DEFAULT_PORT;
    return cfg.host.includes('://') ? cfg.host : `${protocol}://${cfg.host}:${port}`;
}

export function checkCircuit(services: SinkServices, circuitKey: string): { allowed: boolean; state: CircuitState; resetTimeoutMs: number } {
    const state = services.circuitBreaker.getState(circuitKey);
    const allowed = services.circuitBreaker.canExecute(circuitKey);
    return {
        allowed,
        state,
        resetTimeoutMs: CIRCUIT_BREAKER.RESET_TIMEOUT_MS,
    };
}

/**
 * Shared batch loop with circuit breaker for search engine sinks.
 */
export async function executeBatchedSearchSink(
    services: SinkServices,
    input: RecordObject[],
    bulkSize: number,
    circuitKey: string,
    serviceName: string,
    hostLabel: string,
    stepKey: string,
    onRecordError: OnRecordErrorCallback | undefined,
    sendBatch: (batch: RecordObject[], signal?: AbortSignal) => Promise<Response>,
    parseSuccess?: (body: string, batch: RecordObject[]) => Promise<SearchBatchResult> | SearchBatchResult,
): Promise<ExecutionResult> {
    let ok = 0;
    let fail = 0;
    const batches = chunk(input, bulkSize);

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for ${serviceName} (${hostLabel}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey });
            if (onRecordError) await onRecordError(stepKey, errorMsg, {});
            continue;
        }

        try {
            const signal = AbortSignal.timeout(HTTP.TIMEOUT_MS);
            const response = await sendBatch(batch, signal);
            const bodyText = await readSearchResponseText(response, serviceName);
            if (response.ok) {
                const result = parseSuccess
                    ? await parseSuccess(bodyText, batch)
                    : { ok: batch.length, fail: 0, errors: [] };
                ok += result.ok;
                fail += result.fail;
                await reportSearchBatchErrors(stepKey, batch, result, onRecordError);
                if (result.fail === 0) {
                    services.circuitBreaker.recordSuccess(circuitKey);
                } else {
                    services.circuitBreaker.recordFailure(circuitKey);
                }
            } else {
                fail += batch.length;
                const errorMsg = `${serviceName} error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(stepKey, errorMsg, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            const message = getErrorMessage(e);
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(stepKey, message, {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}
