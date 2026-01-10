/**
 * Product upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    ProductVariantService,
    ListQueryOptions,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    Product,
    ProductVariant,
    StockLocationService,
} from '@vendure/core';
import { StockLevelInput } from '@vendure/common/lib/generated-types';
import {
    CreateProductInput,
    CreateProductVariantInput,
    CurrencyCode,
    GlobalFlag,
    UpdateProductInput,
    UpdateProductVariantInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { slugify } from '../../utils';
import { LoaderHandler, CoercedProductFields } from './types';
import { TRANSFORM_LIMITS, LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

@Injectable()
export class ProductHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private requestContextService: RequestContextService,
        private taxCategoryService: TaxCategoryService,
        private channelService: ChannelService,
        private stockLocationService: StockLocationService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;

        for (const rec of input) {
            try {
                const { slug, name, description, sku, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation } = this.coerceProductFields(rec, step.config as any);
                if (!slug || !name) {
                    fail++;
                    continue;
                }

                let opCtx = ctx;
                const targetChannel = (step.config as any)?.channel as string | undefined;
                if (targetChannel) {
                    try {
                        opCtx = await this.requestContextService.create({ apiType: 'admin', channelOrToken: targetChannel });
                    } catch (error) {
                        this.logger.warn('Failed to create request context for target channel, using original context', {
                            stepKey: step.key,
                            targetChannel,
                            error: (error as Error)?.message,
                        });
                        // fallback to original ctx
                    }
                }

                const existing = await this.productService.findOneBySlug(opCtx, slug);
                let productId: any;
                // strategy: 'create' | 'update' | 'upsert' - controls INSERT/UPDATE behavior
                const strategy = String((step.config as any)?.strategy ?? 'upsert');
                // conflictResolution: 'source-wins' | 'vendure-wins' | 'merge' - controls field conflicts on UPDATE
                const conflictResolution = String((step.config as any)?.conflictResolution ?? 'source-wins');

                if (existing) {
                    // Skip if strategy is 'create' only (don't update existing)
                    if (strategy === 'create') {
                        productId = existing.id as any;
                        // Skip to variant handling, product already exists
                    } else if (conflictResolution === 'vendure-wins') {
                        // Keep existing Vendure data, don't update
                        productId = existing.id as any;
                    } else {
                        // strategy is 'update' or 'upsert', and conflictResolution is 'source-wins' or 'merge'
                        const updateInput: UpdateProductInput = {
                            id: existing.id as any,
                            translations: [
                                {
                                    languageCode: ctx.languageCode as any,
                                    name,
                                    slug,
                                    description: description ?? undefined,
                                },
                            ],
                        } as UpdateProductInput;
                        const updated = await this.productService.update(opCtx, updateInput);
                        productId = updated.id as any;
                    }
                } else {
                    // Product doesn't exist - skip if strategy is 'update' only
                    if (strategy === 'update') {
                        fail++;
                        continue;
                    }
                    // strategy is 'create' or 'upsert' - create the product
                    const createInput: CreateProductInput = {
                        translations: [
                            {
                                languageCode: ctx.languageCode as any,
                                name,
                                slug,
                                description: description ?? undefined,
                            },
                        ],
                    } as CreateProductInput;
                    const created = await this.productService.create(opCtx, createInput);
                    productId = created.id as any;
                }

                // Ensure product is assigned to the target channel
                if (productId && targetChannel) {
                    try {
                        await this.channelService.assignToChannels(opCtx, Product as any, productId, [opCtx.channelId as any]);
                    } catch (error) {
                        this.logger.warn('Failed to assign product to target channel', {
                            stepKey: step.key,
                            productId,
                            targetChannel,
                            error: (error as Error)?.message,
                        });
                    }
                }

                // Ensure a default variant by SKU if provided
                if (sku) {
                    const existingVariant = await this.findVariantBySku(opCtx, sku);
                    const taxCategoryId = await this.resolveTaxCategoryId(opCtx, (step.config as any)?.taxCategoryName);
                    const stockLevels = await this.resolveStockLevels(opCtx, stockByLocation);

                    // Update variant if: exists AND not 'create' strategy AND conflict resolution allows update
                    const shouldUpdateVariant = existingVariant && strategy !== 'create' && conflictResolution !== 'vendure-wins';
                    // Create variant if: not exists AND not 'update' strategy
                    const shouldCreateVariant = !existingVariant && strategy !== 'update';

                    if (shouldUpdateVariant) {
                        const updateVariant: UpdateProductVariantInput = {
                            id: existingVariant.id as any,
                            translations: [
                                {
                                    languageCode: ctx.languageCode as any,
                                    name,
                                },
                            ],
                        } as UpdateProductVariantInput;

                        if (priceByCurrency) {
                            updateVariant.prices = Object.entries(priceByCurrency).map(([cc, minor]) => ({
                                currencyCode: cc as CurrencyCode,
                                price: Number(minor) as any,
                            }));
                        } else if (typeof priceMinor === 'number') {
                            updateVariant.price = priceMinor as any;
                        }
                        if (typeof stockOnHand === 'number') {
                            updateVariant.stockOnHand = stockOnHand as any;
                        }
                        if (stockLevels && stockLevels.length) {
                            (updateVariant as any).stockLevels = stockLevels as any;
                        }
                        if (typeof trackInventory === 'boolean') {
                            updateVariant.trackInventory = (trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE) as any;
                        }
                        if (taxCategoryId) {
                            (updateVariant as any).taxCategoryId = taxCategoryId as any;
                        }

                        const updatedVariants = await this.productVariantService.update(opCtx, [updateVariant] as any);
                        if (targetChannel) {
                            try {
                                const alreadyIn = Array.isArray((existingVariant as any)?.channels) && (existingVariant as any).channels.some((c: any) => c?.id === opCtx.channelId);
                                if (!alreadyIn) {
                                    await this.channelService.assignToChannels(opCtx, ProductVariant as any, updatedVariants[0].id as any, [opCtx.channelId as any]);
                                }
                            } catch (error) {
                                this.logger.warn('Failed to assign updated variant to target channel', {
                                    stepKey: step.key,
                                    variantId: updatedVariants[0]?.id,
                                    targetChannel,
                                    error: (error as Error)?.message,
                                });
                            }
                        }
                    } else if (productId && shouldCreateVariant) {
                        const createVariant: CreateProductVariantInput = {
                            productId,
                            sku,
                            translations: [
                                {
                                    languageCode: ctx.languageCode as any,
                                    name,
                                },
                            ],
                        } as CreateProductVariantInput;

                        if (priceByCurrency) {
                            createVariant.prices = Object.entries(priceByCurrency).map(([cc, minor]) => ({
                                currencyCode: cc as CurrencyCode,
                                price: Number(minor) as any,
                            }));
                        } else if (typeof priceMinor === 'number') {
                            createVariant.price = priceMinor as any;
                        }
                        if (typeof stockOnHand === 'number') {
                            createVariant.stockOnHand = stockOnHand as any;
                        }
                        const stockLevelsCreate = await this.resolveStockLevels(opCtx, stockByLocation);
                        if (stockLevelsCreate && stockLevelsCreate.length) {
                            (createVariant as any).stockLevels = stockLevelsCreate as any;
                        }
                        if (typeof trackInventory === 'boolean') {
                            createVariant.trackInventory = (trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE) as any;
                        }
                        if (taxCategoryId) {
                            (createVariant as any).taxCategoryId = taxCategoryId as any;
                        }

                        const createdVariants = await this.productVariantService.create(opCtx, [createVariant] as any);
                        if (targetChannel) {
                            try {
                                await this.channelService.assignToChannels(opCtx, ProductVariant as any, createdVariants[0].id as any, [opCtx.channelId as any]);
                            } catch (error) {
                                this.logger.warn('Failed to assign created variant to target channel', {
                                    stepKey: step.key,
                                    variantId: createdVariants[0]?.id,
                                    targetChannel,
                                    error: (error as Error)?.message,
                                });
                            }
                        }
                    }
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'productUpsert failed', rec as any);
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
        let wouldCreate = 0, wouldUpdate = 0;
        for (const rec of input) {
            const { slug } = this.coerceProductFields(rec, step.config as any);
            if (!slug) continue;
            const existing = await this.productService.findOneBySlug(ctx, slug);
            if (existing) {
                wouldUpdate++;
            } else {
                wouldCreate++;
            }
        }
        return { wouldCreate, wouldUpdate };
    }

    coerceProductFields(rec: RecordObject, cfg?: any): CoercedProductFields {
        const nameKey = cfg?.nameField ?? 'name';
        const slugKey = cfg?.slugField ?? 'slug';
        const descKey = cfg?.descriptionField ?? 'description';
        const skuKey = cfg?.skuField ?? 'sku';
        const priceKey = cfg?.priceField ?? 'price';

        const name = String((rec as any)?.[nameKey] ?? '') || undefined;
        let slug = String((rec as any)?.[slugKey] ?? '') || undefined;
        const description = (rec as any)?.[descKey] ? String((rec as any)?.[descKey]) : undefined;
        let sku = String((rec as any)?.[skuKey] ?? (rec as any)?.variantSku ?? '') || undefined;
        const priceRaw = (rec as any)?.[priceKey];
        let priceMinor: number | undefined;
        let priceByCurrency: Record<string, number> | undefined;

        if (typeof priceRaw === 'number') {
            priceMinor = Math.round(priceRaw);
        } else if (typeof priceRaw === 'string') {
            const num = Number(priceRaw);
            if (!Number.isNaN(num)) {
                priceMinor = Math.round(num * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
            }
        } else if (priceRaw && typeof priceRaw === 'object') {
            priceByCurrency = {};
            for (const [cc, val] of Object.entries(priceRaw as Record<string, any>)) {
                const n = typeof val === 'number' ? val : Number(val);
                if (!Number.isNaN(n)) {
                    priceByCurrency[cc] = Math.round(n * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
                }
            }
        }

        if (!slug && name) {
            slug = slugify(name);
        }
        if (!sku && slug) {
            sku = slug.toUpperCase();
        }

        let trackInventory: boolean | undefined;
        const trackVal = (cfg?.trackInventory ?? '').toString().toLowerCase();
        if (trackVal === 'true') trackInventory = true;
        if (trackVal === 'false') trackInventory = false;

        let stockOnHand: number | undefined;
        const stockKey = cfg?.stockField ?? 'stockOnHand';
        const stockRaw = (rec as any)?.[stockKey];
        if (typeof stockRaw === 'number') stockOnHand = Math.max(0, Math.floor(stockRaw));
        if (typeof stockRaw === 'string') {
            const sn = Number(stockRaw);
            if (!Number.isNaN(sn)) stockOnHand = Math.max(0, Math.floor(sn));
        }

        let stockByLocation: Record<string, number> | undefined;
        const stockLocKey = cfg?.stockByLocationField;
        if (stockLocKey) {
            const map = (rec as any)?.[stockLocKey];
            if (map && typeof map === 'object') {
                stockByLocation = {};
                for (const [locName, val] of Object.entries(map as Record<string, any>)) {
                    const n = typeof val === 'number' ? val : Number(val);
                    if (!Number.isNaN(n)) stockByLocation[locName] = Math.max(0, Math.floor(n));
                }
            }
        }

        return { slug, name, description, sku, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation };
    }

    async findVariantBySku(ctx: RequestContext, sku: string) {
        const result = await this.productVariantService.findAll(ctx, { filter: { sku: { eq: sku } } } as unknown as ListQueryOptions<any>);
        return result.items[0];
    }

    async resolveTaxCategoryId(ctx: RequestContext, name?: string | null): Promise<string | undefined> {
        if (!name) return undefined;
        try {
            const list = await this.taxCategoryService.findAll(ctx, { filter: { name: { eq: name } }, take: 1 } as any);
            return (list.items[0]?.id as any) ?? undefined;
        } catch (error) {
            this.logger.warn('Failed to resolve tax category by name', {
                taxCategoryName: name,
                error: (error as Error)?.message,
            });
            return undefined;
        }
    }

    async resolveStockLevels(ctx: RequestContext, stockByLocation?: Record<string, number>): Promise<StockLevelInput[] | undefined> {
        if (!stockByLocation) return undefined;
        const result: StockLevelInput[] = [];
        for (const [locName, qty] of Object.entries(stockByLocation)) {
            try {
                const list = await this.stockLocationService.findAll(ctx, { filter: { name: { eq: locName } }, take: 1 } as any);
                const id = (list.items[0]?.id as any) ?? undefined;
                if (id) {
                    result.push({ stockLocationId: id as any, stockOnHand: qty });
                }
            } catch (error) {
                this.logger.warn('Failed to resolve stock location by name', {
                    locationName: locName,
                    error: (error as Error)?.message,
                });
                // continue with remaining locations
            }
        }
        return result;
    }
}
