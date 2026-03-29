import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import { getPath } from '../utils';
import { applyLocalization, resolveIndexName } from '../executor-helpers';
import { BATCH, LOGGER_CONTEXTS, SINK } from '../../constants/index';
import { CircuitState, AdapterType } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { SinkAdapter, SinkContext } from '../../sdk/types';
import { getAdapterCode } from '../../types/step-configs';
import { createBaseAdapterContext, handleCustomAdapterError } from './context-adapters';
import { CircuitBreakerService } from '../../services/runtime';
import { SINK_HANDLER_REGISTRY, SinkHandlerContext, SinkServices } from './sink-handler-registry';

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
    defaultOperation?: string;
}

@Injectable()
export class SinkExecutor {
    private readonly logger: DataHubLogger;
    private readonly services: SinkServices;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private circuitBreaker: CircuitBreakerService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SINK_EXECUTOR);
        this.services = {
            secretService: this.secretService,
            connectionService: this.connectionService,
            circuitBreaker: this.circuitBreaker,
            logger: this.logger,
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
        const bulkSize = Number((cfg as Record<string, unknown>).batchSize ?? cfg.bulkSize ?? BATCH.BULK_SIZE) || BATCH.BULK_SIZE;

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

        // Apply localization (translation flattening + channel filtering)
        const languageCode = (cfg as Record<string, unknown>).languageCode as string | undefined;
        const translationsField = (cfg as Record<string, unknown>).translationsField as string | undefined;
        const channelCode = (cfg as Record<string, unknown>).channelCode as string | undefined;
        const channelField = (cfg as Record<string, unknown>).channelField as string | undefined;

        const localizedInput = applyLocalization(input, { languageCode, translationsField, channelCode, channelField });
        const resolvedIndexName = resolveIndexName(indexName, languageCode);

        const defaultOp = cfg.defaultOperation ?? 'UPSERT';
        const upsertRecords: RecordObject[] = [];
        const deleteRecords: RecordObject[] = [];
        for (const rec of localizedInput) {
            const op = String(rec.__operation ?? defaultOp).toUpperCase();
            const { __operation: _op, ...cleanRec } = rec; // eslint-disable-line @typescript-eslint/no-unused-vars
            if (op === 'DELETE') {
                deleteRecords.push(cleanRec);
            } else {
                upsertRecords.push(cleanRec);
            }
        }

        // Try built-in handlers first
        const entry = adapterCode ? SINK_HANDLER_REGISTRY.get(adapterCode) : undefined;
        if (entry) {
            if (upsertRecords.length > 0) {
                const handlerCtx: SinkHandlerContext = {
                    ctx, step, input: upsertRecords, cfg, indexName: resolvedIndexName, idField, bulkSize, prepareDoc, onRecordError, operation: 'UPSERT',
                };
                const result = await entry.handler(handlerCtx, this.services);
                ok += result.ok;
                fail += result.fail;
            }
            if (deleteRecords.length > 0) {
                if (entry.deleteHandler) {
                    const ids = deleteRecords.map(r => String(getPath(r, idField) ?? ''));
                    const handlerCtx: SinkHandlerContext = {
                        ctx, step, input: deleteRecords, cfg, indexName: resolvedIndexName, idField, bulkSize, prepareDoc, onRecordError, operation: 'DELETE',
                    };
                    const result = await entry.deleteHandler(handlerCtx, this.services, ids);
                    ok += result.ok;
                    fail += result.fail;
                } else {
                    this.logger.warn(`Sink "${adapterCode}" does not support DELETE`, { stepKey: step.key, count: deleteRecords.length });
                    fail += deleteRecords.length;
                }
            }
        } else {
            // Try custom sinks from registry
            if (adapterCode && this.registry) {
                const customSink = this.registry.getRuntime(AdapterType.SINK, adapterCode) as SinkAdapter<JsonObject> | undefined;
                if (customSink && typeof customSink.index === 'function') {
                    if (upsertRecords.length > 0) {
                        const result = await this.executeCustomSink(ctx, step, upsertRecords, customSink, pipelineContext);
                        ok += result.ok;
                        fail += result.fail;
                    }
                    if (deleteRecords.length > 0) {
                        if (typeof customSink.delete === 'function') {
                            const ids = deleteRecords.map(r => String(getPath(r, idField) ?? ''));
                            const result = await this.executeCustomSinkDelete(ctx, step, ids, customSink, pipelineContext);
                            ok += result.ok;
                            fail += result.fail;
                        } else {
                            this.logger.warn(`Custom sink "${adapterCode}" does not support DELETE`, { stepKey: step.key, count: deleteRecords.length });
                            fail += deleteRecords.length;
                        }
                    }
                } else {
                    this.logger.warn(`Unknown sink adapter`, { stepKey: step.key, adapterCode });
                    fail += localizedInput.length;
                }
            } else {
                this.logger.warn(`Unknown sink adapter`, { stepKey: step.key, adapterCode });
                fail += localizedInput.length;
            }
        }

        const opLabel = deleteRecords.length > 0 && upsertRecords.length > 0 ? 'index+delete'
            : deleteRecords.length > 0 ? 'delete' : 'index';
        this.logOperationResult(adapterCode ?? 'unknown', opLabel, ok, fail, startTime, step.key);

        return { ok, fail };
    }

    // ─── Utility methods ───────────────────────────────────────────────

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
            ...createBaseAdapterContext(ctx, step.key, this.secretService, this.connectionService, this.logger, pipelineContext),
        };

        try {
            const result = await sink.index(sinkContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.indexed,
                fail: result.failed,
            };
        } catch (error) {
            return handleCustomAdapterError(error, this.logger, 'Custom sink', sink.code, step.key, input.length);
        }
    }

    private async executeCustomSinkDelete(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        ids: string[],
        sink: SinkAdapter<JsonObject>,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject;
        const sinkContext: SinkContext = {
            ...createBaseAdapterContext(ctx, step.key, this.secretService, this.connectionService, this.logger, pipelineContext),
        };

        try {
            const result = await sink.delete!(sinkContext, cfg, ids);
            return {
                ok: result.deleted,
                fail: result.failed,
            };
        } catch (error) {
            return handleCustomAdapterError(error, this.logger, 'Custom sink delete', sink.code, step.key, ids.length);
        }
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
