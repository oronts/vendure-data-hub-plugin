/**
 * Variant upsert loader handler
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    ProductVariantService,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    ProductVariant,
    StockLocationService,
    ApiType,
    Channel,
} from '@vendure/core';
import { Type } from '@vendure/common/lib/shared-types';
import {
    CurrencyCode,
    LanguageCode,
    UpdateProductVariantInput,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition } from '../../../types/index';
import { TRANSFORM_LIMITS } from '../../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import {
    findVariantBySku,
    resolveTaxCategoryId,
    resolveStockLevels,
} from './shared-lookups';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue, getNumberValue, getObjectValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for VariantHandler step
 */
interface VariantHandlerConfig {
    skuField?: string;
    nameField?: string;
    priceField?: string;
    priceByCurrencyField?: string;
    taxCategoryName?: string;
    stockField?: string;
    stockByLocationField?: string;
    channel?: string;
}

/**
 * Type guard to get config as VariantHandlerConfig
 */
function getStepConfig(step: PipelineStepDefinition): VariantHandlerConfig {
    return step.config as unknown as VariantHandlerConfig;
}

/**
 * Check if a variant has channels property loaded (it may not be loaded from the query)
 */
function variantHasChannelsLoaded(variant: ProductVariant): variant is ProductVariant & { channels: Channel[] } {
    return 'channels' in variant && Array.isArray(variant.channels);
}

@Injectable()
export class VariantHandler implements LoaderHandler {
    private readonly logger = new Logger(VariantHandler.name);

    constructor(
        private productVariantService: ProductVariantService,
        private requestContextService: RequestContextService,
        private taxCategoryService: TaxCategoryService,
        private channelService: ChannelService,
        private stockLocationService: StockLocationService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: unknown,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const config = getStepConfig(step);
                const skuKey = config.skuField ?? 'sku';
                const nameKey = config.nameField ?? 'name';
                const priceKey = config.priceField ?? 'price';
                const priceMapKey = config.priceByCurrencyField;
                const taxCategoryName = config.taxCategoryName;
                const stockKey = config.stockField ?? 'stockOnHand';
                const stockLocKey = config.stockByLocationField;

                const sku = getStringValue(rec, skuKey);
                const name = getStringValue(rec, nameKey);

                if (!sku || !name) { fail++; continue; }

                let opCtx = ctx;
                const channelCode = config.channel;
                if (channelCode) {
                    const apiType: ApiType = ctx.apiType;
                    const req = await this.requestContextService.create({
                        apiType,
                        channelOrToken: channelCode
                    });
                    if (req) opCtx = req;
                }

                const existingVariant = await findVariantBySku(this.productVariantService, opCtx, sku);
                const taxCategoryId = await resolveTaxCategoryId(this.taxCategoryService, opCtx, taxCategoryName);

                const stockByLocation = stockLocKey ? getObjectValue(rec, stockLocKey) : undefined;
                const stockLevels = await resolveStockLevels(
                    this.stockLocationService,
                    opCtx,
                    stockByLocation as Record<string, number> | undefined
                );

                let priceMinor: number | undefined;
                let prices: UpdateProductVariantPriceInput[] | undefined;

                const priceMap = priceMapKey ? getObjectValue(rec, priceMapKey) : undefined;
                const priceRaw = rec[priceKey];

                if (priceMap && typeof priceMap === 'object') {
                    prices = Object.entries(priceMap).map(([cc, v]) => ({
                        currencyCode: cc as CurrencyCode,
                        price: Math.round(Number(v) * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER),
                    }));
                } else if (priceRaw != null) {
                    const priceValue = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
                    if (!Number.isNaN(priceValue)) priceMinor = Math.round(priceValue * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
                }

                if (existingVariant) {
                    const update: UpdateProductVariantInput = {
                        id: String(existingVariant.id),
                        translations: [{ languageCode: opCtx.languageCode as LanguageCode, name }],
                    };

                    if (prices && prices.length > 0) {
                        update.prices = prices;
                    }

                    if (typeof priceMinor === 'number') {
                        update.price = priceMinor;
                    }

                    const stockOnHand = getNumberValue(rec, stockKey);
                    if (typeof stockOnHand === 'number') {
                        update.stockOnHand = Math.max(0, Math.floor(stockOnHand));
                    }

                    if (stockLevels && stockLevels.length > 0) {
                        update.stockLevels = stockLevels;
                    }

                    if (taxCategoryId) {
                        update.taxCategoryId = taxCategoryId;
                    }

                    const [updated] = await this.productVariantService.update(opCtx, [update]);

                    if (channelCode) {
                        try {
                            const alreadyIn = variantHasChannelsLoaded(existingVariant) &&
                                existingVariant.channels.some(c => c.id === opCtx.channelId);
                            if (!alreadyIn) {
                                await this.channelService.assignToChannels<ProductVariant>(
                                    opCtx,
                                    ProductVariant as Type<ProductVariant>,
                                    updated.id,
                                    [opCtx.channelId]
                                );
                            }
                        } catch (error) {
                            this.logger.warn(`Failed to assign variant ${updated.id} to channel: ${getErrorMessage(error)}`);
                        }
                    }
                } else {
                    // Need a productId to create a variant; best-effort: try to find product by slug/name
                    // Here we skip creation without product context
                    fail++;
                    continue;
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'variantUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, number>> {
        let exists = 0, missing = 0;
        for (const rec of input) {
            const config = getStepConfig(step);
            const skuKey = config.skuField ?? 'sku';
            const sku = getStringValue(rec, skuKey);
            if (!sku) continue;
            const variant = await findVariantBySku(this.productVariantService, ctx, sku);
            if (variant) exists++; else missing++;
        }
        return { exists, missing };
    }
}
