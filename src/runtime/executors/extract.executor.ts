import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import {
    BatchDataExtractor,
    DataExtractor,
    ExtractorContext as InternalExtractorContext,
    ExtractorValidationResult,
    JsonObject,
    PipelineStepDefinition,
} from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { FileStorageService } from '../../services/storage/file-storage.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { FileParserService } from '../../parsers/file-parser.service';
import { ID } from '@vendure/core';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../executor-types';
import { LOGGER_CONTEXTS, EXTRACTOR_CODE } from '../../constants/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExtractorRegistryService } from '../../extractors/extractor-registry.service';
import { BatchExtractorAdapter, ExtractorAdapter, ExtractContext } from '../../sdk/types';
import { createSecretsAdapter, createConnectionsAdapter, createLoggerAdapter } from './context-adapters';
import {
    ExtractHandler,
    ExtractHandlerContext,
} from './extractors';
import { FileExtractHandler } from './extractors/file-extract.handler';
import { MemoryExtractHandler } from './extractors/memory-extract.handler';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import { formatSchemaValidationIssues } from '../../services/schema/schema-definition';

@Injectable()
export class ExtractExecutor {
    private readonly logger: DataHubLogger;
    private readonly handlers: Map<string, ExtractHandler>;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private fileStorageService: FileStorageService,
        private fileParserService: FileParserService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
        @Optional() private extractorRegistry?: ExtractorRegistryService,
        @Optional() private schemaRegistry?: SchemaRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);

        this.handlers = this.initializeHandlers(loggerFactory);
    }

    private initializeHandlers(loggerFactory: DataHubLoggerFactory): Map<string, ExtractHandler> {
        const handlers = new Map<string, ExtractHandler>();

        const fileHandler = new FileExtractHandler(this.fileStorageService, loggerFactory, this.fileParserService);
        handlers.set(EXTRACTOR_CODE.CSV, fileHandler);
        handlers.set(EXTRACTOR_CODE.JSON, fileHandler);
        handlers.set(EXTRACTOR_CODE.XML, fileHandler);
        handlers.set(EXTRACTOR_CODE.XLSX, fileHandler);
        handlers.set(EXTRACTOR_CODE.IN_MEMORY, new MemoryExtractHandler(loggerFactory));
        handlers.set(EXTRACTOR_CODE.GENERATOR, new MemoryExtractHandler(loggerFactory));

        return handlers;
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
        sourceRecords?: readonly JsonObject[],
    ): Promise<RecordObject[]> {
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing extract step`, { stepKey: step.key, adapterCode });

        if (executorCtx.recordLimit !== undefined && executorCtx.recordLimit <= 0) {
            return [];
        }
        // Execute inline handlers for Vendure, file, and memory sources.
        const handler = adapterCode ? this.handlers.get(adapterCode) : undefined;
        if (handler) {
            const context: ExtractHandlerContext = { ctx, step, executorCtx, onRecordError };
            const result = this.limitRecords(await handler.extract(context), executorCtx);
            this.logOperationResult(adapterCode ?? 'unknown', result.length, startTime, step.key);
            return result;
        }

        // Execute registered extractors, including the canonical HTTP and GraphQL implementations.
        if (adapterCode && this.extractorRegistry) {
            const streamingExtractor = this.extractorRegistry.getStreamingExtractor(adapterCode);
            if (streamingExtractor) {
                const result = await this.executeRegistryExtractor(
                    ctx, step, executorCtx, streamingExtractor, onRecordError, pipelineId, runId, sourceRecords,
                );
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }

            const batchExtractor = this.extractorRegistry.getBatchExtractor(adapterCode);
            if (batchExtractor) {
                const result = await this.executeRegistryBatchExtractor(
                    ctx, step, executorCtx, batchExtractor, onRecordError, pipelineId, runId, sourceRecords,
                );
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }
        }

        // Try custom extractors from SDK registry
        if (adapterCode && this.registry) {
            const customExtractor = this.registry.getExtractorRuntime(adapterCode);
            if (customExtractor && 'extract' in customExtractor) {
                const result = await this.executeCustomExtractor(
                    ctx,
                    step,
                    executorCtx,
                    customExtractor,
                    onRecordError,
                    pipelineId,
                );
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }
            if (customExtractor && 'extractAll' in customExtractor) {
                const result = await this.executeCustomBatchExtractor(
                    ctx,
                    step,
                    executorCtx,
                    customExtractor,
                    onRecordError,
                    pipelineId,
                );
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }
        }

        const error = new Error(`Unknown extractor adapter: ${adapterCode ?? '(none)'}`);
        return this.failExtractor(
            error,
            adapterCode ?? 'unknown',
            step.key,
            onRecordError,
        );
    }

    private limitRecords(records: RecordObject[], executorCtx: ExecutorContext): RecordObject[] {
        if (executorCtx.recordLimit === undefined) return records;
        return records.slice(0, Math.max(0, Math.floor(executorCtx.recordLimit)));
    }

    private hasReachedRecordLimit(records: RecordObject[], executorCtx: ExecutorContext): boolean {
        return executorCtx.recordLimit !== undefined && records.length >= executorCtx.recordLimit;
    }

    private logOperationResult(adapterCode: string, recordCount: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logExtractorOperation(adapterCode, recordCount, durationMs, { stepKey });
    }

    async validateExtractedRecords(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        if (!step.schemaRef) return records;
        if (!this.schemaRegistry) {
            throw new Error('Schema registry is unavailable for extract step');
        }
        const validation = await this.schemaRegistry.validateRecords(
            ctx,
            step.schemaRef,
            records,
        );
        const invalid = validation.records.filter(item => item.issues.length > 0);
        if (validation.schema.compatibility === 'PERMISSIVE') {
            if (invalid.length > 0) {
                this.logger.warn('Permissive schema validation accepted mismatched records', {
                    stepKey: step.key,
                    schemaId: validation.schema.schemaId,
                    schemaVersion: validation.schema.version,
                    recordCount: invalid.length,
                });
            }
            return records;
        }
        if (invalid.length > 0 && !onRecordError) {
            throw new Error(
                `Schema ${validation.schema.schemaId}@${validation.schema.version}: ${formatSchemaValidationIssues(invalid[0].issues)}`,
            );
        }
        const accepted: RecordObject[] = [];
        for (const item of validation.records) {
            if (item.issues.length === 0) {
                accepted.push(item.record);
                continue;
            }
            await onRecordError?.(
                step.key,
                `Schema ${validation.schema.schemaId}@${validation.schema.version}: ${formatSchemaValidationIssues(item.issues)}`,
                item.record,
            );
        }
        return accepted;
    }

    private async executeCustomExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: ExtractorAdapter<unknown>,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractContext = this.buildExtractContext(ctx, step, executorCtx, cfg, pipelineId);
        const records: RecordObject[] = [];

        try {
            for await (const envelope of extractor.extract(extractContext, cfg)) {
                if (this.hasReachedRecordLimit(records, executorCtx)) break;
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            return this.failExtractor(error, extractor.code, step.key, onRecordError);
        }

        return records;
    }

    private async executeCustomBatchExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: BatchExtractorAdapter<unknown>,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractContext = this.buildExtractContext(
            ctx,
            step,
            executorCtx,
            cfg,
            pipelineId,
        );

        try {
            const result = await extractor.extractAll(extractContext, cfg);
            const records = result.records.map(envelope => envelope.data as RecordObject);
            return this.limitRecords(records, executorCtx);
        } catch (error) {
            return this.failExtractor(error, extractor.code, step.key, onRecordError);
        }
    }

    private async executeRegistryExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: DataExtractor,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
        sourceRecords?: readonly JsonObject[],
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractorContext = this.buildExtractorContext(ctx, step, executorCtx, pipelineId, runId, sourceRecords);
        const records: RecordObject[] = [];

        try {
            const validation = await extractor.validate(extractorContext, cfg);
            this.assertValidExtractorConfig(extractor.code, validation);
            for await (const envelope of extractor.extract(extractorContext, cfg)) {
                if (this.hasReachedRecordLimit(records, executorCtx)) break;
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            return this.failExtractor(error, extractor.code, step.key, onRecordError);
        }

        return records;
    }

    private async executeRegistryBatchExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: BatchDataExtractor,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
        sourceRecords?: readonly JsonObject[],
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractorContext = this.buildExtractorContext(ctx, step, executorCtx, pipelineId, runId, sourceRecords);

        try {
            const validation = await extractor.validate(extractorContext, cfg);
            this.assertValidExtractorConfig(extractor.code, validation);
            const result = await extractor.extractAll(extractorContext, cfg);
            const records = result.records.map(envelope => envelope.data as RecordObject);
            return this.limitRecords(records, executorCtx);
        } catch (error) {
            return this.failExtractor(error, extractor.code, step.key, onRecordError);
        }
    }

    private assertValidExtractorConfig(
        adapterCode: string,
        validation: ExtractorValidationResult,
    ): void {
        if (validation.warnings?.length) {
            this.logger.warn('Extractor configuration validation warnings', {
                adapterCode,
                warnings: validation.warnings,
            });
        }
        if (validation.valid) {
            return;
        }

        const errors = validation.errors
            .map(error => `${error.field}: ${error.message}`)
            .join('; ');
        throw new Error(
            `Invalid configuration for extractor "${adapterCode}": ${errors || 'unknown validation error'}`,
        );
    }

    private buildExtractorContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        pipelineId?: ID,
        runId?: ID,
        sourceRecords?: readonly JsonObject[],
    ): InternalExtractorContext {
        return {
            ctx,
            pipelineId: pipelineId ?? '0',
            runId: runId ?? '0',
            stepKey: step.key,
            checkpoint: { data: executorCtx.cpData?.[step.key] as JsonObject ?? {} },
            sourceRecords,
            logger: createLoggerAdapter(this.logger),
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx) as InternalExtractorContext['connections'],
            dryRun: executorCtx.recordLimit !== undefined,
            setCheckpoint: (data: JsonObject) => this.handleCheckpointUpdate(executorCtx, step.key, data),
            isCancelled: executorCtx.onCancelRequested ?? (async () => false),
        };
    }

    private buildExtractContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        _cfg: JsonObject,
        pipelineId?: ID,
    ): ExtractContext {
        return {
            ctx,
            pipelineId: pipelineId ?? '0',
            stepKey: step.key,
            checkpoint: executorCtx.cpData?.[step.key] ?? {},
            logger: createLoggerAdapter(this.logger),
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            setCheckpoint: (data: JsonObject) => this.handleCheckpointUpdate(executorCtx, step.key, data),
        };
    }

    private handleCheckpointUpdate(executorCtx: ExecutorContext, stepKey: string, data: JsonObject): void {
        if (executorCtx.cpData) {
            executorCtx.cpData[stepKey] = data;
            executorCtx.markCheckpointDirty();
        }
    }

    private async failExtractor(
        error: unknown,
        adapterCode: string,
        stepKey: string,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<never> {
        const errorMessage = getErrorMessage(error);
        const message = `Extractor failed: ${errorMessage}`;
        this.logger.error(message, toErrorOrUndefined(error), {
            adapterCode,
            stepKey,
        });

        if (onRecordError) {
            try {
                await onRecordError(stepKey, message, { adapterCode });
            } catch (callbackError) {
                this.logger.warn('Failed to record extractor error', {
                    adapterCode,
                    stepKey,
                    error: getErrorMessage(callbackError),
                });
            }
        }

        throw error instanceof Error ? error : new Error(errorMessage);
    }
}
