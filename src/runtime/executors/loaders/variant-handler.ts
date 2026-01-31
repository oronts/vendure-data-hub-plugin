/**
 * Variant upsert loader handler
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    ProductVariantService,
    ListQueryOptions,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    ProductVariant,
    StockLocationService,
    ApiType,
    TaxCategory,
    Channel,
    StockLocation,
} from '@vendure/core';
import { ID, Type } from '@vendure/common/lib/shared-types';
import {
    StockLevelInput,
    CurrencyCode,
    LanguageCode,
    UpdateProductVariantInput,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, JsonValue } from '../../../types/index';
import { TRANSFORM_LIMITS } from '../../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../services/logger/error-utils';

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
 * Type guard to safely extract a string value from a record
 */
function getRecordString(rec: RecordObject, field: string): string | undefined {
    const value = rec[field];
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
}

/**
 * Type guard to safely extract a number value from a record
 */
function getRecordNumber(rec: RecordObject, field: string): number | undefined {
    const value = rec[field];
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
    }
    return undefined;
}

/**
 * Type guard to safely extract an object value from a record
 */
function getRecordObject(rec: RecordObject, field: string): Record<string, JsonValue> | undefined {
    const value = rec[field];
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, JsonValue>;
    }
    return undefined;
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

                const sku = getRecordString(rec, skuKey);
                const name = getRecordString(rec, nameKey);

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

                const existingVariant = await this.findVariantBySku(opCtx, sku);
                const taxCategoryId = await this.resolveTaxCategoryId(opCtx, taxCategoryName);

                const stockByLocation = stockLocKey ? getRecordObject(rec, stockLocKey) : undefined;
                const stockLevels = await this.resolveStockLevels(
                    opCtx,
                    stockByLocation as Record<string, number> | undefined
                );

                let priceMinor: number | undefined;
                let prices: UpdateProductVariantPriceInput[] | undefined;

                const priceMap = priceMapKey ? getRecordObject(rec, priceMapKey) : undefined;
                const priceRaw = rec[priceKey];

                if (priceMap && typeof priceMap === 'object') {
                    prices = Object.entries(priceMap).map(([cc, v]) => ({
                        currencyCode: cc as CurrencyCode,
                        price: Math.round(Number(v) * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER),
                    }));
                } else if (priceRaw != null) {
                    const n = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
                    if (!Number.isNaN(n)) priceMinor = Math.round(n * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
                }

                if (existingVariant) {
                    const update: UpdateProductVariantInput = {
                        id: String(existingVariant.id),
                        translations: [{ languageCode: LanguageCode.en, name }],
                    };

                    if (prices && prices.length > 0) {
                        update.prices = prices;
                    }

                    if (typeof priceMinor === 'number') {
                        update.price = priceMinor;
                    }

                    const stockOnHand = getRecordNumber(rec, stockKey);
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
                            this.logger.warn(`Failed to assign variant ${updated.id} to channel: ${error instanceof Error ? error.message : String(error)}`);
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
            const sku = getRecordString(rec, skuKey);
            if (!sku) continue;
            const v = await this.findVariantBySku(ctx, sku);
            if (v) exists++; else missing++;
        }
        return { exists, missing };
    }

    private async findVariantBySku(ctx: RequestContext, sku: string): Promise<ProductVariant | undefined> {
        const options: ListQueryOptions<ProductVariant> = {
            filter: { sku: { eq: sku } }
        };
        const result = await this.productVariantService.findAll(ctx, options);
        return result.items[0];
    }

    private async resolveTaxCategoryId(ctx: RequestContext, name?: string | null): Promise<ID | undefined> {
        if (!name) return undefined;
        try {
            const options: ListQueryOptions<TaxCategory> = {
                filter: { name: { eq: name } },
                take: 1
            };
            const list = await this.taxCategoryService.findAll(ctx, options);
            return list.items[0]?.id;
        } catch (error) {
            this.logger.warn(`Failed to resolve tax category '${name}': ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    private async resolveStockLevels(ctx: RequestContext, stockByLocation?: Record<string, number>): Promise<StockLevelInput[] | undefined> {
        if (!stockByLocation) return undefined;
        const result: StockLevelInput[] = [];
        for (const [locName, qty] of Object.entries(stockByLocation)) {
            try {
                const options: ListQueryOptions<StockLocation> = {
                    filter: { name: { eq: locName } },
                    take: 1
                };
                const list = await this.stockLocationService.findAll(ctx, options);
                const id = list.items[0]?.id;
                if (id) {
                    result.push({ stockLocationId: String(id), stockOnHand: qty });
                }
            } catch (error) {
                this.logger.warn(`Failed to resolve stock location '${locName}': ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return result;
    }
}
