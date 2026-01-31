import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import { getPath, chunk } from '../utils';
import { DEFAULTS, SERVICE_DEFAULTS, SERVICE_URL_TEMPLATES, LOGGER_CONTEXTS, HttpMethod, QueueType, SINK_ADAPTER_CODES, CONTENT_TYPES, HTTP_HEADERS, AUTH_SCHEMES, SINK, TRUNCATION, CIRCUIT_BREAKER } from '../../constants/index';
import { CircuitState } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { SinkAdapter, SinkContext } from '../../sdk/types';
import { queueAdapterRegistry, QueueMessage, QueueConnectionConfig } from '../../sdk/adapters/queue';
import { getAdapterCode } from '../../types/step-configs';
import { ConnectionType } from '../../sdk/types/connection-types';
import { CircuitBreakerService } from '../../services/runtime';

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
    apiKeySecretCode?: string;
    basicSecretCode?: string;
    applicationId?: string;
    appId?: string;
    collectionName?: string;
    primaryKey?: string;
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
    batchSize?: number;
    timeoutMs?: number;
    retries?: number;
}

@Injectable()
export class SinkExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private circuitBreaker: CircuitBreakerService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SINK_EXECUTOR);
    }

    /**
     * Generate a circuit key for an adapter/host combination
     */
    private getCircuitKey(adapterCode: string, host: string): string {
        // Normalize host by removing trailing slashes and extracting hostname
        try {
            const url = new URL(host);
            return `sink:${adapterCode}:${url.protocol}//${url.host}`;
        } catch {
            return `sink:${adapterCode}:${host.replace(/\/+$/, '')}`;
        }
    }

    /**
     * Check circuit breaker and return detailed result
     */
    private checkCircuit(circuitKey: string): { allowed: boolean; state: CircuitState; resetTimeoutMs: number } {
        const state = this.circuitBreaker.getState(circuitKey);
        const allowed = this.circuitBreaker.canExecute(circuitKey);
        return {
            allowed,
            state,
            resetTimeoutMs: CIRCUIT_BREAKER.RESET_TIMEOUT_MS,
        };
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as BaseSinkCfg;
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;

        this.logger.debug(`Executing sink step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Common config - use constants for default values
        const indexName = cfg.indexName ?? SINK.DEFAULT_INDEX_NAME;
        const idField = cfg.idField ?? SINK.DEFAULT_ID_FIELD;
        const bulkSize = Number(cfg.bulkSize ?? DEFAULTS.BULK_SIZE) || DEFAULTS.BULK_SIZE;

        // Apply field selection
        const fields = cfg.fields;
        const excludeFields = cfg.excludeFields;

        const prepareDoc = (rec: RecordObject): RecordObject => {
            let result: RecordObject = { ...rec };
            if (fields && fields.length > 0) {
                const picked: RecordObject = {};
                for (const f of fields) {
                    const val = getPath(rec, f);
                    if (val !== undefined) picked[f] = val as JsonValue;
                }
                result = picked;
            } else if (excludeFields && excludeFields.length > 0) {
                for (const f of excludeFields) {
                    delete result[f];
                }
            }
            return result;
        };

        switch (adapterCode) {
            case SINK_ADAPTER_CODES.MEILISEARCH: {
                const host = cfg.host ?? SERVICE_DEFAULTS.MEILISEARCH_URL;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const primaryKey = cfg.primaryKey ?? idField;
                const circuitKey = this.getCircuitKey(SINK_ADAPTER_CODES.MEILISEARCH, host);

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    // Check circuit breaker before attempting request
                    const circuitResult = this.checkCircuit(circuitKey);
                    if (!circuitResult.allowed) {
                        fail += batch.length;
                        const errorMsg = `Circuit breaker open for MeiliSearch (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / 1000)}s`;
                        this.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
                        if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        continue;
                    }

                    try {
                        const docs = batch.map(prepareDoc);
                        const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
                        if (apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
                        const url = `${host}/indexes/${indexName}/documents?primaryKey=${primaryKey}`;
                        const response = await fetch(url, {
                            method: HttpMethod.POST,
                            headers,
                            body: JSON.stringify(docs),
                        });
                        if (response.ok) {
                            ok += batch.length;
                            this.circuitBreaker.recordSuccess(circuitKey);
                        } else {
                            fail += batch.length;
                            const errorMsg = `MeiliSearch error: ${response.status}`;
                            this.circuitBreaker.recordFailure(circuitKey);
                            if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'MeiliSearch indexing failed';
                        this.circuitBreaker.recordFailure(circuitKey);
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case SINK_ADAPTER_CODES.ELASTICSEARCH:
            case SINK_ADAPTER_CODES.OPENSEARCH: {
                const hosts = cfg.hosts ?? [cfg.host ?? SERVICE_DEFAULTS.ELASTICSEARCH_URL];
                const host = hosts[0];
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const basicAuth = await this.resolveSecret(ctx, cfg.basicSecretCode);
                const effectiveAdapterCode = adapterCode ?? SINK_ADAPTER_CODES.ELASTICSEARCH;
                const circuitKey = this.getCircuitKey(effectiveAdapterCode, host);

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    // Check circuit breaker before attempting request
                    const circuitResult = this.checkCircuit(circuitKey);
                    if (!circuitResult.allowed) {
                        fail += batch.length;
                        const errorMsg = `Circuit breaker open for ${effectiveAdapterCode} (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / 1000)}s`;
                        this.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
                        if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        continue;
                    }

                    try {
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

                        const response = await fetch(`${host}/_bulk`, {
                            method: HttpMethod.POST,
                            headers,
                            body: bulkBody.join('\n') + '\n',
                        });
                        if (response.ok) {
                            ok += batch.length;
                            this.circuitBreaker.recordSuccess(circuitKey);
                        } else {
                            fail += batch.length;
                            const errorMsg = `${effectiveAdapterCode} error: ${response.status}`;
                            this.circuitBreaker.recordFailure(circuitKey);
                            if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : `${effectiveAdapterCode} indexing failed`;
                        this.circuitBreaker.recordFailure(circuitKey);
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case SINK_ADAPTER_CODES.ALGOLIA: {
                const applicationId = cfg.appId ?? cfg.applicationId;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);

                if (!applicationId || !apiKey) {
                    fail = input.length;
                    if (onRecordError) await onRecordError(step.key, 'Algolia applicationId and apiKey are required', {});
                    break;
                }

                const algoliaHost = SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId);
                const circuitKey = this.getCircuitKey(SINK_ADAPTER_CODES.ALGOLIA, algoliaHost);

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    // Check circuit breaker before attempting request
                    const circuitResult = this.checkCircuit(circuitKey);
                    if (!circuitResult.allowed) {
                        fail += batch.length;
                        const errorMsg = `Circuit breaker open for Algolia (${applicationId}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / 1000)}s`;
                        this.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
                        if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        continue;
                    }

                    try {
                        const docs = batch.map(rec => {
                            const doc = prepareDoc(rec);
                            return { ...doc, objectID: String(getPath(rec, idField) ?? '') };
                        });
                        const url = `${algoliaHost}/1/indexes/${indexName}/batch`;
                        const response = await fetch(url, {
                            method: HttpMethod.POST,
                            headers: {
                                'X-Algolia-Application-Id': applicationId,
                                'X-Algolia-API-Key': apiKey,
                                [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                            },
                            body: JSON.stringify({ requests: docs.map(d => ({ action: 'updateObject', body: d })) }),
                        });
                        if (response.ok) {
                            ok += batch.length;
                            this.circuitBreaker.recordSuccess(circuitKey);
                        } else {
                            fail += batch.length;
                            const errorMsg = `Algolia error: ${response.status}`;
                            this.circuitBreaker.recordFailure(circuitKey);
                            if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Algolia indexing failed';
                        this.circuitBreaker.recordFailure(circuitKey);
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case SINK_ADAPTER_CODES.TYPESENSE: {
                const host = cfg.host ?? SERVICE_DEFAULTS.TYPESENSE_URL;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const collectionName = cfg.collectionName ?? indexName;
                const circuitKey = this.getCircuitKey(SINK_ADAPTER_CODES.TYPESENSE, host);

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    // Check circuit breaker before attempting request
                    const circuitResult = this.checkCircuit(circuitKey);
                    if (!circuitResult.allowed) {
                        fail += batch.length;
                        const errorMsg = `Circuit breaker open for Typesense (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / 1000)}s`;
                        this.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
                        if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        continue;
                    }

                    try {
                        const docs = batch.map(rec => {
                            const doc = prepareDoc(rec);
                            return { ...doc, id: String(getPath(rec, idField) ?? '') };
                        });
                        const ndjson = docs.map(d => JSON.stringify(d)).join('\n');
                        const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.PLAIN };
                        if (apiKey) headers[HTTP_HEADERS.X_TYPESENSE_API_KEY] = apiKey;

                        const url = `${host}/collections/${collectionName}/documents/import?action=upsert`;
                        const response = await fetch(url, {
                            method: HttpMethod.POST,
                            headers,
                            body: ndjson,
                        });
                        if (response.ok) {
                            ok += batch.length;
                            this.circuitBreaker.recordSuccess(circuitKey);
                        } else {
                            fail += batch.length;
                            const errorMsg = `Typesense error: ${response.status}`;
                            this.circuitBreaker.recordFailure(circuitKey);
                            if (onRecordError) await onRecordError(step.key, errorMsg, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Typesense indexing failed';
                        this.circuitBreaker.recordFailure(circuitKey);
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case SINK_ADAPTER_CODES.QUEUE_PRODUCER: {
                const result = await this.executeQueueProducerSink(ctx, step, input, onRecordError);
                ok = result.ok;
                fail = result.fail;
                break;
            }
            case SINK_ADAPTER_CODES.WEBHOOK: {
                const result = await this.executeWebhookSink(ctx, step, input, onRecordError);
                ok = result.ok;
                fail = result.fail;
                break;
            }
            default: {
                // Try custom sinks from registry
                if (adapterCode && this.registry) {
                    const customSink = this.registry.getRuntime('sink', adapterCode) as SinkAdapter<JsonObject> | undefined;
                    if (customSink && typeof customSink.index === 'function') {
                        const result = await this.executeCustomSink(ctx, step, input, customSink, pipelineContext);
                        ok = result.ok;
                        fail = result.fail;
                        break;
                    }
                }
                this.logger.warn(`Unknown sink adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
                break;
            }
        }

        this.logOperationResult(adapterCode ?? 'unknown', 'index', ok, fail, startTime, step.key);

        return { ok, fail };
    }

    private logOperationResult(adapterCode: string, operation: string, ok: number, fail: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logSinkOperation(adapterCode, operation, ok, fail, durationMs, { stepKey });
    }

    /**
     * Execute a custom sink adapter from the registry
     */
    private async executeCustomSink(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        sink: SinkAdapter<JsonObject>,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject;

        // Create sink context for the custom sink adapter
        const sinkContext: SinkContext = {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            secrets: {
                get: async (code: string) => {
                    const secret = await this.secretService.getByCode(ctx, code);
                    return secret?.value ?? undefined;
                },
                getRequired: async (code: string) => {
                    const secret = await this.secretService.getByCode(ctx, code);
                    if (!secret?.value) throw new Error(`Secret not found: ${code}`);
                    return secret.value;
                },
            },
            connections: this.createConnectionAdapter(ctx),
            logger: this.createLoggerAdapter(),
            dryRun: false,
        };

        try {
            const result = await sink.index(sinkContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.indexed,
                fail: result.failed,
            };
        } catch (error) {
            this.logger.error(`Custom sink failed`, error instanceof Error ? error : undefined, {
                adapterCode: sink.code,
                stepKey: step.key,
            });
            return { ok: 0, fail: input.length };
        }
    }

    private createConnectionAdapter(ctx: RequestContext): SinkContext['connections'] {
        return {
            get: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) return undefined;
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    config: conn.config as JsonObject,
                };
            },
            getRequired: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) throw new Error(`Connection not found: ${code}`);
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    config: conn.config as JsonObject,
                };
            },
        };
    }

    private createLoggerAdapter(): SinkContext['logger'] {
        return {
            info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta),
            warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta),
            error: (msg: string, meta?: JsonObject) => this.logger.error(msg, undefined, meta),
            debug: (msg: string, meta?: JsonObject) => this.logger.debug(msg, meta),
        };
    }

    private async resolveSecret(ctx: RequestContext, secretCode?: string): Promise<string | undefined> {
        if (!secretCode) return undefined;
        try {
            const value = await this.secretService.resolve(ctx, secretCode);
            return value ?? undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Execute queue producer sink - publish records to message queues
     * Uses extensible queue adapter registry for different queue systems.
     */
    private async executeQueueProducerSink(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<ExecutionResult> {
        const cfg = step.config as QueueProducerSinkCfg;
        const queueType = cfg.queueType ?? QueueType.RABBITMQ;
        const connectionCode = cfg.connectionCode;
        const queueName = cfg.queueName;
        const routingKey = cfg.routingKey;
        const headers = cfg.headers;
        const idField = cfg.idField;
        const batchSize = Number(cfg.batchSize ?? SINK.QUEUE_BATCH_SIZE) || SINK.QUEUE_BATCH_SIZE;
        const persistent = cfg.persistent !== false;
        const priority = cfg.priority;
        const ttlMs = cfg.ttlMs;

        // Validate required fields
        if (!connectionCode || !queueName) {
            const missingFields = [!connectionCode && 'connectionCode', !queueName && 'queueName'].filter(Boolean).join(', ');
            this.logger.error(`Queue producer missing required fields: ${missingFields}`, undefined, { stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, `Queue producer missing required fields: ${missingFields}`, {});
            return { ok: 0, fail: input.length };
        }

        // Get queue adapter from registry
        const adapter = queueAdapterRegistry.get(queueType);
        if (!adapter) {
            const availableAdapters = queueAdapterRegistry.getCodes().join(', ');
            this.logger.error(`Unknown queue type: ${queueType}. Available: ${availableAdapters}`, undefined, { stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, `Unknown queue type: ${queueType}. Available: ${availableAdapters}`, {});
            return { ok: 0, fail: input.length };
        }

        // Get connection configuration
        const connection = await this.connectionService.getByCode(ctx, connectionCode);
        if (!connection) {
            this.logger.error(`Queue connection not found`, undefined, { connectionCode, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, `Queue connection not found: ${connectionCode}`, {});
            return { ok: 0, fail: input.length };
        }

        const connectionConfig = connection.config as QueueConnectionConfig;

        let ok = 0;
        let fail = 0;

        // Process records in batches
        const batches = chunk(input, batchSize);

        for (const batch of batches) {
            // Convert records to queue messages
            const messages: QueueMessage[] = batch.map(record => ({
                id: idField ? String(getPath(record, idField) ?? crypto.randomUUID()) : crypto.randomUUID(),
                payload: record as JsonObject,
                routingKey,
                headers,
                priority,
                ttlMs,
                persistent,
            }));

            // Publish batch using the adapter
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

    /**
     * Execute webhook sink - send records to HTTP endpoints
     */
    private async executeWebhookSink(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<ExecutionResult> {
        const cfg = step.config as WebhookSinkCfg;
        const url = cfg.url;
        const method = (cfg.method ?? HttpMethod.POST).toUpperCase();
        const staticHeaders = cfg.headers;
        const bearerTokenSecretCode = cfg.bearerTokenSecretCode;
        const apiKeySecretCode = cfg.apiKeySecretCode;
        const apiKeyHeader = cfg.apiKeyHeader ?? HTTP_HEADERS.X_API_KEY;
        const batchSize = Number(cfg.batchSize ?? SINK.WEBHOOK_BATCH_SIZE) || SINK.WEBHOOK_BATCH_SIZE;
        const timeoutMs = Number(cfg.timeoutMs ?? DEFAULTS.HTTP_TIMEOUT_MS) || DEFAULTS.HTTP_TIMEOUT_MS;
        const maxRetries = Number(cfg.retries ?? DEFAULTS.MAX_RETRIES) || DEFAULTS.MAX_RETRIES;

        let ok = 0;
        let fail = 0;

        if (!url) {
            this.logger.error(`Webhook URL not configured`, undefined, { stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, 'Webhook URL not configured', {});
            return { ok: 0, fail: input.length };
        }

        const circuitKey = this.getCircuitKey(SINK_ADAPTER_CODES.WEBHOOK, url);

        // Build headers
        const headers: Record<string, string> = {
            [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
            ...staticHeaders,
        };

        // Add authentication
        if (bearerTokenSecretCode) {
            const token = await this.resolveSecret(ctx, bearerTokenSecretCode);
            if (token) {
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
            }
        } else if (apiKeySecretCode) {
            const apiKey = await this.resolveSecret(ctx, apiKeySecretCode);
            if (apiKey) {
                headers[apiKeyHeader] = apiKey;
            }
        }

        // Process records in batches
        const batches = chunk(input, batchSize);
        for (const batch of batches) {
            // Check circuit breaker before attempting request
            const circuitResult = this.checkCircuit(circuitKey);
            if (!circuitResult.allowed) {
                fail += batch.length;
                const errorMsg = `Circuit breaker open for webhook (${url}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / 1000)}s`;
                this.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
                if (onRecordError) await onRecordError(step.key, errorMsg, {});
                continue;
            }

            let lastError: Error | undefined;
            let success = false;

            for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const response = await fetch(url, {
                        method,
                        headers,
                        body: JSON.stringify(batch),
                        signal: controller.signal,
                    });

                    // Always consume response body to prevent memory leaks
                    const responseText = await response.text().catch(() => '');

                    if (response.ok) {
                        ok += batch.length;
                        success = true;
                        this.circuitBreaker.recordSuccess(circuitKey);
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}${responseText ? ` - ${responseText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`);
                    }
                } catch (e) {
                    lastError = e instanceof Error ? e : new Error(String(e));

                    if (e instanceof Error && e.name === 'AbortError') {
                        lastError = new Error(`Request timeout after ${timeoutMs}ms`);
                    }

                    // Exponential backoff with base delay from constants
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * SINK.BACKOFF_BASE_DELAY_MS));
                    }
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (!success) {
                fail += batch.length;
                // Record failure in circuit breaker after all retries exhausted
                this.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) {
                    await onRecordError(step.key, lastError?.message ?? 'Webhook request failed', {});
                }
            }
        }

        return { ok, fail };
    }

    /**
     * Get circuit breaker statistics for a specific circuit
     */
    getCircuitStats(circuitKey: string): { state: CircuitState; failures: number; successes: number } {
        return this.circuitBreaker.getStats(circuitKey);
    }

    /**
     * Reset a specific circuit breaker
     */
    resetCircuit(circuitKey: string): void {
        this.circuitBreaker.reset(circuitKey);
    }

    /**
     * Reset all circuit breakers
     */
    resetAllCircuits(): void {
        this.circuitBreaker.resetAll();
    }
}
