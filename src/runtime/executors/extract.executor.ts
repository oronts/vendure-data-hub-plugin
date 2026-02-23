import { Injectable, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, DataExtractor, BatchDataExtractor, ExtractorContext as InternalExtractorContext } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { FileStorageService } from '../../services/storage/file-storage.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { ID } from '@vendure/core';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../executor-types';
import { LOGGER_CONTEXTS, EXTRACTOR_CODE } from '../../constants/index';
import { AdapterType } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExtractorRegistryService } from '../../extractors/extractor-registry.service';
import { ExtractorAdapter, ExtractContext } from '../../sdk/types';
import { createSecretsAdapter, createConnectionsAdapter, createLoggerAdapter } from './context-adapters';
import {
    ExtractHandler,
    ExtractHandlerContext,
} from './extractors';
import { RestExtractHandler } from './extractors/rest-extract.handler';
import { GraphqlExtractHandler } from './extractors/graphql-extract.handler';
import { VendureExtractHandler } from './extractors/vendure-extract.handler';
import { FileExtractHandler } from './extractors/file-extract.handler';
import { MemoryExtractHandler } from './extractors/memory-extract.handler';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';

@Injectable()
export class ExtractExecutor {
    private readonly logger: DataHubLogger;
    private readonly handlers: Map<string, ExtractHandler>;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private connection: TransactionalConnection,
        private fileStorageService: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
        @Optional() private extractorRegistry?: ExtractorRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);

        // Initialize handlers
        this.handlers = this.initializeHandlers(loggerFactory);
    }

    private initializeHandlers(loggerFactory: DataHubLoggerFactory): Map<string, ExtractHandler> {
        const handlers = new Map<string, ExtractHandler>();

        handlers.set(EXTRACTOR_CODE.HTTP_API, new RestExtractHandler(this.secretService, this.connectionService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.GRAPHQL, new GraphqlExtractHandler(this.secretService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.VENDURE_QUERY, new VendureExtractHandler(this.connection, loggerFactory));
        handlers.set(EXTRACTOR_CODE.CSV, new FileExtractHandler(this.fileStorageService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.JSON, new FileExtractHandler(this.fileStorageService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.XML, new FileExtractHandler(this.fileStorageService, loggerFactory));
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
    ): Promise<RecordObject[]> {
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing extract step`, { stepKey: step.key, adapterCode });

        // Try built-in extractors first
        const handler = adapterCode ? this.handlers.get(adapterCode) : undefined;
        if (handler) {
            const context: ExtractHandlerContext = { ctx, step, executorCtx, onRecordError };
            const result = await handler.extract(context);
            this.logOperationResult(adapterCode ?? 'unknown', result.length, startTime, step.key);
            return result;
        }

        // Try built-in extractors from extractor registry (CDC, DATABASE, S3, FTP, WEBHOOK, etc.)
        if (adapterCode && this.extractorRegistry) {
            const streamingExtractor = this.extractorRegistry.getStreamingExtractor(adapterCode);
            if (streamingExtractor) {
                const result = await this.executeRegistryExtractor(ctx, step, executorCtx, streamingExtractor, onRecordError, pipelineId, runId);
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }

            const batchExtractor = this.extractorRegistry.getBatchExtractor(adapterCode);
            if (batchExtractor) {
                const result = await this.executeRegistryBatchExtractor(ctx, step, executorCtx, batchExtractor, onRecordError, pipelineId, runId);
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }
        }

        // Try custom extractors from SDK registry
        if (adapterCode && this.registry) {
            const customExtractor = this.registry.getRuntime(AdapterType.EXTRACTOR, adapterCode) as ExtractorAdapter<unknown> | undefined;
            if (customExtractor && typeof customExtractor.extract === 'function') {
                const result = await this.executeCustomExtractor(ctx, step, executorCtx, customExtractor, onRecordError, pipelineId);
                this.logOperationResult(adapterCode, result.length, startTime, step.key);
                return result;
            }
        }

        const errorMsg = `Unknown extractor adapter: ${adapterCode ?? '(none)'}`;
        this.logger.warn(errorMsg, { adapterCode, stepKey: step.key });
        if (onRecordError) {
            await onRecordError(step.key, errorMsg, { adapterCode: adapterCode ?? 'unknown' });
        }
        this.logOperationResult(adapterCode ?? 'unknown', 0, startTime, step.key);
        return [];
    }

    private logOperationResult(adapterCode: string, recordCount: number, startTime: number, stepKey: string): void {
        const durationMs = Date.now() - startTime;
        this.logger.logExtractorOperation(adapterCode, recordCount, durationMs, { stepKey });
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
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            await this.handleCustomExtractorError(error, extractor.code, step.key, onRecordError);
        }

        return records;
    }

    private async executeRegistryExtractor(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        extractor: DataExtractor,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractorContext = this.buildExtractorContext(ctx, step, executorCtx, pipelineId, runId);
        const records: RecordObject[] = [];

        try {
            for await (const envelope of extractor.extract(extractorContext, cfg)) {
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            await this.handleCustomExtractorError(error, extractor.code, step.key, onRecordError);
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
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractorContext = this.buildExtractorContext(ctx, step, executorCtx, pipelineId, runId);

        try {
            const result = await extractor.extractAll(extractorContext, cfg);
            return result.records.map(envelope => envelope.data as RecordObject);
        } catch (error) {
            await this.handleCustomExtractorError(error, extractor.code, step.key, onRecordError);
            return [];
        }
    }

    private buildExtractorContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        pipelineId?: ID,
        runId?: ID,
    ): InternalExtractorContext {
        return {
            ctx,
            pipelineId: pipelineId ?? '0',
            runId: runId ?? '0',
            stepKey: step.key,
            checkpoint: { data: executorCtx.cpData?.[step.key] as JsonObject ?? {} },
            logger: createLoggerAdapter(this.logger),
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx) as InternalExtractorContext['connections'],
            dryRun: false,
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

    private async handleCustomExtractorError(
        error: unknown,
        adapterCode: string,
        stepKey: string,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<void> {
        const errorMsg = getErrorMessage(error);
        this.logger.error(`Custom extractor failed: ${errorMsg}`, toErrorOrUndefined(error), {
            adapterCode,
            stepKey,
        });

        if (onRecordError) {
            await onRecordError(stepKey, `Custom extractor failed: ${errorMsg}`, { adapterCode });
        }
    }
}
