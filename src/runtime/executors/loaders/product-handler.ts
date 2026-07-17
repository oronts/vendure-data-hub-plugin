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
    ConfigService,
    Product,
    ProductVariant,
    StockLocationService,
    FacetValueService,
    AssetService,
    ID,
    LanguageCode,
} from '@vendure/core';
import { createChannelRequestContext } from '../../helpers/channel-request-context';
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
import {
    PipelineStepDefinition,
    ErrorHandlingConfig,
    FacetValuesMode,
    AssetsMode,
    FeaturedAssetMode,
} from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler, CoercedProductFields } from './types';
import { assertCreateDuplicateCanBeSkipped, CreateDuplicateHandlingConfig } from './duplicate-handling';
import {
    findVariantBySku,
    resolveTaxCategoryId,
    resolveStockLevels,
    resolveChannelIds,
    parseTranslationsInput,
} from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { LoadStrategy, ConflictStrategy } from '../../../constants/enums';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { majorToMinorUnits, resolveMoneyPrecision } from '../../../utils/money.utils';
import { applyEntityAssetInput } from './entity-asset-input';
import {
    getStringValue,
    getNumberValue,
    getObjectValue,
    handleFacetValues,
    slugify,
} from '../../../loaders/shared-helpers';
import {
    persistVariantCurrencyPrices,
    resolveDefaultCurrencyPrice,
} from './variant-price-persistence';

/**
 * Configuration for product handler step
 */
interface ProductHandlerConfig extends CreateDuplicateHandlingConfig {
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
    /** Field name for a currency-to-price map */
    priceByCurrencyField?: string;
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
    /** Conflict strategy */
    conflictStrategy?: ConflictStrategy;
    /** Whether to track inventory */
    trackInventory?: string | boolean;
    /** Field name for custom fields object */
    customFieldsField?: string;
    /** Field name for product enabled flag */
    enabledField?: string;
    /** Whether to create/update variants alongside the product (default: true) */
    createVariants?: boolean;
    /** Record field containing channel codes (array or comma-separated string) for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing a translations array or object map for multi-language support */
    translationsField?: string;
    /** Record field containing facet value codes or objects with a code property */
    facetValuesField?: string;
    /** How facet values are applied when the configured record field is present */
    facetValuesMode?: FacetValuesMode;
    assetsField?: string;
    assetsMode?: AssetsMode;
    featuredAssetField?: string;
    featuredAssetMode?: FeaturedAssetMode;
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
    rec: RecordObject;
}

interface ProductUpsertResult {
    productId: ID | undefined;
    existing: Product | undefined;
    skipped?: boolean;
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
function parsePriceByCurrency(priceObj: Record<string, unknown>, precision: number): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [cc, val] of Object.entries(priceObj)) {
        const currencyCode = cc.toUpperCase();
        if (!Object.values(CurrencyCode).includes(currencyCode as CurrencyCode)) {
            throw new Error(`Invalid currency code "${cc}"`);
        }
        result[currencyCode] = majorToMinorUnits(val, precision);
    }
    if (Object.keys(result).length === 0) {
        throw new Error('Price map cannot be empty');
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
    const result: { prices?: Array<{ currencyCode: CurrencyCode; price: number }>; price?: number } = {};
    if (priceByCurrency) {
        result.prices = Object.entries(priceByCurrency).map(([cc, minor]) => ({
            currencyCode: cc as CurrencyCode,
            price: minor,
        }));
    }
    if (typeof priceMinor === 'number') {
        result.price = priceMinor;
    }
    return result;
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
    priceMapKey: string | undefined,
    precision: number,
): { priceMinor: number | undefined; priceByCurrency: Record<string, number> | undefined } {
    const priceRaw = rec[priceKey];
    const configuredPriceMap = priceMapKey ? rec[priceMapKey] : undefined;
    const inlinePriceMap = priceRaw && typeof priceRaw === 'object' && !Array.isArray(priceRaw)
        ? priceRaw as Record<string, unknown>
        : undefined;

    if (configuredPriceMap != null && priceRaw != null) {
        throw new Error('Configure either priceField or priceByCurrencyField data, not both');
    }

    const priceMap = configuredPriceMap ?? inlinePriceMap;
    if (priceMap != null) {
        if (typeof priceMap !== 'object' || Array.isArray(priceMap)) {
            throw new Error('Currency prices must be an object');
        }
        return {
            priceMinor: undefined,
            priceByCurrency: parsePriceByCurrency(priceMap as Record<string, unknown>, precision),
        };
    }
    if (priceRaw != null) {
        return { priceMinor: majorToMinorUnits(priceRaw, precision), priceByCurrency: undefined };
    }

    return { priceMinor: undefined, priceByCurrency: undefined };
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

function parseFacetValueCodes(value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error('Product facet values must be an array');
    }

    return value.map((item, index) => {
        if (typeof item === 'string' && item.trim()) {
            return item.trim();
        }
        if (item && typeof item === 'object') {
            const code = Reflect.get(item, 'code');
            if (typeof code === 'string' && code.trim()) {
                return code.trim();
            }
        }
        throw new Error(`Invalid product facet value at index ${index}`);
    });
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
        private facetValueService: FacetValueService,
        private assetService: AssetService,
        private configService: ConfigService,
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
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const cfg = getConfig(step.config);
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const fields = this.coerceProductFields(rec, cfg);

                // When translationsField is configured, extract name/slug from the first translation
                // if they're missing from the top-level record (multi-language input pattern)
                if ((!fields.name || !fields.slug) && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0) {
                            const first = parsed[0];
                            const firstName = first.name != null ? String(first.name) : undefined;
                            if (!fields.name && firstName) fields.name = firstName;
                            if (!fields.slug && firstName) {
                                fields.slug = first.slug != null ? String(first.slug) : slugify(firstName);
                            }
                        }
                    }
                }

                if (!fields.slug || !fields.name) {
                    if (onRecordError) {
                        const missing = !fields.name ? 'name' : 'slug';
                        await onRecordError(step.key, `Missing required field "${missing}" for productUpsert`, rec);
                    }
                    fail++;
                    continue;
                }

                const opCtx = await this.resolveRequestContext(ctx, cfg);
                if (cfg.strategy === LoadStrategy.CREATE && cfg.createVariants !== false && fields.sku) {
                    const existingVariant = await findVariantBySku(this.productVariantService, opCtx, fields.sku);
                    if (existingVariant) {
                        assertCreateDuplicateCanBeSkipped(cfg, 'variant', fields.sku);
                        skipped++;
                        continue;
                    }
                }
                const procCtx: ProductProcessingContext = { ctx, opCtx, step, cfg, fields, rec };

                const productResult = await this.createOrUpdateProduct(procCtx);
                if (productResult.skipped) {
                    skipped++;
                    continue;
                }
                if (!productResult.productId) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Product not found for update: ${fields.slug}`, rec);
                    }
                    fail++;
                    continue;
                }

                await this.assignProductToChannel(procCtx, productResult.productId);
                await this.assignToRecordChannels(opCtx, rec, cfg, productResult.productId, channelCache);
                await this.handleProductFacetValues(procCtx, productResult.productId);
                await applyEntityAssetInput({
                    ctx: opCtx,
                    record: rec,
                    config: cfg,
                    entityId: productResult.productId,
                    assetService: this.assetService,
                    entityService: this.productService,
                    logger: this.logger,
                });
                if (cfg.createVariants !== false) {
                    await this.handleProductVariants(procCtx, productResult.productId);
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'productUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    private async handleProductFacetValues(
        procCtx: ProductProcessingContext,
        productId: ID,
    ): Promise<void> {
        const { opCtx, cfg, rec } = procCtx;
        const field = cfg.facetValuesField ?? 'facetValueCodes';
        const codes = parseFacetValueCodes(rec[field]);
        if (codes === undefined) {
            return;
        }

        await handleFacetValues(
            opCtx,
            this.productService,
            this.facetValueService,
            productId,
            codes,
            cfg.facetValuesMode ?? 'REPLACE_ALL',
            this.logger,
        );
    }

    /**
     * Resolve the appropriate request context (handles channel switching)
     */
    private async resolveRequestContext(
        ctx: RequestContext,
        cfg: ProductHandlerConfig,
    ): Promise<RequestContext> {
        const targetChannel = cfg.channel;
        if (!targetChannel) {
            return ctx;
        }

        return createChannelRequestContext(this.requestContextService, ctx, targetChannel);
    }

    /**
     * Create or update a product based on strategy and conflict resolution
     * Returns an explicit skip state so CREATE duplicates do not trigger downstream side effects
     */
    private async createOrUpdateProduct(
        procCtx: ProductProcessingContext,
    ): Promise<ProductUpsertResult> {
        const { ctx, opCtx, cfg, fields, rec } = procCtx;
        const { slug, customFields, enabled } = fields;
        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const conflictResolution = cfg.conflictStrategy ?? ConflictStrategy.SOURCE_WINS;

        const existing = await this.productService.findOneBySlug(opCtx, slug!);

        // Build translations: multi-language from record field, or single-language default
        const translations = this.buildProductTranslations(ctx, rec, cfg, fields);

        if (existing) {
            // Skip if strategy is 'create' only (don't update existing)
            if (strategy === LoadStrategy.CREATE) {
                assertCreateDuplicateCanBeSkipped(cfg, 'product', slug!);
                return { productId: existing.id, existing, skipped: true };
            }
            // Keep existing Vendure data, don't update
            if (conflictResolution === ConflictStrategy.VENDURE_WINS) {
                return { productId: existing.id, existing };
            }
            // strategy is 'UPDATE' or 'UPSERT', and conflictStrategy is 'SOURCE_WINS' or 'MERGE'
            const updateInput: UpdateProductInput = {
                id: existing.id,
                translations,
                ...(typeof enabled === 'boolean' ? { enabled } : {}),
                ...(customFields ? { customFields } : {}),
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
            translations,
            ...(typeof enabled === 'boolean' ? { enabled } : {}),
            ...(customFields ? { customFields } : {}),
        };
        const created = await this.productService.create(opCtx, createInput);
        return { productId: created.id, existing: undefined };
    }

    /**
     * Build product translations from record.
     * If translationsField is set, reads multi-language array/object from the record.
     * Otherwise builds a single translation from nameField/slugField/descriptionField.
     */
    private buildProductTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: ProductHandlerConfig,
        fields: CoercedProductFields,
    ): ProductTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(t => {
                        const tName = String(t.name ?? fields.name!);
                        return {
                            languageCode: t.languageCode as LanguageCode,
                            name: tName,
                            slug: t.slug != null ? String(t.slug) : slugify(tName),
                            description: t.description != null ? String(t.description) : '',
                        };
                    });
                }
            }
        }

        // Single-language fallback
        return [{
            languageCode: ctx.languageCode as LanguageCode,
            name: fields.name!,
            slug: fields.slug!,
            description: fields.description ?? '',
        }];
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
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    /**
     * Assign product to dynamically resolved channels from a record field
     */
    private async assignToRecordChannels(
        opCtx: RequestContext,
        rec: RecordObject,
        cfg: ProductHandlerConfig,
        productId: ID,
        channelCache: Map<string, ID>,
    ): Promise<void> {
        if (!cfg.channelsField) return;
        const rawValue = rec[cfg.channelsField];
        if (rawValue == null) return;

        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
        if (channelIds.length === 0) return;

        try {
            await this.channelService.assignToChannels(opCtx, Product, productId, channelIds);
        } catch (error) {
            this.logger.warn('Failed to assign product to record channels', {
                productId,
                channelIds,
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    /**
     * Handle product variant creation or update
     */
    private async handleProductVariants(procCtx: ProductProcessingContext, productId: ID): Promise<void> {
        const { ctx, opCtx, step, cfg, fields } = procCtx;
        const { sku, name, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation, customFields } = fields;

        if (!sku) {
            return;
        }

        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const conflictResolution = cfg.conflictStrategy ?? ConflictStrategy.SOURCE_WINS;
        const targetChannel = cfg.channel;

        const existingVariant = await findVariantBySku(this.productVariantService, opCtx, sku);
        if (existingVariant && strategy === LoadStrategy.CREATE) {
            assertCreateDuplicateCanBeSkipped(cfg, 'variant', sku);
            return;
        }
        const taxCategoryId = await resolveTaxCategoryId(this.taxCategoryService, opCtx, cfg.taxCategoryName, this.logger);
        const stockLevels = await resolveStockLevels(this.stockLocationService, opCtx, stockByLocation, this.logger);
        if (priceByCurrency) {
            const availableCurrencies = opCtx.channel?.availableCurrencyCodes ?? [];
            const unavailableCurrencies = Object.keys(priceByCurrency)
                .filter(code => availableCurrencies.length > 0 && !availableCurrencies.includes(code as CurrencyCode));
            if (unavailableCurrencies.length > 0) {
                throw new Error(
                    `Currencies not available in channel "${opCtx.channel?.code ?? 'default'}": ${unavailableCurrencies.join(', ')}`,
                );
            }
        }

        const shouldUpdateVariant = existingVariant && strategy !== LoadStrategy.CREATE && conflictResolution !== ConflictStrategy.VENDURE_WINS;
        const shouldCreateVariant = !existingVariant && strategy !== LoadStrategy.UPDATE;

        const variantTranslation: ProductVariantTranslationInput = {
            languageCode: ctx.languageCode as LanguageCode,
            name: name!,
        };

        if (shouldUpdateVariant && existingVariant) {
            await this.updateExistingVariant(
                opCtx, step, existingVariant, variantTranslation, taxCategoryId, stockLevels,
                priceMinor, priceByCurrency, stockOnHand, trackInventory, targetChannel, customFields,
            );
        } else if (shouldCreateVariant) {
            await this.createNewVariant(
                opCtx, step, productId, sku, variantTranslation, taxCategoryId,
                priceMinor, priceByCurrency, stockOnHand, stockByLocation, trackInventory, targetChannel, customFields,
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
        customFields: Record<string, unknown> | undefined,
    ): UpdateProductVariantInput {
        const priceFields = buildVariantPrices(priceMinor, priceByCurrency);
        const stockFields = buildVariantStockFields(stockOnHand, stockLevels, trackInventory);

        return {
            id: variantId,
            translations: [variantTranslation],
            ...priceFields,
            ...stockFields,
            ...(taxCategoryId ? { taxCategoryId } : {}),
            ...(customFields ? { customFields } : {}),
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
        customFields: Record<string, unknown> | undefined,
    ): Promise<void> {
        const updateVariant = this.buildUpdateVariantInput(
            existingVariant.id, variantTranslation, taxCategoryId,
            priceMinor, priceByCurrency, stockOnHand, stockLevels, trackInventory, customFields,
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
        stockOnHand: number | undefined,
        stockLevels: StockLevelInput[] | undefined,
        trackInventory: boolean | undefined,
        customFields: Record<string, unknown> | undefined,
    ): CreateProductVariantInput {
        const priceFields = typeof priceMinor === 'number' ? { price: priceMinor } : {};
        const stockFields = buildVariantStockFields(stockOnHand, stockLevels, trackInventory);

        return {
            productId,
            sku,
            translations: [variantTranslation],
            ...priceFields,
            ...stockFields,
            ...(taxCategoryId ? { taxCategoryId } : {}),
            ...(customFields ? { customFields } : {}),
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
                error: getErrorMessage(error),
            });
            throw error;
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
        customFields: Record<string, unknown> | undefined,
    ): Promise<void> {
        const stockLevels = await resolveStockLevels(this.stockLocationService, opCtx, stockByLocation, this.logger);
        const currencyPrices = priceByCurrency
            ? buildVariantPrices(undefined, priceByCurrency).prices
            : undefined;
        const createPrice = currencyPrices
            ? resolveDefaultCurrencyPrice(opCtx, currencyPrices)
            : priceMinor;
        const input = this.buildVariantInput(
            productId, sku, variantTranslation, taxCategoryId,
            createPrice, stockOnHand, stockLevels, trackInventory, customFields,
        );

        const createdVariant = await this.createVariantRecord(opCtx, input);

        if (createdVariant && currencyPrices) {
            await persistVariantCurrencyPrices(
                this.productVariantService,
                opCtx,
                createdVariant.id,
                currencyPrices,
            );
        }

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
                error: getErrorMessage(error),
            });
            throw error;
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
        const priceMapKey = cfg?.priceByCurrencyField;

        const name = getStringValue(rec, nameKey) || undefined;
        const description = getStringValue(rec, descKey);
        const slug = extractSlugField(rec, slugKey, name);
        const sku = extractSkuField(rec, skuKey, slug);

        const precision = resolveMoneyPrecision(this.configService);
        const { priceMinor, priceByCurrency } = extractPriceFields(rec, priceKey, priceMapKey, precision);
        const { stockOnHand, stockByLocation } = extractStockFields(rec, cfg);
        const trackInventory = parseTrackInventory(cfg);

        const customFieldsKey = cfg?.customFieldsField ?? 'customFields';
        const customFields = getObjectValue(rec, customFieldsKey);

        const enabledKey = cfg?.enabledField ?? 'enabled';
        const enabledRaw = rec[enabledKey];
        const enabled = enabledRaw != null
            ? (typeof enabledRaw === 'boolean' ? enabledRaw : String(enabledRaw).toLowerCase() === 'true')
            : undefined;

        return { slug, name, description, sku, priceMinor, priceByCurrency, trackInventory, stockOnHand, stockByLocation, customFields, enabled };
    }
}
