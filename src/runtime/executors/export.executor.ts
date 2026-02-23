import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonValue, JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, ExecutorContext, SANDBOX_PIPELINE_ID } from '../executor-types';
import { getPath, setPath, deepClone } from '../utils';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { AdapterType } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExporterAdapter, ExportContext } from '../../sdk/types';
import { createSecretsAdapter, createConnectionsAdapter, createLoggerAdapter, handleCustomAdapterError } from './context-adapters';
import { getAdapterCode } from '../../types/step-configs';
import { EXPORT_HANDLER_REGISTRY } from './exporters/export-handler-registry';

/**
 * Common export configuration fields
 */
interface BaseExportCfg {
    adapterCode?: string;
    fields?: string[];
    excludeFields?: string[];
    fieldMapping?: Record<string, string>;
    /** Output file path (canonical field name) */
    path?: string;
}

@Injectable()
export class ExportExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXPORT_EXECUTOR);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        executorCtx?: ExecutorContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as BaseExportCfg;
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;

        this.logger.debug(`Executing export step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Apply field selection/mapping
        const fields = cfg.fields;
        const excludeFields = cfg.excludeFields;
        const fieldMapping = cfg.fieldMapping;

        const prepareRecord = (rec: RecordObject): RecordObject => {
            let result: RecordObject = rec;
            if (fields && fields.length > 0) {
                const picked: RecordObject = {};
                for (const f of fields) {
                    const val = getPath(rec, f);
                    if (val !== undefined) setPath(picked, f, val);
                }
                result = picked;
            } else if (excludeFields && excludeFields.length > 0) {
                result = deepClone(rec);
                for (const f of excludeFields) {
                    delete result[f];
                }
            }
            if (fieldMapping) {
                const mapped: RecordObject = {};
                for (const [from, to] of Object.entries(fieldMapping)) {
                    const val = getPath(result, from);
                    if (val !== undefined) setPath(mapped, to, val);
                }
                result = { ...result, ...mapped };
            }
            return result;
        };

        const preparedRecords = input.map(prepareRecord);

        // Try built-in handlers first
        const entry = adapterCode ? EXPORT_HANDLER_REGISTRY.get(adapterCode) : undefined;
        if (entry) {
            const result = await entry.handler({
                ctx,
                stepKey: step.key,
                config: step.config as Record<string, JsonValue>,
                records: preparedRecords,
                onRecordError,
                secretService: this.secretService,
                logger: this.logger,
            });
            ok = result.ok;
            fail = result.fail;
        } else if (adapterCode && this.registry) {
            // Try custom exporters from registry
            const customExporter = this.registry.getRuntime(AdapterType.EXPORTER, adapterCode) as ExporterAdapter<unknown> | undefined;
            if (customExporter && typeof customExporter.export === 'function') {
                const result = await this.executeCustomExporter(ctx, step, preparedRecords, customExporter, pipelineContext, executorCtx);
                ok = result.ok;
                fail = result.fail;
            } else {
                // Unknown adapter - treat as no-op success
                this.logger.warn(`Unknown export adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
            }
        } else {
            // Unknown adapter - treat as no-op success
            this.logger.warn(`Unknown export adapter`, { stepKey: step.key, adapterCode });
            ok = input.length;
        }

        this.logOperationResult(adapterCode ?? 'unknown', 'export', ok, fail, startTime, step.key);

        return { ok, fail };
    }

    private logOperationResult(adapterCode: string, operation: string, ok: number, fail: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logExporterOperation(adapterCode, operation, ok, fail, durationMs, { stepKey });
    }

    /**
     * Execute a custom exporter adapter from the registry
     */
    private async executeCustomExporter(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        exporter: ExporterAdapter<unknown>,
        pipelineContext?: PipelineContext,
        executorCtx?: ExecutorContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject & { incremental?: boolean };

        const exportContext: ExportContext = {
            ctx,
            pipelineId: SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
            incremental: cfg?.incremental ?? false,
            checkpoint: executorCtx?.cpData?.[step.key] ?? {},
            setCheckpoint: (data: JsonObject) => {
                if (executorCtx?.cpData) {
                    executorCtx.cpData[step.key] = data;
                    executorCtx.markCheckpointDirty();
                }
            },
        };

        try {
            const result = await exporter.export(exportContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.succeeded,
                fail: result.failed,
            };
        } catch (error) {
            return handleCustomAdapterError(error, this.logger, 'Custom exporter', exporter.code, step.key, input.length);
        }
    }
}
