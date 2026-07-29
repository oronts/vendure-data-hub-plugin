import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import {
    ExtractorPreviewResult,
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
import {
    ExtractHandler,
    ExtractHandlerContext,
} from './extractors';
import { FileExtractHandler } from './extractors/file-extract.handler';
import { MemoryExtractHandler } from './extractors/memory-extract.handler';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import {
    createInternalExtractorContext,
    createSdkExtractorContext,
    materializeRecords,
    normalizeExecutorRecordLimit,
    normalizeRecordLimit,
} from './extract-execution-context';
import {
    normalizeExtractPreview,
    validateExtractedRecordSchema,
    validateExtractPreviewSchema,
} from './extract-schema-validation';
import {
    assertValidExtractorConfig,
    ExtractorAdapterRunner,
} from './extract-adapter-runner';

@Injectable()
export class ExtractExecutor {
    private readonly logger: DataHubLogger;
    private readonly handlers: Map<string, ExtractHandler>;
    private readonly adapterRunner: ExtractorAdapterRunner;

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
        this.adapterRunner = new ExtractorAdapterRunner({
            secretService: this.secretService,
            connectionService: this.connectionService,
            logger: this.logger,
            handleFailure: (error, adapterCode, stepKey, onRecordError) => (
                this.failExtractor(error, adapterCode, stepKey, onRecordError)
            ),
        });
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
        const normalizedExecutorCtx = normalizeExecutorRecordLimit(executorCtx);

        this.logger.debug(`Executing extract step`, { stepKey: step.key, adapterCode });

        if (normalizedExecutorCtx.recordLimit === 0) {
            return this.completeExecution(
                step,
                adapterCode ?? 'unknown',
                [],
                startTime,
            );
        }
        // Execute inline handlers for Vendure, file, and memory sources.
        const handler = adapterCode ? this.handlers.get(adapterCode) : undefined;
        if (handler) {
            const context: ExtractHandlerContext = {
                ctx,
                step,
                executorCtx: normalizedExecutorCtx,
                onRecordError,
            };
            const result = materializeRecords(
                await handler.extract(context),
                normalizedExecutorCtx,
            );
            return this.completeExecution(
                step,
                adapterCode ?? 'unknown',
                result,
                startTime,
            );
        }

        // Execute registered extractors, including the canonical HTTP and GraphQL implementations.
        if (adapterCode && this.extractorRegistry) {
            const streamingExtractor = this.extractorRegistry.getStreamingExtractor(adapterCode);
            if (streamingExtractor) {
                const result = await this.adapterRunner.executeRegisteredStreaming(
                    streamingExtractor,
                    {
                        ctx,
                        step,
                        executorCtx: normalizedExecutorCtx,
                        onRecordError,
                        pipelineId,
                        runId,
                        sourceRecords,
                    },
                );
                return this.completeExecution(
                    step, adapterCode, result, startTime,
                );
            }

            const batchExtractor = this.extractorRegistry.getBatchExtractor(adapterCode);
            if (batchExtractor) {
                const result = await this.adapterRunner.executeRegisteredBatch(
                    batchExtractor,
                    {
                        ctx,
                        step,
                        executorCtx: normalizedExecutorCtx,
                        onRecordError,
                        pipelineId,
                        runId,
                        sourceRecords,
                    },
                );
                return this.completeExecution(
                    step, adapterCode, result, startTime,
                );
            }
        }

        // Try custom extractors from SDK registry
        if (adapterCode && this.registry) {
            const customExtractor = this.registry.getExtractorRuntime(adapterCode);
            if (customExtractor && 'extract' in customExtractor) {
                const result = await this.adapterRunner.executeSdkStreaming(
                    customExtractor,
                    {
                        ctx,
                        step,
                        executorCtx: normalizedExecutorCtx,
                        onRecordError,
                        pipelineId,
                        runId,
                        sourceRecords,
                    },
                );
                return this.completeExecution(
                    step, adapterCode, result, startTime,
                );
            }
            if (customExtractor && 'extractAll' in customExtractor) {
                const result = await this.adapterRunner.executeSdkBatch(
                    customExtractor,
                    {
                        ctx,
                        step,
                        executorCtx: normalizedExecutorCtx,
                        onRecordError,
                        pipelineId,
                        runId,
                        sourceRecords,
                    },
                );
                return this.completeExecution(
                    step, adapterCode, result, startTime,
                );
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

    async preview(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        limit: number,
        pipelineId?: ID,
        runId?: ID,
        sourceRecords?: readonly JsonObject[],
    ): Promise<ExtractorPreviewResult> {
        const adapterCode = getAdapterCode(step) || undefined;
        const normalizedLimit = normalizeRecordLimit(limit) ?? 0;
        const executorCtx: ExecutorContext = {
            cpData: null,
            cpDirty: false,
            markCheckpointDirty: () => {},
            recordLimit: normalizedLimit,
        };
        const startTime = Date.now();

        const handler = adapterCode ? this.handlers.get(adapterCode) : undefined;
        if (handler) {
            try {
                const context: ExtractHandlerContext = { ctx, step, executorCtx };
                const result = await this.validatePreviewSchema(
                    ctx,
                    step,
                    this.normalizePreviewResult(
                        await handler.preview(context, normalizedLimit),
                        normalizedLimit,
                    ),
                );
                this.logOperationResult(
                    adapterCode ?? 'unknown',
                    result.records.length,
                    startTime,
                    step.key,
                );
                return result;
            } catch (error) {
                return this.failExtractor(error, adapterCode ?? 'unknown', step.key);
            }
        }

        if (adapterCode && this.extractorRegistry) {
            const extractor = this.extractorRegistry.getExtractor(adapterCode);
            if (extractor?.preview) {
                const context = createInternalExtractorContext({
                    ctx,
                    step,
                    executorCtx,
                    pipelineId,
                    runId,
                    sourceRecords,
                    secretService: this.secretService,
                    connectionService: this.connectionService,
                    logger: this.logger,
                });

                try {
                    const validation = await extractor.validate(context, step.config);
                    assertValidExtractorConfig(extractor.code, validation, this.logger);
                    const result = await this.validatePreviewSchema(
                        ctx,
                        step,
                        this.normalizePreviewResult(
                            await extractor.preview(context, step.config, normalizedLimit),
                            normalizedLimit,
                        ),
                    );
                    this.logOperationResult(adapterCode, result.records.length, startTime, step.key);
                    return result;
                } catch (error) {
                    return this.failExtractor(error, extractor.code, step.key);
                }
            }
            if (extractor && 'extractAll' in extractor) {
                return this.failExtractor(
                    new Error(
                        `Batch extractor '${extractor.code}' does not provide bounded preview()`,
                    ),
                    extractor.code,
                    step.key,
                );
            }
        }

        if (adapterCode && this.registry) {
            const extractor = this.registry.getExtractorRuntime(adapterCode);
            if (extractor?.preview) {
                const context = createSdkExtractorContext({
                    ctx,
                    step,
                    executorCtx,
                    pipelineId,
                    secretService: this.secretService,
                    connectionService: this.connectionService,
                    logger: this.logger,
                });

                try {
                    const result = await this.validatePreviewSchema(
                        ctx,
                        step,
                        this.normalizePreviewResult(
                            await extractor.preview(context, step.config, normalizedLimit),
                            normalizedLimit,
                        ),
                    );
                    this.logOperationResult(adapterCode, result.records.length, startTime, step.key);
                    return result;
                } catch (error) {
                    return this.failExtractor(error, extractor.code, step.key);
                }
            }
            if (extractor && 'extractAll' in extractor) {
                return this.failExtractor(
                    new Error(
                        `Batch extractor '${extractor.code}' does not provide bounded preview()`,
                    ),
                    extractor.code,
                    step.key,
                );
            }
        }

        const records = await this.execute(
            ctx,
            step,
            executorCtx,
            undefined,
            pipelineId,
            runId,
            sourceRecords,
        );
        return this.validatePreviewSchema(ctx, step, {
            records: records.map(data => ({ data })),
            totalAvailable: records.length,
        });
    }

    private async validatePreviewSchema(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        result: ExtractorPreviewResult,
    ): Promise<ExtractorPreviewResult> {
        return validateExtractPreviewSchema(ctx, step, result, this.schemaRegistry);
    }

    private normalizePreviewResult(
        result: ExtractorPreviewResult,
        limit: number,
    ): ExtractorPreviewResult {
        return normalizeExtractPreview(result, limit);
    }


    private logOperationResult(adapterCode: string, recordCount: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logExtractorOperation(adapterCode, recordCount, durationMs, { stepKey });
    }

    private async completeExecution(
        step: PipelineStepDefinition,
        adapterCode: string,
        records: RecordObject[],
        startTime: number,
    ): Promise<RecordObject[]> {
        this.logOperationResult(adapterCode, records.length, startTime, step.key);
        return records;
    }

    async validateExtractedRecords(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        return validateExtractedRecordSchema(
            ctx,
            step,
            records,
            this.schemaRegistry,
            this.logger,
            onRecordError,
        );
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
