/**
 * Load Executor - Routes load operations to handler modules.
 *
 * Handler dispatch is driven by LOADER_HANDLER_REGISTRY, so adding a new
 * loader only requires adding an entry there. No changes are needed in this file.
 */
import { Injectable, Optional, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
    ChannelService,
    LanguageCode,
    RequestContext,
    RequestContextService,
} from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { AdapterType, ConflictStrategy, ChannelStrategy as ChannelStrategyEnum, LanguageStrategy, ValidationStrictness } from '../../constants/enums';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../executor-types';
import { LoaderHandler, LoaderSimulationResult } from './loaders/types';
import { LOADER_HANDLER_REGISTRY } from './loaders/loader-handler-registry';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { LoaderAdapter, LoadContext, ChannelStrategy, LanguageStrategyValue, ValidationModeType, ConflictStrategyValue } from '../../sdk/types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { getAdapterCode } from '../../types/step-configs';
import { createBaseAdapterContext } from './context-adapters';
import { toErrorOrUndefined, getErrorMessage } from '../../utils/error.utils';
import { createChannelRequestContext } from '../helpers/channel-request-context';

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

export interface ResolvedLoadAdapterSettings {
    readonly channelStrategy: ChannelStrategy;
    readonly channels: string[];
    readonly languageStrategy: LanguageStrategyValue;
    readonly validationMode: ValidationModeType;
    readonly conflictStrategy: ConflictStrategyValue;
}

export function resolveLoadAdapterSettings(
    ctx: RequestContext,
    config: LoadStepCfg,
    pipelineContext?: PipelineContext,
): ResolvedLoadAdapterSettings {
    const configuredChannelIds = pipelineContext?.channelIds;
    const channels = configuredChannelIds !== undefined
        ? [...configuredChannelIds]
        : ctx.channelId === undefined || ctx.channelId === null
            ? []
            : [String(ctx.channelId)];
    return {
        channelStrategy: config.channelStrategy
            ?? pipelineContext?.channelStrategy
            ?? ChannelStrategyEnum.INHERIT,
        channels,
        languageStrategy: config.languageStrategy ?? LanguageStrategy.FALLBACK,
        validationMode: config.validationMode
            ?? pipelineContext?.validationMode
            ?? ValidationStrictness.STRICT,
        conflictStrategy: config.conflictStrategy ?? ConflictStrategy.SOURCE_WINS,
    };
}

export async function resolveLoaderRequestContext(
    requestContextService: RequestContextService,
    ctx: RequestContext,
    pipelineContext?: PipelineContext,
): Promise<RequestContext> {
    const channel = pipelineContext?.channel ?? ctx.channel;
    const languageCode = pipelineContext?.contentLanguage as LanguageCode | undefined;
    if (
        channel === ctx.channel
        && (languageCode === undefined || languageCode === ctx.languageCode)
    ) {
        return ctx;
    }
    if (!channel) {
        throw new Error('Cannot apply loader context without an active channel');
    }
    return createChannelRequestContext(
        requestContextService,
        ctx,
        channel,
        languageCode,
    );
}

export async function resolveBuiltInLoaderRequestContexts(
    requestContextService: RequestContextService,
    channelService: ChannelService,
    ctx: RequestContext,
    pipelineContext?: PipelineContext,
): Promise<RequestContext[]> {
    const strategy = pipelineContext?.channelStrategy ?? ChannelStrategyEnum.INHERIT;
    if (strategy === ChannelStrategyEnum.INHERIT) {
        return [await resolveLoaderRequestContext(requestContextService, ctx, pipelineContext)];
    }

    const channelIds = pipelineContext?.channelIds ?? [];
    if (channelIds.length === 0) {
        throw new Error(`${strategy} channel strategy requires at least one channel ID`);
    }
    const languageCode = pipelineContext?.contentLanguage as LanguageCode | undefined;
    const channels = await Promise.all(channelIds.map(async channelId => {
        const channel = await channelService.findOne(ctx, channelId);
        if (!channel) throw new Error(`Channel not found: ${channelId}`);
        return channel;
    }));
    return Promise.all(channels.map(channel => createChannelRequestContext(
        requestContextService,
        ctx,
        channel,
        languageCode,
    )));
}

@Injectable()
export class LoadExecutor implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private readonly handlers = new Map<string, LoaderHandler>();

    constructor(
        private moduleRef: ModuleRef,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
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
                    error: getErrorMessage(error),
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
    ): Promise<LoaderExecutionResult> {
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
            const handlerContexts = await resolveBuiltInLoaderRequestContexts(
                this.requestContextService,
                this.channelService,
                ctx,
                pipelineContext,
            );
            const results: LoaderExecutionResult[] = [];
            for (const handlerContext of handlerContexts) {
                results.push(await handler.execute(
                    handlerContext,
                    step,
                    input,
                    onRecordError,
                    errorHandling,
                ));
            }
            const errors = results
                .map(result => result.error)
                .filter((error): error is string => error !== undefined);
            const result: LoaderExecutionResult = {
                ok: results.reduce((sum, current) => sum + current.ok, 0),
                fail: results.reduce((sum, current) => sum + current.fail, 0),
                skipped: results.reduce((sum, current) => sum + current.skipped, 0),
                ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
            };
            const durationMs = Date.now() - startTime;
            this.logger.logLoaderOperation(
                adapterCode ?? 'unknown',
                'upsert',
                result.ok,
                result.fail,
                result.skipped,
                durationMs,
            );
            return result;
        }

        // Try custom loaders from registry
        if (adapterCode && this.registry) {
            const customLoader = this.registry.getRuntime(AdapterType.LOADER, adapterCode) as LoaderAdapter<unknown> | undefined;
            if (customLoader && typeof customLoader.load === 'function') {
                const loaderContext = await resolveLoaderRequestContext(
                    this.requestContextService,
                    ctx,
                    pipelineContext,
                );
                const result = await this.executeCustomLoader(
                    loaderContext,
                    step,
                    input,
                    customLoader,
                    pipelineContext,
                );
                const durationMs = Date.now() - startTime;
                this.logger.logLoaderOperation(
                    adapterCode,
                    'upsert',
                    result.ok,
                    result.fail,
                    result.skipped,
                    durationMs,
                );
                return result;
            }
        }

        this.logger.warn(`Unknown loader adapter`, { adapterCode, stepKey: step.key });
        const durationMs = Date.now() - startTime;
        this.logger.logLoaderOperation(adapterCode ?? 'unknown', 'upsert', 0, input.length, 0, durationMs);
        return { ok: 0, fail: input.length, skipped: 0 };
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
    ): Promise<LoaderExecutionResult> {
        const cfg = step.config as LoadStepCfg;
        const adapterSettings = resolveLoadAdapterSettings(
            ctx,
            cfg,
            pipelineContext,
        );

        const loadContext: LoadContext = {
            ...createBaseAdapterContext(ctx, step.key, this.secretService, this.connectionService, this.logger, pipelineContext),
            ...adapterSettings,
        };

        try {
            const result = await loader.load(loadContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.succeeded,
                fail: result.failed,
                skipped: result.skipped ?? 0,
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            this.logger.error(`Custom loader failed`, toErrorOrUndefined(error), {
                adapterCode: loader.code,
                stepKey: step.key,
                errorMessage,
            });
            return { ok: 0, fail: input.length, skipped: 0, error: errorMessage };
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
        pipelineContext?: PipelineContext,
    ): Promise<LoaderSimulationResult> {
        const code = getAdapterCode(step);
        const handler = this.handlers.get(code);

        if (handler?.simulate) {
            const handlerContexts = await resolveBuiltInLoaderRequestContexts(
                this.requestContextService,
                this.channelService,
                ctx,
                pipelineContext,
            );
            const results: LoaderSimulationResult[] = [];
            for (const handlerContext of handlerContexts) {
                results.push(await handler.simulate(handlerContext, step, input));
            }
            const warnings = results
                .map(result => result.warning)
                .filter((warning): warning is string => warning !== undefined);
            return {
                supported: results.every(result => result.supported),
                recordsIn: results.reduce((sum, result) => sum + result.recordsIn, 0),
                recordDetails: results.flatMap(result => result.recordDetails),
                ...(warnings.length > 0 ? { warning: warnings.join('; ') } : {}),
            };
        }

        return {
            supported: false,
            recordsIn: input.length,
            recordDetails: [],
            warning: code
                ? `Loader "${code}" does not support per-record simulation`
                : 'Load step has no adapter code',
        };
    }
}
