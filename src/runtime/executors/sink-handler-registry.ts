/**
 * Sink Handler Registry
 *
 * Single source of truth for sink adapter definitions AND handler functions.
 * Adding a new sink handler requires only:
 * 1. Create the handler function in this file (or a separate file and import it)
 * 2. Add its entry to SINK_HANDLER_REGISTRY below
 *
 * BUILTIN_ADAPTERS, SINK_CODE, and the SinkExecutor
 * all derive from this registry automatically.
 */
import * as crypto from 'crypto';
import { RequestContext } from '@vendure/core';
import { AdapterDefinition } from '../../sdk/types';
import { PipelineStepDefinition, JsonObject } from '../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import { getPath, chunk } from '../utils';
import { HTTP, SINK, TRUNCATION, CIRCUIT_BREAKER } from '../../constants/defaults';
import { TIME, SERVICE_URL_TEMPLATES, CONTENT_TYPES, HTTP_HEADERS, AUTH_SCHEMES, WEBHOOK } from '../../constants';
import { HttpMethod, QueueType, CircuitState } from '../../constants/enums';
import { HTTP_METHOD_EXPORT_OPTIONS, PROTOCOL_OPTIONS, QUEUE_TYPE_OPTIONS, LOCALIZATION_SCHEMA_FIELDS, SINK_OPERATION_OPTIONS } from '../../constants/adapter-schema-options';

/**
 * Sink adapter codes - file-internal convenience for typed circuit breaker keys.
 * External consumers should use auto-derived SINK_CODE instead.
 */
export const SINK_ADAPTER_CODES = {
    MEILISEARCH: 'meilisearch',
    ELASTICSEARCH: 'elasticsearch',
    OPENSEARCH: 'opensearch',
    ALGOLIA: 'algolia',
    TYPESENSE: 'typesense',
    QUEUE_PRODUCER: 'queueProducer',
    WEBHOOK: 'webhook',
} as const;

export type SinkAdapterCode = typeof SINK_ADAPTER_CODES[keyof typeof SINK_ADAPTER_CODES];
import { queueAdapterRegistry, QueueMessage, QueueConnectionConfig } from '../../sdk/adapters/queue';
import { getAdapterCode } from '../../types/step-configs';
import { assertUrlSafe } from '../../utils/url-security.utils';
import { sleep, calculateSimpleBackoff } from '../../utils/retry.utils';
import { getErrorMessage, getErrorStack, ensureError } from '../../utils/error.utils';
import type { SecretService } from '../../services/config/secret.service';
import type { ConnectionService } from '../../services/config/connection.service';
import type { CircuitBreakerService } from '../../services/runtime';
import type { DataHubLogger } from '../../services/logger';

/**
 * Common sink configuration
 */
interface BaseSinkCfg {
    adapterCode?: string;
    indexName?: string;
    idField?: string;
    bulkSize?: number;
    fields?: string[];
    excludeFields?: string[];
    host?: string;
    hosts?: string[];
    node?: string;
    port?: number;
    protocol?: string;
    apiKeySecretCode?: string;
    basicSecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
    applicationId?: string;
    appId?: string;
    collectionName?: string;
    primaryKey?: string;
    defaultOperation?: string;
}

/**
 * Queue producer sink configuration
 */
interface QueueProducerSinkCfg extends BaseSinkCfg {
    queueType?: string;
    connectionCode?: string;
    queueName?: string;
    routingKey?: string;
    headers?: Record<string, string>;
    batchSize?: number;
    persistent?: boolean;
    priority?: number;
    ttlMs?: number;
}

/**
 * Webhook sink configuration
 */
interface WebhookSinkCfg extends BaseSinkCfg {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    bearerTokenSecretCode?: string;
    apiKeyHeader?: string;
    hmacSecretCode?: string;
    signatureHeaderName?: string;
    batchSize?: number;
    timeoutMs?: number;
    retries?: number;
}

/**
 * Context passed to sink handler functions for executing a single sink type
 */
export interface SinkHandlerContext {
    ctx: RequestContext;
    step: PipelineStepDefinition;
    input: RecordObject[];
    cfg: BaseSinkCfg;
    indexName: string;
    idField: string;
    bulkSize: number;
    prepareDoc: (rec: RecordObject) => RecordObject;
    onRecordError?: OnRecordErrorCallback;

    operation?: string;
}

/**
 * Service dependencies injected into handler functions
 */
export interface SinkServices {
    secretService: SecretService;
    connectionService: ConnectionService;
    circuitBreaker: CircuitBreakerService;
    logger: DataHubLogger;
}

/**
 * Handler function type for built-in sink adapters
 */
export type SinkHandler = (handlerCtx: SinkHandlerContext, services: SinkServices) => Promise<ExecutionResult>;

export type SinkDeleteHandler = (
    handlerCtx: SinkHandlerContext,
    services: SinkServices,
    ids: string[],
) => Promise<ExecutionResult>;

// ─── Shared utilities ────────────────────────────────────────────────

async function resolveSecret(services: SinkServices, ctx: RequestContext, secretCode?: string): Promise<string | undefined> {
    if (!secretCode) return undefined;
    try {
        const value = await services.secretService.resolve(ctx, secretCode);
        return value ?? undefined;
    } catch {
        return undefined;
    }
}

async function resolveQueueConnectionSecrets(
    services: SinkServices,
    ctx: RequestContext,
    raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const resolved = { ...raw };
    const secretFields = [
        ['passwordSecretCode', 'password'],
        ['accessKeyIdSecretCode', 'accessKeyId'],
        ['secretAccessKeySecretCode', 'secretAccessKey'],
    ];
    for (const [secretField, targetField] of secretFields) {
        const code = raw[secretField];
        if (typeof code === 'string' && code) {
            const value = await services.secretService.resolve(ctx, code);
            if (value) resolved[targetField] = value;
        }
    }
    if (raw.ssl !== undefined && resolved.useTls === undefined) {
        resolved.useTls = !!raw.ssl;
    }
    return resolved;
}

function getCircuitKey(adapterCode: string, host: string): string {
    try {
        const url = new URL(host);
        return `sink:${adapterCode}:${url.protocol}//${url.host}`;
    } catch {
        return `sink:${adapterCode}:${host.replace(/\/+$/, '')}`;
    }
}

function resolveTypesenseHost(cfg: BaseSinkCfg): string {
    if (!cfg.host) throw new Error('Typesense sink requires a host');
    const protocol = cfg.protocol ?? 'https';
    const port = cfg.port ?? SINK.TYPESENSE_DEFAULT_PORT;
    return cfg.host.includes('://') ? cfg.host : `${protocol}://${cfg.host}:${port}`;
}

function checkCircuit(services: SinkServices, circuitKey: string): { allowed: boolean; state: CircuitState; resetTimeoutMs: number } {
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
async function executeBatchedSearchSink(
    services: SinkServices,
    input: RecordObject[],
    bulkSize: number,
    circuitKey: string,
    serviceName: string,
    hostLabel: string,
    stepKey: string,
    onRecordError: OnRecordErrorCallback | undefined,
    sendBatch: (batch: RecordObject[], signal?: AbortSignal) => Promise<Response>,
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
            const bodyText = await response.text().catch(() => '');
            if (response.ok) {
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
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

// ─── Search engine handlers ──────────────────────────────────────────

async function handleMeiliSearch(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const host = cfg.host;
    if (!host) throw new Error('MeiliSearch sink requires a host URL');
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const primaryKey = cfg.primaryKey ?? idField;
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.MEILISEARCH, host);

    await assertUrlSafe(host);

    // Configure index settings if provided
    // Fields can be JSON arrays or comma-separated strings
    const parseFieldList = (val: unknown): string[] | undefined => {
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean);
        return undefined;
    };
    const searchableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).searchableFields);
    const filterableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).filterableFields);
    const sortableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).sortableFields);

    if (searchableFields || filterableFields || sortableFields) {
        const settingsHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
        if (apiKey) settingsHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
        try {
            const settingsResponse = await fetch(`${host}/indexes/${encodeURIComponent(indexName)}/settings`, {
                method: HttpMethod.PATCH,
                headers: settingsHeaders,
                body: JSON.stringify({
                    ...(searchableFields ? { searchableAttributes: searchableFields } : {}),
                    ...(filterableFields ? { filterableAttributes: filterableFields } : {}),
                    ...(sortableFields ? { sortableAttributes: sortableFields } : {}),
                }),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            if (!settingsResponse.ok) {
                services.logger.warn(`MeiliSearch settings update failed: ${settingsResponse.status}`, { stepKey: hCtx.step.key, indexName });
            }
        } catch (e: unknown) {
            services.logger.warn(`Failed to update MeiliSearch index settings`, { error: getErrorMessage(e), stepKey: hCtx.step.key });
        }
    }

    return executeBatchedSearchSink(
        services, input, bulkSize, circuitKey, 'MeiliSearch', host, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(prepareDoc);
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
            if (apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
            const url = `${host}/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=${encodeURIComponent(primaryKey)}`;
            return fetch(url, {
                method: HttpMethod.POST,
                headers,
                body: JSON.stringify(docs),
                signal,
            });
        },
    );
}

async function handleElasticsearch(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const adapterCode = getAdapterCode(step) || undefined;
    const nodes = cfg.node ? [cfg.node] : (cfg.hosts ?? (cfg.host ? [cfg.host] : []));
    if (nodes.length === 0) throw new Error('Elasticsearch/OpenSearch sink requires at least one node URL');
    const host = nodes[0];
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const username = await resolveSecret(services, ctx, cfg.usernameSecretCode);
    const password = await resolveSecret(services, ctx, cfg.passwordSecretCode);
    const basicAuth = username && password ? `${username}:${password}` : undefined;
    const effectiveAdapterCode = adapterCode ?? SINK_ADAPTER_CODES.ELASTICSEARCH;
    const circuitKey = getCircuitKey(effectiveAdapterCode, host);

    await assertUrlSafe(host);

    return executeBatchedSearchSink(
        services, input, bulkSize, circuitKey, effectiveAdapterCode, host, step.key, onRecordError,
        async (batch, signal) => {
            const bulkBody: string[] = [];
            for (const rec of batch) {
                const doc = prepareDoc(rec);
                const docId = String(getPath(rec, idField) ?? '');
                bulkBody.push(JSON.stringify({ index: { _index: indexName, _id: docId } }));
                bulkBody.push(JSON.stringify(doc));
            }
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.NDJSON };
            if (apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.API_KEY} ${apiKey}`;
            else if (basicAuth) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(basicAuth).toString('base64')}`;

            return fetch(`${host}/_bulk`, {
                method: HttpMethod.POST,
                headers,
                body: bulkBody.join('\n') + '\n',
                signal,
            });
        },
    );
}

async function handleAlgolia(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const applicationId = cfg.appId ?? cfg.applicationId;
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);

    if (!applicationId || !apiKey) {
        if (onRecordError) await onRecordError(step.key, 'Algolia applicationId and apiKey are required', {});
        return { ok: 0, fail: input.length };
    }

    const algoliaHost = SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.ALGOLIA, algoliaHost);

    await assertUrlSafe(algoliaHost);

    return executeBatchedSearchSink(
        services, input, bulkSize, circuitKey, 'Algolia', applicationId, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(rec => {
                const doc = prepareDoc(rec);
                return { ...doc, objectID: String(getPath(rec, idField) ?? '') };
            });
            const url = `${algoliaHost}/1/indexes/${encodeURIComponent(indexName)}/batch`;
            return fetch(url, {
                method: HttpMethod.POST,
                headers: {
                    'X-Algolia-Application-Id': applicationId,
                    'X-Algolia-API-Key': apiKey,
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                },
                body: JSON.stringify({ requests: docs.map(d => ({ action: 'updateObject', body: d })) }),
                signal,
            });
        },
    );
}

async function handleTypesense(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const host = resolveTypesenseHost(cfg);
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const collectionName = cfg.collectionName ?? indexName;
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.TYPESENSE, host);

    await assertUrlSafe(host);

    return executeBatchedSearchSink(
        services, input, bulkSize, circuitKey, 'Typesense', host, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(rec => {
                const doc = prepareDoc(rec);
                return { ...doc, id: String(getPath(rec, idField) ?? '') };
            });
            const ndjson = docs.map(d => JSON.stringify(d)).join('\n');
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.PLAIN };
            if (apiKey) headers[HTTP_HEADERS.X_TYPESENSE_API_KEY] = apiKey;

            const url = `${host}/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`;
            return fetch(url, {
                method: HttpMethod.POST,
                headers,
                body: ndjson,
                signal,
            });
        },
    );
}

// ─── Queue and webhook handlers ──────────────────────────────────────

async function handleQueueProducer(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, onRecordError } = hCtx;
    const cfg = step.config as QueueProducerSinkCfg;
    const queueType = String(cfg.queueType ?? QueueType.RABBITMQ).toLowerCase().replace(/_/g, '-');
    const connectionCode = cfg.connectionCode;
    const queueName = cfg.queueName;
    const routingKey = cfg.routingKey;
    const headers = cfg.headers;
    const idField = cfg.idField;
    const batchSize = Number(cfg.batchSize ?? SINK.QUEUE_BATCH_SIZE) || SINK.QUEUE_BATCH_SIZE;
    const persistent = cfg.persistent !== false;
    const priority = cfg.priority;
    const ttlMs = cfg.ttlMs;

    if (!connectionCode || !queueName) {
        const missingFields = [!connectionCode && 'connectionCode', !queueName && 'queueName'].filter(Boolean).join(', ');
        services.logger.error(`Queue producer missing required fields: ${missingFields}`, undefined, { stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Queue producer missing required fields: ${missingFields}`, {});
        return { ok: 0, fail: input.length };
    }

    const adapter = queueAdapterRegistry.get(queueType);
    if (!adapter) {
        const availableAdapters = queueAdapterRegistry.getCodes().join(', ');
        services.logger.error(`Unknown queue type: ${queueType}. Available: ${availableAdapters}`, undefined, { stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Unknown queue type: ${queueType}. Available: ${availableAdapters}`, {});
        return { ok: 0, fail: input.length };
    }

    const connection = await services.connectionService.getByCode(ctx, connectionCode);
    if (!connection) {
        services.logger.error(`Queue connection not found`, undefined, { connectionCode, stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Queue connection not found: ${connectionCode}`, {});
        return { ok: 0, fail: input.length };
    }

    const rawConfig = connection.config as Record<string, unknown>;
    const resolvedConfig = await resolveQueueConnectionSecrets(services, ctx, rawConfig);
    const connectionConfig = resolvedConfig as QueueConnectionConfig;

    let ok = 0;
    let fail = 0;
    const batches = chunk(input, batchSize);

    for (const batch of batches) {
        const operationHeader = hCtx.operation ?? 'UPSERT';
        const messages: QueueMessage[] = batch.map(record => ({
            id: idField ? String(getPath(record, idField) ?? crypto.randomUUID()) : crypto.randomUUID(),
            payload: record as JsonObject,
            routingKey,
            headers: { ...headers, 'x-datahub-operation': operationHeader },
            priority,
            ttlMs,
            persistent,
        }));

        const results = await adapter.publish(connectionConfig, queueName, messages);

        for (const result of results) {
            if (result.success) {
                ok++;
            } else {
                fail++;
                if (onRecordError) {
                    await onRecordError(step.key, result.error ?? 'Publish failed', {});
                }
            }
        }
    }

    return { ok, fail };
}

async function handleWebhook(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, onRecordError } = hCtx;
    const cfg = hCtx.cfg as WebhookSinkCfg;
    const url = cfg.url;
    const method = (cfg.method ?? HttpMethod.POST).toUpperCase();
    const staticHeaders = cfg.headers;
    const bearerTokenSecretCode = cfg.bearerTokenSecretCode;
    const apiKeySecretCode = cfg.apiKeySecretCode;
    const apiKeyHeader = cfg.apiKeyHeader ?? HTTP_HEADERS.X_API_KEY;
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

    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.WEBHOOK, url);

    await assertUrlSafe(url);

    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...staticHeaders,
    };

    if (bearerTokenSecretCode) {
        const token = await resolveSecret(services, ctx, bearerTokenSecretCode);
        if (token) {
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
        }
    } else if (apiKeySecretCode) {
        const apiKey = await resolveSecret(services, ctx, apiKeySecretCode);
        if (apiKey) {
            headers[apiKeyHeader] = apiKey;
        }
    }

    // Resolve HMAC signing secret (if configured)
    const hmacSecretCode = cfg.hmacSecretCode;
    const signatureHeaderName = cfg.signatureHeaderName ?? WEBHOOK.SIGNATURE_HEADER;
    const hmacSecret = hmacSecretCode ? await resolveSecret(services, ctx, hmacSecretCode) : undefined;

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

                // Compute HMAC-SHA256 signature for the request body
                if (hmacSecret) {
                    const signature = crypto.createHmac('sha256', hmacSecret).update(body).digest('hex');
                    batchHeaders[signatureHeaderName] = `sha256=${signature}`;
                }

                const response = await fetch(url, {
                    method,
                    headers: batchHeaders,
                    body,
                    signal: controller.signal,
                });

                const responseText = await response.text().catch(() => '');

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

// ─── Delete handlers ─────────────────────────────────────────────────

async function handleMeiliSearchDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const host = cfg.host;
    if (!host) throw new Error('MeiliSearch sink requires a host URL');
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.MEILISEARCH, host);

    await assertUrlSafe(host);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for MeiliSearch (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
            if (apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
            const response = await fetch(`${host}/indexes/${encodeURIComponent(indexName)}/documents/delete-batch`, {
                method: HttpMethod.POST,
                headers,
                body: JSON.stringify(batch),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await response.text().catch(() => '');
            if (response.ok) {
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `MeiliSearch delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

async function handleElasticsearchDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const adapterCode = getAdapterCode(step) || undefined;
    const nodes = cfg.node ? [cfg.node] : (cfg.hosts ?? (cfg.host ? [cfg.host] : []));
    if (nodes.length === 0) throw new Error('Elasticsearch/OpenSearch sink requires at least one node URL');
    const host = nodes[0];
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const username = await resolveSecret(services, ctx, cfg.usernameSecretCode);
    const password = await resolveSecret(services, ctx, cfg.passwordSecretCode);
    const basicAuth = username && password ? `${username}:${password}` : undefined;
    const effectiveAdapterCode = adapterCode ?? SINK_ADAPTER_CODES.ELASTICSEARCH;
    const circuitKey = getCircuitKey(effectiveAdapterCode, host);

    await assertUrlSafe(host);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for ${effectiveAdapterCode} (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const ndjson = batch.map(docId =>
                JSON.stringify({ delete: { _index: indexName, _id: docId } }),
            ).join('\n') + '\n';
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.NDJSON };
            if (apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.API_KEY} ${apiKey}`;
            else if (basicAuth) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(basicAuth).toString('base64')}`;

            const response = await fetch(`${host}/_bulk`, {
                method: HttpMethod.POST,
                headers,
                body: ndjson,
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await response.text().catch(() => '');
            if (response.ok) {
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `${effectiveAdapterCode} delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

async function handleAlgoliaDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const applicationId = cfg.appId ?? cfg.applicationId;
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);

    if (!applicationId || !apiKey) {
        if (onRecordError) await onRecordError(step.key, 'Algolia applicationId and apiKey are required', {});
        return { ok: 0, fail: ids.length };
    }

    const algoliaHost = SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.ALGOLIA, algoliaHost);

    await assertUrlSafe(algoliaHost);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for Algolia (${applicationId}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const response = await fetch(`${algoliaHost}/1/indexes/${encodeURIComponent(indexName)}/batch`, {
                method: HttpMethod.POST,
                headers: {
                    'X-Algolia-Application-Id': applicationId,
                    'X-Algolia-API-Key': apiKey,
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                },
                body: JSON.stringify({
                    requests: batch.map(objectID => ({ action: 'deleteObject', body: { objectID } })),
                }),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await response.text().catch(() => '');
            if (response.ok) {
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `Algolia delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

async function handleTypesenseDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, onRecordError } = hCtx;
    const host = resolveTypesenseHost(cfg);
    const apiKey = await resolveSecret(services, ctx, cfg.apiKeySecretCode);
    const collectionName = cfg.collectionName ?? indexName;
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.TYPESENSE, host);

    await assertUrlSafe(host);

    let ok = 0;
    let fail = 0;

    for (const id of ids) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail++;
            const errorMsg = `Circuit breaker open for Typesense (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const headers: Record<string, string> = {};
            if (apiKey) headers[HTTP_HEADERS.X_TYPESENSE_API_KEY] = apiKey;

            const response = await fetch(
                `${host}/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(id)}`,
                { method: 'DELETE', headers, signal: AbortSignal.timeout(HTTP.TIMEOUT_MS) },
            );
            const bodyText = await response.text().catch(() => '');
            if (response.ok) {
                ok++;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail++;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `Typesense delete error for ${id}: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail++;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

async function handleWebhookDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const modifiedCtx: SinkHandlerContext = {
        ...hCtx,
        input: ids.map(id => ({ [hCtx.idField]: id }) as RecordObject),
        cfg: { ...hCtx.cfg, method: 'DELETE' } as unknown as BaseSinkCfg,
    };
    return handleWebhook(modifiedCtx, services);
}

async function handleQueueProducerDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const modifiedCtx: SinkHandlerContext = {
        ...hCtx,
        input: ids.map(id => ({ [hCtx.idField]: id }) as RecordObject),
        operation: 'DELETE',
    };
    return handleQueueProducer(modifiedCtx, services);
}

// ─── Registry ────────────────────────────────────────────────────────

/**
 * Registry entry carrying both the handler function and its adapter definition.
 */
interface SinkRegistryEntry {
    handler: SinkHandler;
    deleteHandler?: SinkDeleteHandler;
    definition: AdapterDefinition;
}

/**
 * Maps each sink adapter code to its corresponding handler function and adapter definition.
 * Used by SinkExecutor for dispatch and BUILTIN_ADAPTERS for UI rendering.
 */
export const SINK_HANDLER_REGISTRY = new Map<string, SinkRegistryEntry>([
    [SINK_ADAPTER_CODES.MEILISEARCH, {
        handler: handleMeiliSearch,
        deleteHandler: handleMeiliSearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.MEILISEARCH,
            description: 'Index records to MeiliSearch.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#f5468e',
            schema: {
                fields: [
                    { key: 'host', label: 'Host URL', type: 'string', required: true, description: 'MeiliSearch host URL (e.g., https://meilisearch.example.com)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'string', required: true },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'primaryKey', label: 'Primary key field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    { key: 'batchSize', label: 'Batch size', type: 'number' },
                    { key: 'searchableFields', label: 'Searchable fields', type: 'json', description: 'Array of field names' },
                    { key: 'filterableFields', label: 'Filterable fields', type: 'json', description: 'Array of field names' },
                    { key: 'sortableFields', label: 'Sortable fields', type: 'json', description: 'Array of field names' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.ELASTICSEARCH, {
        handler: handleElasticsearch,
        deleteHandler: handleElasticsearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.ELASTICSEARCH,
            description: 'Index records to Elasticsearch.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#fed10a',
            schema: {
                fields: [
                    { key: 'node', label: 'Node URL', type: 'string', required: true, description: 'Node URL (e.g., https://search.example.com:9200)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'string' },
                    { key: 'usernameSecretCode', label: 'Username secret', type: 'string' },
                    { key: 'passwordSecretCode', label: 'Password secret', type: 'string' },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    { key: 'batchSize', label: 'Batch size', type: 'number' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.OPENSEARCH, {
        handler: handleElasticsearch,
        deleteHandler: handleElasticsearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.OPENSEARCH,
            description: 'Index records to OpenSearch (Elasticsearch-compatible API).',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#005eb8',
            schema: {
                fields: [
                    { key: 'node', label: 'Node URL', type: 'string', required: true, description: 'Node URL (e.g., https://search.example.com:9200)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'string' },
                    { key: 'usernameSecretCode', label: 'Username secret', type: 'string' },
                    { key: 'passwordSecretCode', label: 'Password secret', type: 'string' },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    { key: 'batchSize', label: 'Batch size', type: 'number' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.ALGOLIA, {
        handler: handleAlgolia,
        deleteHandler: handleAlgoliaDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.ALGOLIA,
            description: 'Index records to Algolia.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#003dff',
            schema: {
                fields: [
                    { key: 'appId', label: 'Application ID', type: 'string', required: true },
                    { key: 'apiKeySecretCode', label: 'Admin API key secret', type: 'string', required: true },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Object ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    { key: 'batchSize', label: 'Batch size', type: 'number' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.TYPESENSE, {
        handler: handleTypesense,
        deleteHandler: handleTypesenseDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.TYPESENSE,
            description: 'Index records to Typesense.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#d63aff',
            schema: {
                fields: [
                    { key: 'host', label: 'Host', type: 'string', required: true },
                    { key: 'port', label: 'Port', type: 'number', required: true },
                    { key: 'protocol', label: 'Protocol', type: 'select', options: PROTOCOL_OPTIONS },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'string', required: true },
                    { key: 'collectionName', label: 'Collection name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    { key: 'batchSize', label: 'Batch size', type: 'number' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
        handler: handleQueueProducer,
        deleteHandler: handleQueueProducerDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
            description: 'Publish records to message queue. Propagates operation type as x-datahub-operation message header.',
            category: 'EXTERNAL',
            icon: 'rss',
            color: '#ff6600',
            schema: {
                fields: [
                    {
                        key: 'queueType',
                        label: 'Queue Type',
                        type: 'select',
                        required: true,
                        options: QUEUE_TYPE_OPTIONS,
                    },
                    {
                        key: 'connectionCode',
                        label: 'Connection',
                        type: 'string',
                        required: true,
                        description: 'Reference to queue connection configuration.',
                    },
                    {
                        key: 'queueName',
                        label: 'Queue Name',
                        type: 'string',
                        required: true,
                        description: 'RabbitMQ queue name to publish to.',
                    },
                    {
                        key: 'routingKey',
                        label: 'Routing Key',
                        type: 'string',
                        description: 'Routing key for RabbitMQ exchanges.',
                    },
                    {
                        key: 'headers',
                        label: 'Message Headers',
                        type: 'json',
                        description: 'Static headers to include in messages.',
                    },
                    {
                        key: 'idField',
                        label: 'Message ID Field',
                        type: 'string',
                        description: 'Field to use as message ID for deduplication.',
                    },
                    {
                        key: 'batchSize',
                        label: 'Batch Size',
                        type: 'number',
                        description: 'Number of messages to send per batch.',
                    },
                    {
                        key: 'persistent',
                        label: 'Persistent',
                        type: 'boolean',
                        description: 'Persist messages to disk (delivery mode 2 in RabbitMQ).',
                    },
                    {
                        key: 'priority',
                        label: 'Priority',
                        type: 'number',
                        description: 'Message priority (1-10, higher = more urgent).',
                    },
                    {
                        key: 'ttlMs',
                        label: 'TTL (ms)',
                        type: 'number',
                        description: 'Message time-to-live in milliseconds.',
                    },
                    {
                        key: 'defaultOperation',
                        label: 'Default Operation',
                        type: 'select',
                        options: SINK_OPERATION_OPTIONS,
                        description: 'Fallback when records have no __operation field.',
                    },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.WEBHOOK, {
        handler: handleWebhook,
        deleteHandler: handleWebhookDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.WEBHOOK,
            description: 'Send records to webhook endpoints.',
            category: 'EXTERNAL',
            icon: 'webhook',
            color: '#ec4899',
            schema: {
                fields: [
                    {
                        key: 'url',
                        label: 'Webhook URL',
                        type: 'string',
                        required: true,
                        description: 'HTTP endpoint to send records to.',
                    },
                    {
                        key: 'method',
                        label: 'HTTP Method',
                        type: 'select',
                        options: HTTP_METHOD_EXPORT_OPTIONS,
                    },
                    {
                        key: 'headers',
                        label: 'Headers',
                        type: 'json',
                        description: 'HTTP headers as JSON object.',
                    },
                    {
                        key: 'bearerTokenSecretCode',
                        label: 'Bearer Token Secret',
                        type: 'string',
                        description: 'Secret code for Bearer authentication.',
                    },
                    {
                        key: 'apiKeySecretCode',
                        label: 'API Key Secret',
                        type: 'string',
                        description: 'Secret code for API key authentication.',
                    },
                    {
                        key: 'apiKeyHeader',
                        label: 'API Key Header',
                        type: 'string',
                        placeholder: 'X-API-Key',
                        description: 'Header name for API key.',
                    },
                    {
                        key: 'hmacSecretCode',
                        label: 'HMAC Signing Secret',
                        type: 'string',
                        description: 'Secret code for HMAC-SHA256 request signing. Adds X-DataHub-Signature header.',
                    },
                    {
                        key: 'signatureHeaderName',
                        label: 'Signature Header',
                        type: 'string',
                        placeholder: 'X-DataHub-Signature',
                        description: 'Header name for HMAC signature (default: X-DataHub-Signature).',
                    },
                    {
                        key: 'defaultOperation',
                        label: 'Default Operation',
                        type: 'select',
                        options: SINK_OPERATION_OPTIONS,
                        description: 'Fallback when records have no __operation field.',
                    },
                    {
                        key: 'batchSize',
                        label: 'Batch Size',
                        type: 'number',
                        description: 'Records per request.',
                    },
                    {
                        key: 'timeoutMs',
                        label: 'Timeout (ms)',
                        type: 'number',
                        placeholder: '30000',
                        description: 'Request timeout in milliseconds.',
                    },
                    {
                        key: 'retries',
                        label: 'Max Retries',
                        type: 'number',
                        placeholder: '3',
                        description: 'Maximum retry attempts on failure.',
                    },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
]);

/** All sink adapter definitions, auto-derived from the registry */
export const SINK_ADAPTERS: AdapterDefinition[] =
    Array.from(SINK_HANDLER_REGISTRY.values()).map(e => e.definition);

/**
 * Auto-derived sink code constants from registry keys.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'meilisearch' -> SINK_CODE.MEILISEARCH = 'meilisearch'
 */
export const SINK_CODE = Object.fromEntries(
    Array.from(SINK_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;
