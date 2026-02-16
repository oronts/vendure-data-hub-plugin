/**
 * Product upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    ProductVariantService,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    Product,
    ProductVariant,
    StockLocationService,
    ID,
    LanguageCode,
} from '@vendure/core';
import {
    StockLevelInput,
    CreateProductInput,
    CreateProductVariantInput,
    CurrencyCode,
    GlobalFlag,
    UpdateProductInput,
    UpdateProductVariantInput,
    ProductTranslationInput,
    ProductVariantTranslationInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { slugify } from '../../utils';
import { LoaderHandler, CoercedProductFields } from './types';
import {
    findVariantBySku,
    resolveTaxCategoryId,
    resolveStockLevels,
} from './shared-lookups';
import { TRANSFORM_LIMITS, LOGGER_CONTEXTS } from '../../../constants/index';
import { LoadStrategy, ConflictStrategy } from '../../../constants/enums';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue, getNumberValue, getObjectValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for product handler step
 */
interface ProductHandlerConfig {
    /** Field name for product name */
    nameField?: string;
    /** Field name for product slug */
    slugField?: string;
    /** Field name for product description */
    descriptionField?: string;
    /** Field name for variant SKU */
    skuField?: string;
    /** Field name for variant price */
    priceField?: string;
    /** Field name for stock on hand */
    stockField?: string;
    /** Field name for stock by location map */
    stockByLocationField?: string;
    /** Name of tax category to assign */
    taxCategoryName?: string;
    /** Target channel token */
    channel?: string;
    /** Strategy for handling conflicts */
    strategy?: LoadStrategy;
    /** Conflict resolution strategy */
    conflictResolution?: ConflictStrategy;
    /** Whether to track inventory */
    trackInventory?: string | boolean;
}

/**
 * Context for processing a single product record
 */
interface ProductProcessingContext {
    ctx: RequestContext;
    opCtx: RequestContext;
    step: PipelineStepDefinition;
    cfg: ProductHandlerConfig;
    fields: CoercedProductFields;
}

/**
 * Safely cast step config to ProductHandlerConfig
 */
function getConfig(config: Record<string, unknown>): ProductHandlerConfig {
    return config as unknown as ProductHandlerConfig;
}

/**
 * Helper to convert price object to currency-price map
 */
function parsePriceByCurrency(priceObj: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [cc, val] of Object.entries(priceObj)) {
        const numericValue = typeof val === 'number' ? val : Number(val);
        if (!Number.isNaN(numericValue)) {
            result[cc] = Math.round(numericValue * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
        }
    }
    return result;
}

/**
 * Helper to parse stock by location map
 */
function parseStockByLocation(stockObj: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [locName, val] of Object.entries(stockObj)) {
        const numericValue = typeof val === 'number' ? val : Number(val);
        if (!Number.isNaN(numericValue)) {
            result[locName] = Math.max(0, Math.floor(numericValue));
        }
    }
    return result;
}

/**
 * Build prices array for variant input from price data
 */
function buildVariantPrices(
    priceMinor: number | undefined,
    priceByCurrency: Record<string, number> | undefined,
): { prices?: Array<{ currencyCode: CurrencyCode; price: number }>; price?: number } {
    if (priceByCurrency) {
        return {
            prices: Object.entries(priceByCurrency).map(([cc, minor]) => ({
                currencyCode: cc as CurrencyCode,
                price: minor,
            })),
        };
    }
    if (typeof priceMinor === 'number') {
        return { price: priceMinor };
    }
    return {};
}

/**
 * Build stock fields for variant input
 */
function buildVariantStockFields(
    stockOnHand: number | undefined,
    stockLevels: StockLevelInput[] | undefined,
    trackInventory: boolean | undefined,
): { stockOnHand?: number; stockLevels?: StockLevelInput[]; trackInventory?: GlobalFlag } {
    const result: { stockOnHand?: number; stockLevels?: StockLevelInput[]; trackInventory?: GlobalFlag } = {};
    if (typeof stockOnHand === 'number') {
        result.stockOnHand = stockOnHand;
    }
    if (stockLevels && stockLevels.length) {
        result.stockLevels = stockLevels;
    }
    if (typeof trackInventory === 'boolean') {
        result.trackInventory = trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE;
    }
    return result;
}

/**
 * Extract price fields from record
 */
function extractPriceFields(
    rec: RecordObject,
    priceKey: string,
): { priceMinor: number | undefined; priceByCurrency: Record<string, number> | undefined } {
    const priceRaw = rec[priceKey];
    let priceMinor: number | undefined;
    let priceByCurrency: Record<string, number> | undefined;

    if (typeof priceRaw === 'number') {
        priceMinor = Math.round(priceRaw * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
    } else if (typeof priceRaw === 'string') {
        const num = Number(priceRaw);
        if (!Number.isNaN(num)) {
            priceMinor = Math.round(num * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
        }
    } else if (priceRaw && typeof priceRaw === 'object' && !Array.isArray(priceRaw)) {
        priceByCurrency = parsePriceByCurrency(priceRaw as Record<string, unknown>);
    }

    return { priceMinor, priceByCurrency };
}

/**
 * Extract stock fields from record
 */
function extractStockFields(
    rec: RecordObject,
    cfg: ProductHandlerConfig | undefined,
): { stockOnHand: number | undefined; stockByLocation: Record<string, number> | undefined } {
    let stockOnHand: number | undefined;
    const stockKey = cfg?.stockField ?? 'stockOnHand';
    const stockRaw = getNumberValue(rec, stockKey);
    if (typeof stockRaw === 'number') {
        stockOnHand = Math.max(0, Math.floor(stockRaw));
    }

    let stockByLocation: Record<string, number> | undefined;
    const stockLocKey = cfg?.stockByLocationField;
    if (stockLocKey) {
        const map = getObjectValue(rec, stockLocKey);
        if (map) {
            stockByLocation = parseStockByLocation(map);
        }
    }

    return { stockOnHand, stockByLocation };
}

/**
 * Parse track inventory config value
 */
function parseTrackInventory(cfg: ProductHandlerConfig | undefined): boolean | undefined {
    const trackVal = String(cfg?.trackInventory ?? '').toLowerCase();
    if (trackVal === 'true') return true;
    if (trackVal === 'false') return false;
    return undefined;
}

/**
 * Extract and normalize slug from record, generating from name if needed
 */
function extractSlugField(rec: RecordObject, slugKey: string, name: string | undefined): string | undefined {
    let slug = getStringValue(rec, slugKey) || undefined;
    if (!slug && name) {
        slug = slugify(name);
    }
    return slug;
}

/**
 * Extract and normalize SKU from record, generating from slug if needed
 */
function extractSkuField(rec: RecordObject, skuKey: string, slug: string | undefined): string | undefined {
    let sku = getStringValue(rec, skuKey) || getStringValue(rec, 'variantSku') || undefined;
    if (!sku && slug) {
        sku = slug.toUpperCase();
    }
    return sku;
}

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
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;
        const cfg = getConfig(step.config);

        for (const rec of input) {
            try {
                const fields = this.prepareProductData(rec, cfg);
                if (!fields.slug || !fields.name) {
                    fail++;
                    continue;
                }

                const opCtx = await this.resolveRequestContext(ctx, step, cfg);
                const procCtx: ProductProcessingContext = { ctx, opCtx, step, cfg, fields };

                const productResult = await this.createOrUpdateProduct(procCtx);
                if (!productResult.productId) {
                    fail++;
                    continue;
                }

                await this.assignProductToChannel(procCtx, productResult.productId);
                await this.handleProductVariants(procCtx, productResult.productId);

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'productUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Prepare and validate product data from a record
     */
    private prepareProductData(rec: RecordObject, cfg: ProductHandlerConfig): CoercedProductFields {
        return this.coerceProductFields(rec, cfg);
    }

    /**
     * Resolve the appropriate request context (handles channel switching)
     */
    private async resolveRequestContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        cfg: ProductHandlerConfig,
    ): Promise<RequestContext> {
        const targetChannel = cfg.channel;
        if (!targetChannel) {
            return ctx;
        }

        try {
            return await this.requestContextService.create({ apiType: 'admin', channelOrToken: targetChannel });
        } catch (error) {
            this.logger.warn('Failed to create request context for target channel, using original context', {
                stepKey: step.key,
                targetChannel,
                error: (error as Error)?.message,
            });
            return ctx;
        }
    }

    /**
     * Create or update a product based on strategy and conflict resolution
     * Returns the product ID or undefined if the operation was skipped
     */
    private async createOrUpdateProduct(
        procCtx: ProductProcessingContext,
    ): Promise<{ productId: ID | undefined; existing: Product | undefined }> {
        const { ctx, opCtx, cfg, fields } = procCtx;
        const { slug, name, description } = fields;
        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const conflictResolution = cfg.conflictResolution ?? ConflictStrategy.SOURCE_WINS;

        const existing = await this.productService.findOneBySlug(opCtx, slug!);
        const productTranslation: ProductTranslationInput = {
            languageCode: ctx.languageCode as LanguageCode,
            name: name!,
            slug: slug!,
            description: description ?? undefined,
        };

        if (existing) {
            // Skip if strategy is 'create' only (don't update existing)
            if (strategy === LoadStrategy.CREATE) {
                return { productId: existing.id, existing };
            }
            // Keep existing Vendure data, don't update
            if (conflictResolution === ConflictStrategy.VENDURE_WINS) {
                return { productId: existing.id, existing };
            }
            // strategy is 'UPDATE' or 'UPSERT', and conflictResolution is 'SOURCE_WINS' or 'MERGE'
            const updateInput: UpdateProductInput = {
                id: existing.id,
                translations: [productTranslation],
            };
            const updated = await this.productService.update(opCtx, updateInput);
            return { productId: updated.id, existing };
        }

        // Product doesn't exist - skip if strategy is 'update' only
        if (strategy === LoadStrategy.UPDATE) {
            return { productId: undefined, existing: undefined };
        }

        // strategy is 'create' or 'upsert' - create the product
        const createInput: CreateProductInput = {
            translations: [productTranslation],
        };
        const created = await this.productService.create(opCtx, createInput);
        return { productId: created.id, existing: undefined };
    }

    /**
     * Assign product to the target channel if specified
     */
    private async assignProductToChannel(procCtx: ProductProcessingContext, productId: ID): Promise<void> {
        const { opCtx, step, cfg } = procCtx;
        const targetChannel = cfg.channel;

        if (!targetChannel) {
            return;
        }

        try {
            await this.channelService.assignToChannels(opCtx, Product, productId, [opCtx.channelId]);
        } catch (error) {
            this.logger.warn('Failed to assign product to target channel', {
                stepKey: step.key,
                productId,
                targetChannel,
                error: (error as Error)?.message,
            });
        }
    }

    /**
     * Handle product variant creation or update
     */
    private async handleProductVariants(procCtx: ProductProcessingContext, productId: ID): Promise<void> {
        const { ctx, opCtx, step, cfg, fields } = procCtx;
        const { sku, name, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation } = fields;

        if (!sku) {
            return;
        }

        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const conflictResolution = cfg.conflictResolution ?? ConflictStrategy.SOURCE_WINS;
        const targetChannel = cfg.channel;

        const existingVariant = await findVariantBySku(this.productVariantService, opCtx, sku);
        const taxCategoryId = await resolveTaxCategoryId(this.taxCategoryService, opCtx, cfg.taxCategoryName, this.logger);
        const stockLevels = await resolveStockLevels(this.stockLocationService, opCtx, stockByLocation, this.logger);

        const shouldUpdateVariant = existingVariant && strategy !== LoadStrategy.CREATE && conflictResolution !== ConflictStrategy.VENDURE_WINS;
        const shouldCreateVariant = !existingVariant && strategy !== LoadStrategy.UPDATE;

        const variantTranslation: ProductVariantTranslationInput = {
            languageCode: ctx.languageCode as LanguageCode,
            name: name!,
        };

        if (shouldUpdateVariant && existingVariant) {
            await this.updateExistingVariant(
                opCtx, step, existingVariant, variantTranslation, taxCategoryId, stockLevels,
                priceMinor, priceByCurrency, stockOnHand, trackInventory, targetChannel,
            );
        } else if (shouldCreateVariant) {
            await this.createNewVariant(
                opCtx, step, productId, sku, variantTranslation, taxCategoryId,
                priceMinor, priceByCurrency, stockOnHand, stockByLocation, trackInventory, targetChannel,
            );
        }
    }

    /**
     * Build variant input for update
     */
    private buildUpdateVariantInput(
        variantId: ID,
        variantTranslation: ProductVariantTranslationInput,
        taxCategoryId: ID | undefined,
        priceMinor: number | undefined,
        priceByCurrency: Record<string, number> | undefined,
        stockOnHand: number | undefined,
        stockLevels: StockLevelInput[] | undefined,
        trackInventory: boolean | undefined,
    ): UpdateProductVariantInput {
        const priceFields = buildVariantPrices(priceMinor, priceByCurrency);
        const stockFields = buildVariantStockFields(stockOnHand, stockLevels, trackInventory);

        return {
            id: variantId,
            translations: [variantTranslation],
            ...priceFields,
            ...stockFields,
            ...(taxCategoryId ? { taxCategoryId } : {}),
        };
    }

    /**
     * Update an existing product variant
     */
    private async updateExistingVariant(
        opCtx: RequestContext,
        step: PipelineStepDefinition,
        existingVariant: ProductVariant,
        variantTranslation: ProductVariantTranslationInput,
        taxCategoryId: ID | undefined,
        stockLevels: StockLevelInput[] | undefined,
        priceMinor: number | undefined,
        priceByCurrency: Record<string, number> | undefined,
        stockOnHand: number | undefined,
        trackInventory: boolean | undefined,
        targetChannel: string | undefined,
    ): Promise<void> {
        const updateVariant = this.buildUpdateVariantInput(
            existingVariant.id, variantTranslation, taxCategoryId,
            priceMinor, priceByCurrency, stockOnHand, stockLevels, trackInventory,
        );

        const updatedVariants = await this.productVariantService.update(opCtx, [updateVariant]);

        if (targetChannel && updatedVariants.length > 0) {
            await this.assignVariantToChannelIfNeeded(opCtx, step, existingVariant, updatedVariants[0].id, targetChannel);
        }
    }

    /**
     * Build variant input for creation
     */
    private buildVariantInput(
        productId: ID,
        sku: string,
        variantTranslation: ProductVariantTranslationInput,
        taxCategoryId: ID | undefined,
        priceMinor: number | undefined,
        priceByCurrency: Record<string, number> | undefined,
        stockOnHand: number | undefined,
        stockLevels: StockLevelInput[] | undefined,
        trackInventory: boolean | undefined,
    ): CreateProductVariantInput {
        const priceFields = buildVariantPrices(priceMinor, priceByCurrency);
        const stockFields = buildVariantStockFields(stockOnHand, stockLevels, trackInventory);

        return {
            productId,
            sku,
            translations: [variantTranslation],
            ...priceFields,
            ...stockFields,
            ...(taxCategoryId ? { taxCategoryId } : {}),
        };
    }

    /**
     * Create variant record via service
     */
    private async createVariantRecord(
        opCtx: RequestContext,
        input: CreateProductVariantInput,
    ): Promise<ProductVariant | undefined> {
        const createdVariants = await this.productVariantService.create(opCtx, [input]);
        return createdVariants[0];
    }

    /**
     * Assign newly created variant to target channel
     */
    private async assignCreatedVariantToChannel(
        opCtx: RequestContext,
        step: PipelineStepDefinition,
        variantId: ID,
        targetChannel: string,
    ): Promise<void> {
        try {
            await this.channelService.assignToChannels(opCtx, ProductVariant, variantId, [opCtx.channelId]);
        } catch (error) {
            this.logger.warn('Failed to assign created variant to target channel', {
                stepKey: step.key,
                variantId,
                targetChannel,
                error: (error as Error)?.message,
            });
        }
    }

    /**
     * Create a new product variant
     */
    private async createNewVariant(
        opCtx: RequestContext,
        step: PipelineStepDefinition,
        productId: ID,
        sku: string,
        variantTranslation: ProductVariantTranslationInput,
        taxCategoryId: ID | undefined,
        priceMinor: number | undefined,
        priceByCurrency: Record<string, number> | undefined,
        stockOnHand: number | undefined,
        stockByLocation: Record<string, number> | undefined,
        trackInventory: boolean | undefined,
        targetChannel: string | undefined,
    ): Promise<void> {
        const stockLevels = await resolveStockLevels(this.stockLocationService, opCtx, stockByLocation, this.logger);
        const input = this.buildVariantInput(
            productId, sku, variantTranslation, taxCategoryId,
            priceMinor, priceByCurrency, stockOnHand, stockLevels, trackInventory,
        );

        const createdVariant = await this.createVariantRecord(opCtx, input);

        if (targetChannel && createdVariant) {
            await this.assignCreatedVariantToChannel(opCtx, step, createdVariant.id, targetChannel);
        }
    }

    /**
     * Assign an updated variant to channel if not already assigned
     */
    private async assignVariantToChannelIfNeeded(
        opCtx: RequestContext,
        step: PipelineStepDefinition,
        existingVariant: ProductVariant,
        updatedVariantId: ID,
        targetChannel: string,
    ): Promise<void> {
        try {
            const variantWithChannels = existingVariant as ProductVariant & { channels?: Array<{ id: ID }> };
            const alreadyIn = Array.isArray(variantWithChannels.channels) &&
                variantWithChannels.channels.some((c) => c?.id === opCtx.channelId);
            if (!alreadyIn) {
                await this.channelService.assignToChannels(opCtx, ProductVariant, updatedVariantId, [opCtx.channelId]);
            }
        } catch (error) {
            this.logger.warn('Failed to assign updated variant to target channel', {
                stepKey: step.key,
                variantId: updatedVariantId,
                targetChannel,
                error: (error as Error)?.message,
            });
        }
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let wouldCreate = 0, wouldUpdate = 0;
        const cfg = getConfig(step.config);
        for (const rec of input) {
            const { slug } = this.coerceProductFields(rec, cfg);
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

    coerceProductFields(rec: RecordObject, cfg?: ProductHandlerConfig): CoercedProductFields {
        const nameKey = cfg?.nameField ?? 'name';
        const slugKey = cfg?.slugField ?? 'slug';
        const descKey = cfg?.descriptionField ?? 'description';
        const skuKey = cfg?.skuField ?? 'sku';
        const priceKey = cfg?.priceField ?? 'price';

        const name = getStringValue(rec, nameKey) || undefined;
        const description = getStringValue(rec, descKey);
        const slug = extractSlugField(rec, slugKey, name);
        const sku = extractSkuField(rec, skuKey, slug);

        const { priceMinor, priceByCurrency } = extractPriceFields(rec, priceKey);
        const { stockOnHand, stockByLocation } = extractStockFields(rec, cfg);
        const trackInventory = parseTrackInventory(cfg);

        return { slug, name, description, sku, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation };
    }
}
