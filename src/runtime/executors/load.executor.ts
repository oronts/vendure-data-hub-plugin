/**
 * Load Executor - Routes load operations to handler modules.
 *
 * Handler dispatch is driven by LOADER_HANDLER_REGISTRY, so adding a new
 * loader only requires adding an entry there. No changes are needed in this file.
 */
import { Injectable, Optional, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { AdapterType, ConflictStrategy, ChannelStrategy as ChannelStrategyEnum, LanguageStrategy, ValidationStrictness } from '../../constants/enums';
import { RecordObject, OnRecordErrorCallback, ExecutionResult, SANDBOX_PIPELINE_ID } from '../executor-types';
import { LoaderHandler } from './loaders/types';
import { LOADER_HANDLER_REGISTRY } from './loaders/loader-handler-registry';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { LoaderAdapter, LoadContext, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue } from '../../sdk/types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { getAdapterCode } from '../../types/step-configs';
import { createSecretsAdapter, createConnectionsAdapter, createLoggerAdapter } from './context-adapters';
import { toErrorOrUndefined } from '../../utils/error.utils';

/**
 * Common load step configuration
 */
interface LoadStepCfg {
    adapterCode?: string;
    channelStrategy?: ChannelStrategy;
    languageStrategy?: LanguageStrategyValue;
    validationMode?: ValidationModeType;
    conflictStrategy?: ConflictStrategyValue;
    [key: string]: unknown;
}

@Injectable()
export class LoadExecutor implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private readonly handlers = new Map<string, LoaderHandler>();

    constructor(
        private moduleRef: ModuleRef,
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOAD_EXECUTOR);
    }

    onModuleInit(): void {
        // Resolve all registered handler classes from the DI container
        for (const [code, entry] of LOADER_HANDLER_REGISTRY) {
            try {
                const instance = this.moduleRef.get(entry.handler, { strict: false });
                this.handlers.set(code, instance);
            } catch (error) {
                this.logger.warn(`Failed to resolve loader handler`, {
                    code,
                    handler: entry.handler.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing load step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Try built-in loaders first
        const handler = adapterCode ? this.handlers.get(adapterCode) : undefined;
        if (handler) {
            const result = await handler.execute(ctx, step, input, onRecordError, errorHandling);
            const durationMs = Date.now() - startTime;
            this.logger.logLoaderOperation(adapterCode ?? 'unknown', 'upsert', result.ok, result.fail, durationMs);
            return result;
        }

        // Try custom loaders from registry
        if (adapterCode && this.registry) {
            const customLoader = this.registry.getRuntime(AdapterType.LOADER, adapterCode) as LoaderAdapter<unknown> | undefined;
            if (customLoader && typeof customLoader.load === 'function') {
                const result = await this.executeCustomLoader(ctx, step, input, customLoader, pipelineContext);
                const durationMs = Date.now() - startTime;
                this.logger.logLoaderOperation(adapterCode, 'upsert', result.ok, result.fail, durationMs);
                return result;
            }
        }

        this.logger.warn(`Unknown loader adapter`, { adapterCode, stepKey: step.key });
        const durationMs = Date.now() - startTime;
        this.logger.logLoaderOperation(adapterCode ?? 'unknown', 'upsert', 0, input.length, durationMs);
        return { ok: 0, fail: input.length };
    }

    /**
     * Execute a custom loader adapter from the registry
     */
    private async executeCustomLoader(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        loader: LoaderAdapter<unknown>,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as LoadStepCfg;

        // Create load context for the custom loader
        const loadContext: LoadContext = {
            ctx,
            pipelineId: SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            channelStrategy: cfg.channelStrategy ?? ChannelStrategyEnum.INHERIT,
            channels: [],
            languageStrategy: cfg.languageStrategy ?? LanguageStrategy.FALLBACK,
            validationMode: cfg.validationMode ?? ValidationStrictness.LENIENT,
            conflictStrategy: cfg.conflictStrategy ?? ConflictStrategy.SOURCE_WINS,
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
        };

        try {
            const result = await loader.load(loadContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.succeeded,
                fail: result.failed,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Custom loader failed`, toErrorOrUndefined(error), {
                adapterCode: loader.code,
                stepKey: step.key,
                errorMessage,
            });
            return { ok: 0, fail: input.length, error: errorMessage };
        }
    }

    /**
     * Simulate a loader step for dry-run mode.
     * Delegates to the handler's simulate() method if available.
     */
    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        const code = getAdapterCode(step);
        const handler = this.handlers.get(code);

        if (handler?.simulate) {
            return await handler.simulate(ctx, step, input) ?? {};
        }

        return {};
    }
}
