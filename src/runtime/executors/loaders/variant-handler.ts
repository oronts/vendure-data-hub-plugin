/**
 * Variant upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    ProductVariantService,
    ProductOptionGroupService,
    ProductOptionService,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    ProductVariant,
    StockLocationService,
    ApiType,
    Channel,
    ID,
} from '@vendure/core';
import { Type } from '@vendure/common/lib/shared-types';
import {
    CreateProductVariantInput,
    CurrencyCode,
    LanguageCode,
    StockLevelInput,
    UpdateProductVariantInput,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition } from '../../../types/index';
import { TRANSFORM_LIMITS } from '../../../constants/index';
import { LoadStrategy } from '../../../constants/enums';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import {
    findVariantBySku,
    resolveTaxCategoryId,
    resolveStockLevels,
    resolveOptionGroups,
    resolveOptionCodes,
    resolveChannelIds,
    parseTranslationsInput,
    OptionGroupCache,
    createOptionGroupCache,
} from './shared-lookups';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getNumberValue, getObjectValue } from '../../../loaders/shared-helpers';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

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
    customFieldsField?: string;
    /** Field containing option group→value pairs (object, e.g. { size: 'S', color: 'Blue' }). Auto-creates groups and options. */
    optionGroupsField?: string;
    /** Field containing pre-existing Vendure option IDs (array, e.g. [1, 2, 3]). Passed directly. */
    optionIdsField?: string;
    /** Field containing option codes (array, e.g. ['size-s', 'color-blue']). Resolved to IDs by code lookup. */
    optionCodesField?: string;
    /** Field name for variant enabled/published flag (defaults to "enabled") */
    enabledField?: string;
    /** Record field containing channel codes (array or comma-separated string) for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing a translations array or object map for multi-language support */
    translationsField?: string;
    channel?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: LoadStrategy;
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

/**
 * Build variant translations — multi-language from record field or single-language fallback.
 */
function buildVariantTranslations(
    opCtx: RequestContext,
    rec: RecordObject,
    config: VariantHandlerConfig,
    name: string,
): Array<{ languageCode: LanguageCode; name: string }> {
    if (config.translationsField) {
        const raw = rec[config.translationsField];
        if (raw) {
            const parsed = parseTranslationsInput(raw);
            if (parsed.length > 0) {
                return parsed.map(t => ({
                    languageCode: String(t.languageCode) as LanguageCode,
                    name: String(t.name ?? name),
                }));
            }
        }
    }
    return [{ languageCode: opCtx.languageCode as LanguageCode, name }];
}

@Injectable()
export class VariantHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private productOptionGroupService: ProductOptionGroupService,
        private productOptionService: ProductOptionService,
        private requestContextService: RequestContextService,
        private taxCategoryService: TaxCategoryService,
        private channelService: ChannelService,
        private stockLocationService: StockLocationService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_VARIANT_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: unknown,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const optionCache = createOptionGroupCache();
        const channelCache = new Map<string, ID>();

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
                const customFieldsKey = config.customFieldsField ?? 'customFields';
                const optionGroupsKey = config.optionGroupsField;
                const optionIdsKey = config.optionIdsField;
                const optionCodesKey = config.optionCodesField;

                const sku = getStringValue(rec, skuKey);
                let name = getStringValue(rec, nameKey);

                // When translationsField is set and name is missing, extract from first translation
                if (!name && config.translationsField) {
                    const raw = rec[config.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0 && parsed[0].name) name = String(parsed[0].name);
                    }
                }

                if (!sku || !name) {
                    if (onRecordError) {
                        const missing = !sku ? 'sku' : 'name';
                        await onRecordError(step.key, `Missing required field "${missing}" for variantUpsert`, rec);
                    }
                    fail++;
                    continue;
                }

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
                    // Validate currency codes against the channel's available currencies.
                    // Skip unavailable currencies with a WARN rather than failing the record.
                    const availableCurrencies: CurrencyCode[] = opCtx.channel?.availableCurrencyCodes ?? [];
                    const allPriceEntries = Object.entries(priceMap);
                    const validPrices: UpdateProductVariantPriceInput[] = [];

                    for (const [cc, v] of allPriceEntries) {
                        if (availableCurrencies.length > 0 && !availableCurrencies.includes(cc as CurrencyCode)) {
                            this.logger.warn(
                                `Currency "${cc}" is not available in channel "${opCtx.channel?.code ?? 'default'}" — skipping price for variant "${sku}". Available currencies: ${availableCurrencies.join(', ')}`,
                            );
                            continue;
                        }
                        validPrices.push({
                            currencyCode: cc as CurrencyCode,
                            price: Math.round(Number(v) * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER),
                        });
                    }
                    if (validPrices.length > 0) {
                        prices = validPrices;
                    }
                }
                if (priceRaw != null) {
                    const priceValue = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
                    if (!Number.isNaN(priceValue)) priceMinor = Math.round(priceValue * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
                }

                const stockOnHand = getNumberValue(rec, stockKey);
                const customFields = getObjectValue(rec, customFieldsKey);

                const enabledKey = config.enabledField ?? 'enabled';
                const enabledRaw = rec[enabledKey];
                const enabled = enabledRaw != null
                    ? (typeof enabledRaw === 'boolean' ? enabledRaw : String(enabledRaw).toLowerCase() === 'true')
                    : undefined;

                const strategy = config.strategy ?? LoadStrategy.UPSERT;

                let variantId: ID | undefined;

                if (existingVariant) {
                    // Skip update if strategy is CREATE-only
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }

                    const translations = buildVariantTranslations(opCtx, rec, config, name);
                    await this.updateVariant(opCtx, existingVariant, translations, prices, priceMinor, stockOnHand, stockLevels, taxCategoryId, customFields, channelCode, enabled);
                    variantId = existingVariant.id;
                } else {
                    // Skip creation if strategy is UPDATE-only
                    if (strategy === LoadStrategy.UPDATE) {
                        if (onRecordError) {
                            await onRecordError(step.key, `Variant not found for update: ${sku}`, rec);
                        }
                        fail++;
                        continue;
                    }

                    // Resolve parent product from record fields: productSlug, productId, productName
                    const productId = await this.resolveProductId(opCtx, rec);
                    if (!productId) {
                        this.logger.warn(`Cannot create variant "${sku}" — no parent product found. Record should contain productSlug, productId, or productName`);
                        fail++;
                        continue;
                    }

                    const optionIds = await this.resolveAllOptionIds(
                        opCtx, rec, productId,
                        optionGroupsKey, optionIdsKey, optionCodesKey, optionCache,
                    );

                    const translations = buildVariantTranslations(opCtx, rec, config, name);
                    variantId = await this.createVariant(opCtx, productId, sku, translations, prices, priceMinor, stockOnHand, stockLevels, taxCategoryId, customFields, channelCode, optionIds, enabled);
                }

                // Dynamic per-record channel assignment
                if (config.channelsField && variantId) {
                    const rawChannels = rec[config.channelsField];
                    if (rawChannels != null) {
                        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawChannels, channelCache, this.logger);
                        if (channelIds.length > 0) {
                            try {
                                await this.channelService.assignToChannels<ProductVariant>(
                                    opCtx,
                                    ProductVariant as Type<ProductVariant>,
                                    variantId,
                                    channelIds,
                                );
                            } catch (error) {
                                this.logger.warn(`Failed to assign variant ${variantId} to record channels: ${getErrorMessage(error)}`);
                            }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'variantUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Resolve the parent product ID from record fields.
     * Checks: productSlug → productId → productName (in priority order).
     */
    private async resolveProductId(ctx: RequestContext, rec: RecordObject): Promise<ID | undefined> {
        // 1. By slug
        const slug = getStringValue(rec, 'productSlug');
        if (slug) {
            const product = await this.productService.findOneBySlug(ctx, slug);
            if (product) return product.id;
        }

        // 2. By direct ID
        const directId = rec['productId'];
        if (directId != null) {
            const product = await this.productService.findOne(ctx, directId as ID);
            if (product) return product.id;
        }

        // 3. By name
        const productName = getStringValue(rec, 'productName');
        if (productName) {
            const result = await this.productService.findAll(ctx, {
                filter: { name: { eq: productName } },
                take: 1,
            });
            if (result.totalItems > 0) return result.items[0].id;
        }

        return undefined;
    }

    /**
     * Resolve option IDs from all three input modes, merged into one array.
     * Priority: optionGroupsField (auto-create) + optionCodesField (lookup) + optionIdsField (passthrough).
     */
    private async resolveAllOptionIds(
        ctx: RequestContext,
        rec: RecordObject,
        productId: ID,
        optionGroupsKey: string | undefined,
        optionIdsKey: string | undefined,
        optionCodesKey: string | undefined,
        optionCache: OptionGroupCache,
    ): Promise<ID[] | undefined> {
        const collected: ID[] = [];

        // 1. Auto-create from key-value map: { size: 'S', color: 'Blue' }
        if (optionGroupsKey) {
            const optionsMap = getObjectValue(rec, optionGroupsKey) as Record<string, string> | undefined;
            if (optionsMap && typeof optionsMap === 'object' && Object.keys(optionsMap).length > 0) {
                const ids = await resolveOptionGroups(
                    this.productOptionGroupService, this.productOptionService,
                    this.productService, ctx, productId, optionsMap, optionCache, this.logger,
                );
                collected.push(...ids);
            }
        }

        // 2. Resolve by option codes: ['size-s', 'color-blue']
        if (optionCodesKey) {
            const codes = rec[optionCodesKey];
            if (Array.isArray(codes) && codes.length > 0) {
                const ids = await resolveOptionCodes(
                    this.productOptionService, ctx,
                    codes.map(String), optionCache, this.logger,
                );
                collected.push(...ids);
            }
        }

        // 3. Direct passthrough of existing IDs: [1, 2, 3]
        if (optionIdsKey) {
            const directIds = rec[optionIdsKey];
            if (Array.isArray(directIds) && directIds.length > 0) {
                collected.push(...directIds.map(id => id as ID));
            }
        }

        return collected.length > 0 ? collected : undefined;
    }

    /**
     * Update an existing variant
     */
    private async updateVariant(
        opCtx: RequestContext,
        existingVariant: ProductVariant,
        translations: Array<{ languageCode: LanguageCode; name: string }>,
        prices: UpdateProductVariantPriceInput[] | undefined,
        priceMinor: number | undefined,
        stockOnHand: number | undefined,
        stockLevels: StockLevelInput[] | undefined,
        taxCategoryId: ID | undefined,
        customFields: Record<string, unknown> | undefined,
        channelCode: string | undefined,
        enabled?: boolean,
    ): Promise<void> {
        const update: UpdateProductVariantInput = {
            id: existingVariant.id,
            sku: existingVariant.sku,
            translations,
            ...(typeof enabled === 'boolean' ? { enabled } : {}),
        };

        if (prices && prices.length > 0) {
            update.prices = prices;
        }
        if (typeof priceMinor === 'number') {
            update.price = priceMinor;
        }
        if (typeof stockOnHand === 'number') {
            update.stockOnHand = Math.max(0, Math.floor(stockOnHand));
        }
        if (stockLevels && stockLevels.length > 0) {
            update.stockLevels = stockLevels;
        }
        if (taxCategoryId) {
            update.taxCategoryId = taxCategoryId;
        }
        if (customFields) {
            update.customFields = customFields;
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
    }

    /**
     * Create a new variant under the given product
     */
    private async createVariant(
        opCtx: RequestContext,
        productId: ID,
        sku: string,
        translations: Array<{ languageCode: LanguageCode; name: string }>,
        prices: UpdateProductVariantPriceInput[] | undefined,
        priceMinor: number | undefined,
        stockOnHand: number | undefined,
        stockLevels: StockLevelInput[] | undefined,
        taxCategoryId: ID | undefined,
        customFields: Record<string, unknown> | undefined,
        channelCode: string | undefined,
        optionIds?: ID[],
        enabled?: boolean,
    ): Promise<ID> {
        const createInput: CreateProductVariantInput = {
            productId,
            sku,
            translations,
            ...(typeof enabled === 'boolean' ? { enabled } : {}),
        };

        if (prices && prices.length > 0) {
            createInput.prices = prices;
        }
        if (typeof priceMinor === 'number') {
            createInput.price = priceMinor;
        }
        if (typeof stockOnHand === 'number') {
            createInput.stockOnHand = Math.max(0, Math.floor(stockOnHand));
        }
        if (stockLevels && stockLevels.length > 0) {
            createInput.stockLevels = stockLevels;
        }
        if (taxCategoryId) {
            createInput.taxCategoryId = taxCategoryId;
        }
        if (customFields) {
            createInput.customFields = customFields;
        }
        if (optionIds && optionIds.length > 0) {
            createInput.optionIds = optionIds;
        }

        const [created] = await this.productVariantService.create(opCtx, [createInput]);

        if (channelCode) {
            try {
                await this.channelService.assignToChannels<ProductVariant>(
                    opCtx,
                    ProductVariant as Type<ProductVariant>,
                    created.id,
                    [opCtx.channelId]
                );
            } catch (error) {
                this.logger.warn(`Failed to assign created variant ${created.id} to channel: ${getErrorMessage(error)}`);
            }
        }

        return created.id;
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
