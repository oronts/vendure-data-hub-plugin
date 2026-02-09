import { Injectable, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { JsonObject, PipelineStepDefinition } from '../../types/index';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { FileStorageService } from '../../services/storage/file-storage.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../executor-types';
import { LOGGER_CONTEXTS, EXTRACTOR_CODE } from '../../constants/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ExtractorAdapter, ExtractContext, ConnectionResolver, ConnectionConfig, ConnectionType } from '../../sdk/types';
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
import { getErrorMessage } from '../../utils/error.utils';

type ExtractImpl = (ctx: RequestContext, step: PipelineStepDefinition, executorCtx: ExecutorContext, onRecordError?: OnRecordErrorCallback) => Promise<RecordObject[]>;

@Injectable()
export class ExtractExecutor {
    private readonly logger: DataHubLogger;
    private readonly handlers: Map<string, ExtractHandler>;
    private readonly handlerFunctions: Record<string, ExtractImpl>;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        private connection: TransactionalConnection,
        private fileStorageService: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);

        // Initialize handlers
        this.handlers = this.initializeHandlers(loggerFactory);

        // Map adapter codes to handler execution
        this.handlerFunctions = this.buildImplMap();
    }

    private initializeHandlers(loggerFactory: DataHubLoggerFactory): Map<string, ExtractHandler> {
        const handlers = new Map<string, ExtractHandler>();

        handlers.set(EXTRACTOR_CODE.HTTP_API, new RestExtractHandler(this.secretService, this.connectionService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.GRAPHQL, new GraphqlExtractHandler(this.secretService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.VENDURE_QUERY, new VendureExtractHandler(this.connection, loggerFactory));
        handlers.set(EXTRACTOR_CODE.CSV, new FileExtractHandler(this.fileStorageService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.JSON, new FileExtractHandler(this.fileStorageService, loggerFactory));
        handlers.set(EXTRACTOR_CODE.IN_MEMORY, new MemoryExtractHandler(loggerFactory));
        handlers.set(EXTRACTOR_CODE.GENERATOR, new MemoryExtractHandler(loggerFactory));

        return handlers;
    }

    private buildImplMap(): Record<string, ExtractImpl> {
        return {
            [EXTRACTOR_CODE.HTTP_API]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.HTTP_API, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.CSV]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.CSV, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.JSON]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.JSON, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.GRAPHQL]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.GRAPHQL, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.VENDURE_QUERY]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.VENDURE_QUERY, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.IN_MEMORY]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.IN_MEMORY, ctx, step, ex, onErr),
            [EXTRACTOR_CODE.GENERATOR]: (ctx, step, ex, onErr) => this.executeHandler(EXTRACTOR_CODE.GENERATOR, ctx, step, ex, onErr),
        };
    }

    private async executeHandler(
        adapterCode: string,
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const handler = this.handlers.get(adapterCode);
        if (!handler) {
            this.logger.warn(`No handler found for adapter: ${adapterCode}`, { adapterCode, stepKey: step.key });
            return [];
        }

        const context: ExtractHandlerContext = {
            ctx,
            step,
            executorCtx,
            onRecordError,
        };

        return handler.extract(context);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing extract step`, { stepKey: step.key, adapterCode });

        // Try built-in extractors first
        const handler = adapterCode ? this.handlerFunctions[adapterCode] : undefined;
        if (handler) {
            const result = await handler(ctx, step, executorCtx, onRecordError);
            this.logOperationResult(adapterCode ?? 'unknown', result.length, startTime, step.key);
            return result;
        }

        // Try custom extractors from registry
        if (adapterCode && this.registry) {
            const customExtractor = this.registry.getRuntime('EXTRACTOR', adapterCode) as ExtractorAdapter<unknown> | undefined;
            if (customExtractor && typeof customExtractor.extract === 'function') {
                const result = await this.executeCustomExtractor(ctx, step, executorCtx, customExtractor, onRecordError);
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
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const extractContext = this.buildExtractContext(ctx, step, executorCtx, cfg);
        const records: RecordObject[] = [];

        try {
            for await (const envelope of extractor.extract(extractContext, cfg)) {
                records.push(envelope.data as RecordObject);
            }
        } catch (error) {
            this.handleCustomExtractorError(error, extractor.code, step.key, onRecordError);
        }

        return records;
    }

    private buildExtractContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        executorCtx: ExecutorContext,
        _cfg: JsonObject,
    ): ExtractContext {
        return {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            checkpoint: executorCtx.cpData?.[step.key] ?? {},
            logger: this.createLoggerAdapter(),
            secrets: this.createSecretsAdapter(ctx),
            connections: this.createConnectionsAdapter(ctx),
            setCheckpoint: (data: JsonObject) => this.handleCheckpointUpdate(executorCtx, step.key, data),
        };
    }

    private createLoggerAdapter() {
        return {
            info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta),
            warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta),
            error: (msg: string, errorOrMeta?: JsonObject | Error, meta?: JsonObject) => {
                if (errorOrMeta instanceof Error) {
                    this.logger.error(msg, errorOrMeta, meta);
                } else {
                    this.logger.error(msg, undefined, errorOrMeta);
                }
            },
            debug: (msg: string, meta?: JsonObject) => this.logger.debug(msg, meta),
        };
    }

    private createSecretsAdapter(ctx: RequestContext) {
        return {
            get: async (code: string) => {
                const secret = await this.secretService.getByCode(ctx, code);
                return secret?.value ?? undefined;
            },
            getRequired: async (code: string) => {
                const secret = await this.secretService.getByCode(ctx, code);
                if (!secret?.value) throw new Error(`Secret not found: ${code}`);
                return secret.value;
            },
        };
    }

    private createConnectionsAdapter(ctx: RequestContext): ConnectionResolver {
        return {
            get: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) return undefined;
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    ...conn.config,
                } as ConnectionConfig;
            },
            getRequired: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) throw new Error(`Connection not found: ${code}`);
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    ...conn.config,
                } as ConnectionConfig;
            },
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
        this.logger.error(`Custom extractor failed: ${errorMsg}`, error instanceof Error ? error : undefined, {
            adapterCode,
            stepKey,
        });

        if (onRecordError) {
            await onRecordError(stepKey, `Custom extractor failed: ${errorMsg}`, { adapterCode });
        }
    }
}
