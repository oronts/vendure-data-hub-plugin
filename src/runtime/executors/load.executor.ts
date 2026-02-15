/**
 * Load Executor - Routes load operations to handler modules:
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
import { LOGGER_CONTEXTS, LOADER_CODE } from '../../constants/index';
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
    AssetImportHandler,
    FacetHandler,
    FacetValueHandler,
    RestPostHandler,
} from './loaders';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { LoaderAdapter, LoadContext, ChannelStrategy, LanguageStrategyValue, ValidationModeValue, ConflictStrategyValue } from '../../sdk/types';
import { ChannelStrategy as ChannelStrategyEnum, LanguageStrategy as LanguageStrategyEnum, ConflictStrategy as ConflictStrategyEnum, ValidationStrictness as ValidationStrictnessEnum } from '../../constants/enums';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { getAdapterCode } from '../../types/step-configs';
import { ConnectionType } from '../../sdk/types/connection-types';

/**
 * Common load step configuration
 */
interface LoadStepCfg {
    adapterCode?: string;
    channelStrategy?: ChannelStrategy;
    languageStrategy?: LanguageStrategyValue;
    validationMode?: ValidationModeValue;
    conflictStrategy?: ConflictStrategyValue;
    [key: string]: unknown;
}

@Injectable()
export class LoadExecutor {
    private readonly logger: DataHubLogger;
    private readonly handlers: Record<string, (ctx: RequestContext, step: PipelineStepDefinition, input: RecordObject[], onRecordError?: OnRecordErrorCallback, errorHandling?: ErrorHandlingConfig) => Promise<ExecutionResult>>;

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
        private assetImportHandler: AssetImportHandler,
        private facetHandler: FacetHandler,
        private facetValueHandler: FacetValueHandler,
        private restPostHandler: RestPostHandler,
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOAD_EXECUTOR);
        this.handlers = {
            [LOADER_CODE.PRODUCT_UPSERT]: (ctx, step, input, onErr, err) => this.productHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.VARIANT_UPSERT]: (ctx, step, input, onErr, err) => this.variantHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.CUSTOMER_UPSERT]: (ctx, step, input, onErr, err) => this.customerHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.ORDER_NOTE]: (ctx, step, input, onErr, err) => this.orderNoteHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.STOCK_ADJUST]: (ctx, step, input, onErr, err) => this.stockAdjustHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.APPLY_COUPON]: (ctx, step, input, onErr, err) => this.applyCouponHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.COLLECTION_UPSERT]: (ctx, step, input, onErr, err) => this.collectionHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.PROMOTION_UPSERT]: (ctx, step, input, onErr, err) => this.promotionHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.ASSET_ATTACH]: (ctx, step, input, onErr, err) => this.assetAttachHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.ASSET_IMPORT]: (ctx, step, input, onErr, err) => this.assetImportHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.FACET_UPSERT]: (ctx, step, input, onErr, err) => this.facetHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.FACET_VALUE_UPSERT]: (ctx, step, input, onErr, err) => this.facetValueHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.ORDER_TRANSITION]: (ctx, step, input, onErr, err) => this.orderTransitionHandler.execute(ctx, step, input, onErr, err),
            [LOADER_CODE.REST_POST]: (ctx, step, input, onErr, err) => this.restPostHandler.execute(ctx, step, input, onErr, err),
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
        const adapterCode = getAdapterCode(step) || undefined;
        const startTime = Date.now();

        this.logger.debug(`Executing load step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Try built-in loaders first
        const handler = adapterCode ? this.handlers[adapterCode] : undefined;
        if (handler) {
            const result = await handler(ctx, step, input, onRecordError, errorHandling);
            const durationMs = Date.now() - startTime;
            this.logger.logLoaderOperation(adapterCode ?? 'unknown', 'upsert', result.ok, result.fail, durationMs);
            return result;
        }

        // Try custom loaders from registry
        if (adapterCode && this.registry) {
            const customLoader = this.registry.getRuntime('LOADER', adapterCode) as LoaderAdapter<unknown> | undefined;
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
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            channelStrategy: cfg.channelStrategy ?? 'INHERIT',
            channels: [],
            languageStrategy: cfg.languageStrategy ?? 'FALLBACK',
            validationMode: cfg.validationMode ?? 'LENIENT',
            conflictStrategy: cfg.conflictStrategy ?? 'SOURCE_WINS',
            secrets: {
                get: async (code: string) => {
                    return await this.secretService.resolve(ctx, code) ?? undefined;
                },
                getRequired: async (code: string) => {
                    const value = await this.secretService.resolve(ctx, code);
                    if (!value) throw new Error(`Secret not found: ${code}`);
                    return value;
                },
            },
            connections: this.createConnectionAdapter(ctx),
            logger: this.createLoggerAdapter(),
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

    private createConnectionAdapter(ctx: RequestContext): LoadContext['connections'] {
        return {
            get: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) return undefined;
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    config: conn.config as JsonObject,
                };
            },
            getRequired: async (code: string) => {
                const conn = await this.connectionService.getByCode(ctx, code);
                if (!conn) throw new Error(`Connection not found: ${code}`);
                return {
                    code: conn.code,
                    type: conn.type as ConnectionType,
                    config: conn.config as JsonObject,
                };
            },
        };
    }

    private createLoggerAdapter(): LoadContext['logger'] {
        return {
            info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta),
            warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta),
            error: (msg: string, meta?: JsonObject) => this.logger.error(msg, undefined, meta),
            debug: (msg: string, meta?: JsonObject) => this.logger.debug(msg, meta),
        };
    }

    /**
     * Simulate a loader step for dry-run mode
     */
    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        const code = getAdapterCode(step);

        const sim: Record<string, unknown> = {
            productUpsert: await this.productHandler.simulate?.(ctx, step, input),
            variantUpsert: await this.variantHandler.simulate?.(ctx, step, input),
            customerUpsert: await this.customerHandler.simulate?.(ctx, step, input),
            collectionUpsert: await this.collectionHandler.simulate?.(ctx, step, input),
            promotionUpsert: await this.promotionHandler.simulate?.(ctx, step, input),
            applyCoupon: await this.applyCouponHandler.simulate?.(ctx, step, input),
        };
        return (sim[code] ?? {}) as Record<string, unknown>;
    }
}
