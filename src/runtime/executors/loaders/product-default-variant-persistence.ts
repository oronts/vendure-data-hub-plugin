import {
    ChannelService,
    ID,
    LanguageCode,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    StockLocationService,
    TaxCategoryService,
} from '@vendure/core';
import {
    CreateProductVariantInput,
    CurrencyCode,
    ProductVariantTranslationInput,
    StockLevelInput,
    UpdateProductVariantInput,
} from '@vendure/common/lib/generated-types';
import { ProductUpsertLoaderConfig } from '../../../types';
import { ConflictStrategy, LoadStrategy } from '../../../constants/enums';
import { DataHubLogger } from '../../../services/logger/datahub-logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { CoercedProductFields } from './types';
import { assertCreateDuplicateCanBeSkipped } from './duplicate-handling';
import { resolveStockLevels, resolveTaxCategoryId } from './shared-lookups';
import { buildVariantPrices, buildVariantStockFields } from './product-record-fields';
import {
    persistVariantCurrencyPrices,
    resolveDefaultCurrencyPrice,
} from './variant-price-persistence';

export interface DefaultProductVariantPersistenceContext {
    sourceContext: RequestContext;
    operationContext: RequestContext;
    stepKey: string;
    productId: ID;
    config: ProductUpsertLoaderConfig;
    fields: CoercedProductFields;
    existingVariant?: ProductVariant;
}

export interface DefaultProductVariantPersistenceDependencies {
    productVariantService: ProductVariantService;
    taxCategoryService: TaxCategoryService;
    stockLocationService: StockLocationService;
    channelService: ChannelService;
    logger: DataHubLogger;
}

export async function persistDefaultProductVariant(
    context: DefaultProductVariantPersistenceContext,
    dependencies: DefaultProductVariantPersistenceDependencies,
): Promise<void> {
    const {
        sourceContext,
        operationContext,
        stepKey,
        productId,
        config,
        fields,
        existingVariant,
    } = context;
    const { sku, name, priceByCurrency } = fields;

    if (!sku) return;

    const strategy = config.strategy ?? LoadStrategy.UPSERT;
    const conflictResolution = config.conflictStrategy ?? ConflictStrategy.SOURCE_WINS;
    if (existingVariant && strategy === LoadStrategy.CREATE) {
        assertCreateDuplicateCanBeSkipped(config, 'variant', sku);
        return;
    }

    const taxCategoryId = await resolveTaxCategoryId(
        dependencies.taxCategoryService,
        operationContext,
        config.taxCategoryName,
        dependencies.logger,
    );
    const stockLevels = await resolveStockLevels(
        dependencies.stockLocationService,
        operationContext,
        fields.stockByLocation,
        dependencies.logger,
    );
    assertAvailableCurrencies(operationContext, priceByCurrency);

    const translation: ProductVariantTranslationInput = {
        languageCode: sourceContext.languageCode as LanguageCode,
        name: name!,
    };
    const shouldUpdate = existingVariant
        && strategy !== LoadStrategy.CREATE
        && conflictResolution !== ConflictStrategy.VENDURE_WINS;
    const shouldCreate = !existingVariant && strategy !== LoadStrategy.UPDATE;

    if (shouldUpdate && existingVariant) {
        await updateExistingVariant(
            operationContext,
            stepKey,
            existingVariant,
            translation,
            taxCategoryId,
            stockLevels,
            fields,
            config.channel,
            dependencies,
        );
        return;
    }
    if (shouldCreate) {
        await createNewVariant(
            operationContext,
            stepKey,
            productId,
            sku,
            translation,
            taxCategoryId,
            fields,
            config.channel,
            dependencies,
        );
    }
}

function assertAvailableCurrencies(
    context: RequestContext,
    priceByCurrency: Record<string, number> | undefined,
): void {
    if (!priceByCurrency) return;
    const availableCurrencies = context.channel?.availableCurrencyCodes ?? [];
    const unavailableCurrencies = Object.keys(priceByCurrency)
        .filter(code => availableCurrencies.length > 0
            && !availableCurrencies.includes(code as CurrencyCode));
    if (unavailableCurrencies.length > 0) {
        throw new Error(
            `Currencies not available in channel "${context.channel?.code ?? 'default'}": ${unavailableCurrencies.join(', ')}`,
        );
    }
}

async function updateExistingVariant(
    context: RequestContext,
    stepKey: string,
    existingVariant: ProductVariant,
    translation: ProductVariantTranslationInput,
    taxCategoryId: ID | undefined,
    stockLevels: StockLevelInput[] | undefined,
    fields: CoercedProductFields,
    targetChannel: string | undefined,
    dependencies: DefaultProductVariantPersistenceDependencies,
): Promise<void> {
    const input = buildUpdateVariantInput(
        existingVariant.id,
        translation,
        taxCategoryId,
        stockLevels,
        fields,
    );
    const updatedVariants = await dependencies.productVariantService.update(context, [input]);
    if (targetChannel && updatedVariants.length > 0) {
        await assignUpdatedVariantToChannel(
            context,
            stepKey,
            existingVariant,
            updatedVariants[0].id,
            targetChannel,
            dependencies,
        );
    }
}

function buildUpdateVariantInput(
    variantId: ID,
    translation: ProductVariantTranslationInput,
    taxCategoryId: ID | undefined,
    stockLevels: StockLevelInput[] | undefined,
    fields: CoercedProductFields,
): UpdateProductVariantInput {
    const priceFields = buildVariantPrices(fields.priceMinor, fields.priceByCurrency);
    const stockFields = buildVariantStockFields(
        fields.stockOnHand,
        stockLevels,
        fields.trackInventory,
    );
    return {
        id: variantId,
        translations: [translation],
        ...priceFields,
        ...stockFields,
        ...(taxCategoryId ? { taxCategoryId } : {}),
        ...(fields.customFields ? { customFields: fields.customFields } : {}),
    };
}

async function createNewVariant(
    context: RequestContext,
    stepKey: string,
    productId: ID,
    sku: string,
    translation: ProductVariantTranslationInput,
    taxCategoryId: ID | undefined,
    fields: CoercedProductFields,
    targetChannel: string | undefined,
    dependencies: DefaultProductVariantPersistenceDependencies,
): Promise<void> {
    const stockLevels = await resolveStockLevels(
        dependencies.stockLocationService,
        context,
        fields.stockByLocation,
        dependencies.logger,
    );
    const currencyPrices = fields.priceByCurrency
        ? buildVariantPrices(undefined, fields.priceByCurrency).prices
        : undefined;
    const createPrice = currencyPrices
        ? resolveDefaultCurrencyPrice(context, currencyPrices)
        : fields.priceMinor;
    const input = buildCreateVariantInput(
        productId,
        sku,
        translation,
        taxCategoryId,
        createPrice,
        stockLevels,
        fields,
    );
    const createdVariants = await dependencies.productVariantService.create(context, [input]);
    const createdVariant = createdVariants[0];
    if (!createdVariant) return;

    if (currencyPrices) {
        await persistVariantCurrencyPrices(
            dependencies.productVariantService,
            context,
            createdVariant.id,
            currencyPrices,
        );
    }
    if (targetChannel) {
        await assignCreatedVariantToChannel(
            context,
            stepKey,
            createdVariant.id,
            targetChannel,
            dependencies,
        );
    }
}

function buildCreateVariantInput(
    productId: ID,
    sku: string,
    translation: ProductVariantTranslationInput,
    taxCategoryId: ID | undefined,
    price: number | undefined,
    stockLevels: StockLevelInput[] | undefined,
    fields: CoercedProductFields,
): CreateProductVariantInput {
    const stockFields = buildVariantStockFields(
        fields.stockOnHand,
        stockLevels,
        fields.trackInventory,
    );
    return {
        productId,
        sku,
        translations: [translation],
        ...(typeof price === 'number' ? { price } : {}),
        ...stockFields,
        ...(taxCategoryId ? { taxCategoryId } : {}),
        ...(fields.customFields ? { customFields: fields.customFields } : {}),
    };
}

async function assignCreatedVariantToChannel(
    context: RequestContext,
    stepKey: string,
    variantId: ID,
    targetChannel: string,
    dependencies: DefaultProductVariantPersistenceDependencies,
): Promise<void> {
    try {
        await dependencies.channelService.assignToChannels(
            context,
            ProductVariant,
            variantId,
            [context.channelId],
        );
    } catch (error) {
        dependencies.logger.warn('Failed to assign created variant to target channel', {
            stepKey,
            variantId,
            targetChannel,
            error: getErrorMessage(error),
        });
        throw error;
    }
}

async function assignUpdatedVariantToChannel(
    context: RequestContext,
    stepKey: string,
    existingVariant: ProductVariant,
    updatedVariantId: ID,
    targetChannel: string,
    dependencies: DefaultProductVariantPersistenceDependencies,
): Promise<void> {
    try {
        const variantWithChannels = existingVariant as ProductVariant & {
            channels?: Array<{ id: ID }>;
        };
        const alreadyAssigned = variantWithChannels.channels?.some(
            channel => channel.id === context.channelId,
        ) ?? false;
        if (!alreadyAssigned) {
            await dependencies.channelService.assignToChannels(
                context,
                ProductVariant,
                updatedVariantId,
                [context.channelId],
            );
        }
    } catch (error) {
        dependencies.logger.warn('Failed to assign updated variant to target channel', {
            stepKey,
            variantId: updatedVariantId,
            targetChannel,
            error: getErrorMessage(error),
        });
        throw error;
    }
}
