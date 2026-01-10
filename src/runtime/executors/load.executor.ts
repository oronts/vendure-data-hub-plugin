/**
 * Load Executor - Coordinator for all loader handlers
 *
 * This file coordinates the execution of various loader handlers.
 * The handlers have been split into specialized modules for better maintainability:
 *
 * - product-handler.ts: Product and variant upsert
 * - variant-handler.ts: Variant upsert standalone
 * - customer-handler.ts: Customer upsert with addresses and groups
 * - order-handler.ts: Order note, coupon application, and state transitions
 * - inventory-handler.ts: Stock adjustments
 * - collection-handler.ts: Collection upsert
 * - promotion-handler.ts: Promotion upsert
 * - asset-handler.ts: Asset attachment
 * - rest-handler.ts: REST POST to external endpoints
 */
import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../executor-types';
import {
    ProductHandler,
    VariantHandler,
    CustomerHandler,
    OrderNoteHandler,
    ApplyCouponHandler,
    OrderTransitionHandler,
    StockAdjustHandler,
    CollectionHandler,
    PromotionHandler,
    AssetAttachHandler,
    RestPostHandler,
} from './loaders';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { LoaderAdapter, LoadContext, ChannelStrategy, LanguageStrategy, ValidationMode, ConflictStrategy } from '../../sdk/types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';

@Injectable()
export class LoadExecutor {
    private readonly logger: DataHubLogger;
    private readonly impls: Record<string, (ctx: RequestContext, step: PipelineStepDefinition, input: RecordObject[], onRecordError?: OnRecordErrorCallback, errorHandling?: ErrorHandlingConfig) => Promise<ExecutionResult>>;

    constructor(
        private productHandler: ProductHandler,
        private variantHandler: VariantHandler,
        private customerHandler: CustomerHandler,
        private orderNoteHandler: OrderNoteHandler,
        private applyCouponHandler: ApplyCouponHandler,
        private orderTransitionHandler: OrderTransitionHandler,
        private stockAdjustHandler: StockAdjustHandler,
        private collectionHandler: CollectionHandler,
        private promotionHandler: PromotionHandler,
        private assetAttachHandler: AssetAttachHandler,
        private restPostHandler: RestPostHandler,
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOAD_EXECUTOR);
        this.impls = {
            productUpsert: (ctx, step, input, onErr, err) => this.productHandler.execute(ctx, step, input, onErr, err),
            variantUpsert: (ctx, step, input, onErr, err) => this.variantHandler.execute(ctx, step, input, onErr, err),
            customerUpsert: (ctx, step, input, onErr, err) => this.customerHandler.execute(ctx, step, input, onErr, err),
            orderNote: (ctx, step, input, onErr, err) => this.orderNoteHandler.execute(ctx, step, input, onErr, err),
            stockAdjust: (ctx, step, input, onErr, err) => this.stockAdjustHandler.execute(ctx, step, input, onErr, err),
            applyCoupon: (ctx, step, input, onErr, err) => this.applyCouponHandler.execute(ctx, step, input, onErr, err),
            collectionUpsert: (ctx, step, input, onErr, err) => this.collectionHandler.execute(ctx, step, input, onErr, err),
            promotionUpsert: (ctx, step, input, onErr, err) => this.promotionHandler.execute(ctx, step, input, onErr, err),
            assetAttach: (ctx, step, input, onErr, err) => this.assetAttachHandler.execute(ctx, step, input, onErr, err),
            orderTransition: (ctx, step, input, onErr, err) => this.orderTransitionHandler.execute(ctx, step, input, onErr, err),
            restPost: (ctx, step, input, onErr, err) => this.restPostHandler.execute(ctx, step, input, onErr, err),
        };
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject;
        const adapterCode = (cfg as any)?.adapterCode as string | undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing load step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Try built-in loaders first
        const impl = adapterCode ? this.impls[adapterCode] : undefined;
        if (impl) {
            const result = await impl(ctx, step, input, onRecordError, errorHandling);
            const durationMs = Date.now() - startTime;
            this.logger.logLoaderOperation(adapterCode ?? 'unknown', 'upsert', result.ok, result.fail, durationMs);
            return result;
        }

        // Try custom loaders from registry
        if (adapterCode && this.registry) {
            const customLoader = this.registry.getRuntime('loader', adapterCode) as LoaderAdapter<any> | undefined;
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
        loader: LoaderAdapter<any>,
        pipelineContext?: PipelineContext,
    ): Promise<ExecutionResult> {
        const cfg = step.config as JsonObject;

        // Create load context for the custom loader
        const loadContext: LoadContext = {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            channelStrategy: ((cfg as any)?.channelStrategy as ChannelStrategy) ?? 'inherit',
            channels: [],
            languageStrategy: ((cfg as any)?.languageStrategy as LanguageStrategy) ?? 'fallback',
            validationMode: ((cfg as any)?.validationMode as ValidationMode) ?? 'lenient',
            conflictStrategy: ((cfg as any)?.conflictStrategy as ConflictStrategy) ?? 'source-wins',
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
            const result = await loader.load(loadContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.succeeded,
                fail: result.failed,
            };
        } catch (error) {
            this.logger.error(`Custom loader failed`, error instanceof Error ? error : undefined, {
                adapterCode: loader.code,
                stepKey: step.key,
            });
            return { ok: 0, fail: input.length };
        }
    }

    /**
     * Simulate a loader step for dry-run mode
     */
    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, any>> {
        const code = (step.config as any)?.adapterCode as string | undefined;

        const sim: Record<string, any> = {
            productUpsert: this.productHandler.simulate?.(ctx, step, input),
            variantUpsert: this.variantHandler.simulate?.(ctx, step, input),
            customerUpsert: this.customerHandler.simulate?.(ctx, step, input),
            collectionUpsert: this.collectionHandler.simulate?.(ctx, step, input),
            promotionUpsert: this.promotionHandler.simulate?.(ctx, step, input),
            applyCoupon: this.applyCouponHandler.simulate?.(ctx, step, input),
        };
        return sim[code ?? ''] ?? {};
    }
}
