import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
// Direct imports to avoid circular dependencies
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import { getPath, chunk } from '../utils';
import { DEFAULTS, SERVICE_DEFAULTS, SERVICE_URL_TEMPLATES, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { SinkAdapter, SinkContext } from '../../sdk/types';

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
    collectionName?: string;
    primaryKey?: string;
}

@Injectable()
export class SinkExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SINK_EXECUTOR);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as BaseSinkCfg;
        const adapterCode = cfg.adapterCode;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;

        this.logger.debug(`Executing sink step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Common config
        const indexName = cfg.indexName ?? 'products';
        const idField = cfg.idField ?? 'id';
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
            case 'meilisearch': {
                const host = cfg.host ?? SERVICE_DEFAULTS.MEILISEARCH_URL;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const primaryKey = cfg.primaryKey ?? idField;

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    try {
                        const docs = batch.map(prepareDoc);
                        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                        const url = `${host}/indexes/${indexName}/documents?primaryKey=${primaryKey}`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(docs),
                        });
                        if (response.ok) {
                            ok += batch.length;
                        } else {
                            fail += batch.length;
                            if (onRecordError) await onRecordError(step.key, `MeiliSearch error: ${response.status}`, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'MeiliSearch indexing failed';
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case 'elasticsearch':
            case 'opensearch': {
                const hosts = cfg.hosts ?? [cfg.host ?? SERVICE_DEFAULTS.ELASTICSEARCH_URL];
                const host = hosts[0];
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const basicAuth = await this.resolveSecret(ctx, cfg.basicSecretCode);

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    try {
                        const bulkBody: string[] = [];
                        for (const rec of batch) {
                            const doc = prepareDoc(rec);
                            const docId = String(getPath(rec, idField) ?? '');
                            bulkBody.push(JSON.stringify({ index: { _index: indexName, _id: docId } }));
                            bulkBody.push(JSON.stringify(doc));
                        }
                        const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson' };
                        if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;
                        else if (basicAuth) headers['Authorization'] = `Basic ${Buffer.from(basicAuth).toString('base64')}`;

                        const response = await fetch(`${host}/_bulk`, {
                            method: 'POST',
                            headers,
                            body: bulkBody.join('\n') + '\n',
                        });
                        if (response.ok) {
                            ok += batch.length;
                        } else {
                            fail += batch.length;
                            if (onRecordError) await onRecordError(step.key, `Elasticsearch error: ${response.status}`, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Elasticsearch indexing failed';
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case 'algolia': {
                const applicationId = (cfg as Record<string, unknown>).appId as string | undefined ?? cfg.applicationId;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);

                if (!applicationId || !apiKey) {
                    fail = input.length;
                    if (onRecordError) await onRecordError(step.key, 'Algolia applicationId and apiKey are required', {});
                    break;
                }

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    try {
                        const docs = batch.map(rec => {
                            const doc = prepareDoc(rec);
                            return { ...doc, objectID: String(getPath(rec, idField) ?? '') };
                        });
                        const url = `${SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId)}/1/indexes/${indexName}/batch`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'X-Algolia-Application-Id': applicationId,
                                'X-Algolia-API-Key': apiKey,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ requests: docs.map(d => ({ action: 'updateObject', body: d })) }),
                        });
                        if (response.ok) {
                            ok += batch.length;
                        } else {
                            fail += batch.length;
                            if (onRecordError) await onRecordError(step.key, `Algolia error: ${response.status}`, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Algolia indexing failed';
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            case 'typesense': {
                const host = cfg.host ?? SERVICE_DEFAULTS.TYPESENSE_URL;
                const apiKey = await this.resolveSecret(ctx, cfg.apiKeySecretCode);
                const collectionName = cfg.collectionName ?? indexName;

                const batches = chunk(input, bulkSize);
                for (const batch of batches) {
                    try {
                        const docs = batch.map(rec => {
                            const doc = prepareDoc(rec);
                            return { ...doc, id: String(getPath(rec, idField) ?? '') };
                        });
                        const ndjson = docs.map(d => JSON.stringify(d)).join('\n');
                        const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
                        if (apiKey) headers['X-TYPESENSE-API-KEY'] = apiKey;

                        const url = `${host}/collections/${collectionName}/documents/import?action=upsert`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers,
                            body: ndjson,
                        });
                        if (response.ok) {
                            ok += batch.length;
                        } else {
                            fail += batch.length;
                            if (onRecordError) await onRecordError(step.key, `Typesense error: ${response.status}`, {});
                        }
                    } catch (e: unknown) {
                        fail += batch.length;
                        const message = e instanceof Error ? e.message : 'Typesense indexing failed';
                        if (onRecordError) await onRecordError(step.key, message, {});
                    }
                }
                break;
            }
            default: {
                // Try custom sinks from registry
                if (adapterCode && this.registry) {
                    const customSink = this.registry.getRuntime('sink', adapterCode) as SinkAdapter<any> | undefined;
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

        const durationMs = Date.now() - startTime;
        this.logger.info(`Sink indexing complete`, {
            stepKey: step.key,
            adapterCode,
            indexName,
            ok,
            fail,
            durationMs,
        });

        return { ok, fail };
    }

    /**
     * Execute a custom sink adapter from the registry
     */
    private async executeCustomSink(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        sink: SinkAdapter<any>,
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
            connections: {
                get: async (code: string) => {
                    const conn = await this.connectionService.getByCode(ctx, code);
                    return conn?.config as any;
                },
                getRequired: async (code: string) => {
                    const conn = await this.connectionService.getByCode(ctx, code);
                    if (!conn) throw new Error(`Connection not found: ${code}`);
                    return conn.config as any;
                },
            },
            logger: {
                info: (msg: string, meta?: any) => this.logger.info(msg, meta),
                warn: (msg: string, meta?: any) => this.logger.warn(msg, meta),
                error: (msg: string, meta?: any) => this.logger.error(msg, undefined, meta),
                debug: (msg: string, meta?: any) => this.logger.debug(msg, meta),
            },
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

    private async resolveSecret(ctx: RequestContext, secretCode?: string): Promise<string | undefined> {
        if (!secretCode) return undefined;
        try {
            const value = await this.secretService.resolve(ctx, secretCode);
            return value ?? undefined;
        } catch {
            return undefined;
        }
    }
}
