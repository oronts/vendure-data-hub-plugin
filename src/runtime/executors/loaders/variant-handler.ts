/**
 * Variant upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductVariantService,
    ListQueryOptions,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    ProductVariant,
    StockLocationService,
} from '@vendure/core';
import { StockLevelInput } from '@vendure/common/lib/generated-types';
import {
    CurrencyCode,
    LanguageCode,
    UpdateProductVariantInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { TRANSFORM_LIMITS } from '../../../constants/index';

@Injectable()
export class VariantHandler implements LoaderHandler {
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
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const skuKey = (step.config as any)?.skuField ?? 'sku';
                const nameKey = (step.config as any)?.nameField ?? 'name';
                const priceKey = (step.config as any)?.priceField ?? 'price';
                const priceMapKey = (step.config as any)?.priceByCurrencyField;
                const taxCategoryName = (step.config as any)?.taxCategoryName as string | undefined;
                const stockKey = (step.config as any)?.stockField ?? 'stockOnHand';
                const stockLocKey = (step.config as any)?.stockByLocationField;
                const sku = String((rec as any)?.[skuKey] ?? '') || undefined;
                const name = String((rec as any)?.[nameKey] ?? '') || undefined;

                if (!sku || !name) { fail++; continue; }

                let opCtx = ctx;
                const channelCode = (step.config as any)?.channel as string | undefined;
                if (channelCode) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType as any, channelOrToken: channelCode });
                    if (req) opCtx = req;
                }

                const existingVariant = await this.findVariantBySku(opCtx, sku);
                const taxCategoryId = await this.resolveTaxCategoryId(opCtx, taxCategoryName);
                const stockLevels = await this.resolveStockLevels(opCtx, stockLocKey ? ((rec as any)?.[stockLocKey] ?? undefined) : undefined);
                let priceMinor: number | undefined;
                let prices: Array<{ currencyCode: CurrencyCode; price: number }> | undefined;
                const priceMap = priceMapKey ? (rec as any)?.[priceMapKey] : undefined;
                const priceRaw = (rec as any)?.[priceKey];

                if (priceMap && typeof priceMap === 'object') {
                    prices = Object.entries(priceMap).map(([cc, v]) => ({
                        currencyCode: cc as CurrencyCode,
                        price: Math.round(Number(v) * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER) as any,
                    }));
                } else if (priceRaw != null) {
                    const n = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
                    if (!Number.isNaN(n)) priceMinor = Math.round(n * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
                }

                if (existingVariant) {
                    const update: UpdateProductVariantInput = { id: existingVariant.id as any } as any;
                    update.translations = [{ languageCode: LanguageCode.en, name }];
                    if (prices) (update as any).prices = prices as any;
                    if (typeof priceMinor === 'number') (update as any).price = priceMinor as any;
                    if (typeof (rec as any)?.[stockKey] === 'number') update.stockOnHand = Math.max(0, Math.floor((rec as any)[stockKey])) as any;
                    if (stockLevels && stockLevels.length) (update as any).stockLevels = stockLevels as any;
                    if (taxCategoryId) (update as any).taxCategoryId = taxCategoryId as any;

                    const [updated] = await this.productVariantService.update(opCtx, [update] as any);
                    if (channelCode) {
                        try {
                            const alreadyIn = Array.isArray((existingVariant as any)?.channels) && (existingVariant as any).channels.some((c: any) => c?.id === opCtx.channelId);
                            if (!alreadyIn) {
                                await this.channelService.assignToChannels(opCtx, ProductVariant as any, updated.id as any, [opCtx.channelId as any]);
                            }
                        } catch { /* optional */ }
                    }
                } else {
                    // Need a productId to create a variant; best-effort: try to find product by slug/name
                    // Here we skip creation without product context
                    fail++;
                    continue;
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'variantUpsert failed', rec as any);
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
    ): Promise<Record<string, any>> {
        let exists = 0, missing = 0;
        for (const rec of input) {
            const skuKey = (step.config as any)?.skuField ?? 'sku';
            const sku = String((rec as any)?.[skuKey] ?? '') || undefined;
            if (!sku) continue;
            const v = await this.findVariantBySku(ctx, sku);
            if (v) exists++; else missing++;
        }
        return { exists, missing };
    }

    private async findVariantBySku(ctx: RequestContext, sku: string) {
        const result = await this.productVariantService.findAll(ctx, { filter: { sku: { eq: sku } } } as unknown as ListQueryOptions<any>);
        return result.items[0];
    }

    private async resolveTaxCategoryId(ctx: RequestContext, name?: string | null): Promise<string | undefined> {
        if (!name) return undefined;
        try {
            const list = await this.taxCategoryService.findAll(ctx, { filter: { name: { eq: name } }, take: 1 } as any);
            return (list.items[0]?.id as any) ?? undefined;
        } catch {
            return undefined;
        }
    }

    private async resolveStockLevels(ctx: RequestContext, stockByLocation?: Record<string, number>): Promise<StockLevelInput[] | undefined> {
        if (!stockByLocation) return undefined;
        const result: StockLevelInput[] = [];
        for (const [locName, qty] of Object.entries(stockByLocation)) {
            try {
                const list = await this.stockLocationService.findAll(ctx, { filter: { name: { eq: locName } }, take: 1 } as any);
                const id = (list.items[0]?.id as any) ?? undefined;
                if (id) {
                    result.push({ stockLocationId: id as any, stockOnHand: qty });
                }
            } catch {
                // ignore missing locations
            }
        }
        return result;
    }
}
