import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import { getPath } from '../utils';
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
        const bulkSize = Number(cfg.bulkSize ?? BATCH.BULK_SIZE) || BATCH.BULK_SIZE;

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

        const handlerCtx: SinkHandlerContext = {
            ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError,
        };

        // Try built-in handlers first
        const entry = adapterCode ? SINK_HANDLER_REGISTRY.get(adapterCode) : undefined;
        if (entry) {
            const result = await entry.handler(handlerCtx, this.services);
            ok = result.ok;
            fail = result.fail;
        } else {
            // Try custom sinks from registry
            if (adapterCode && this.registry) {
                const customSink = this.registry.getRuntime(AdapterType.SINK, adapterCode) as SinkAdapter<JsonObject> | undefined;
                if (customSink && typeof customSink.index === 'function') {
                    const result = await this.executeCustomSink(ctx, step, input, customSink, pipelineContext);
                    ok = result.ok;
                    fail = result.fail;
                } else {
                    this.logger.warn(`Unknown sink adapter`, { stepKey: step.key, adapterCode });
                    ok = input.length;
                }
            } else {
                this.logger.warn(`Unknown sink adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
            }
        }

        this.logOperationResult(adapterCode ?? 'unknown', 'index', ok, fail, startTime, step.key);

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
