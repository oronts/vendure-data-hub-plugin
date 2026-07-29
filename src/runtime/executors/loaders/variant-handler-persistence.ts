import {
    CreateProductVariantInput,
    LanguageCode,
    StockLevelInput,
    UpdateProductVariantInput,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';
import {
    ID,
    ProductVariant,
    ProductVariantService,
    RequestContext,
} from '@vendure/core';
import { DataHubLogger } from '../../../services/logger/datahub-logger';
import { getErrorMessage } from '../../../utils/error.utils';
import {
    persistVariantCurrencyPrices,
    resolveDefaultCurrencyPrice,
} from './variant-price-persistence';

export interface VariantWriteValues {
    translations: Array<{ languageCode: LanguageCode; name: string }>;
    prices?: UpdateProductVariantPriceInput[];
    priceMinor?: number;
    stockOnHand?: number;
    stockLevels?: StockLevelInput[];
    taxCategoryId?: ID;
    customFields?: Record<string, unknown>;
    enabled?: boolean;
}

interface VariantPersistenceServices {
    productVariantService: ProductVariantService;
    logger: DataHubLogger;
}

export async function updateVariant(
    services: VariantPersistenceServices,
    ctx: RequestContext,
    existingVariant: ProductVariant,
    values: VariantWriteValues,
): Promise<void> {
    await services.productVariantService.update(ctx, [
        buildUpdateInput(existingVariant, values),
    ]);
}

export async function createVariant(
    services: VariantPersistenceServices,
    ctx: RequestContext,
    productId: ID,
    sku: string,
    values: VariantWriteValues,
    optionIds?: ID[],
): Promise<ID> {
    const [created] = await services.productVariantService.create(ctx, [
        buildCreateInput(ctx, productId, sku, values, optionIds),
    ]);
    if (values.prices && values.prices.length > 0) {
        await persistVariantCurrencyPrices(
            services.productVariantService,
            ctx,
            created.id,
            values.prices,
        );
    }
    return created.id;
}

export async function assignVariantToChannel(
    services: VariantPersistenceServices,
    ctx: RequestContext,
    variantId: ID,
    targetChannelId: ID,
): Promise<void> {
    try {
        await services.productVariantService.assignProductVariantsToChannel(ctx, {
            channelId: targetChannelId,
            productVariantIds: [variantId],
        });
    } catch (error) {
        services.logger.warn('Failed to assign variant to target channel', {
            variantId,
            channelId: targetChannelId,
            error: getErrorMessage(error),
        });
        throw error;
    }
}

export async function persistVariantContextPrice(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    variantId: ID,
    values: Pick<VariantWriteValues, 'priceMinor' | 'prices'>,
): Promise<void> {
    if (values.prices && values.prices.length > 0) {
        await persistVariantCurrencyPrices(productVariantService, ctx, variantId, values.prices);
    } else if (typeof values.priceMinor === 'number') {
        await productVariantService.update(ctx, [{ id: variantId, price: values.priceMinor }]);
    }
}

function buildUpdateInput(
    existingVariant: ProductVariant,
    values: VariantWriteValues,
): UpdateProductVariantInput {
    const input: UpdateProductVariantInput = {
        id: existingVariant.id,
        sku: existingVariant.sku,
        translations: values.translations,
        ...(typeof values.enabled === 'boolean' ? { enabled: values.enabled } : {}),
    };
    applyVariantWriteValues(input, values);
    return input;
}

function buildCreateInput(
    ctx: RequestContext,
    productId: ID,
    sku: string,
    values: VariantWriteValues,
    optionIds?: ID[],
): CreateProductVariantInput {
    const input: CreateProductVariantInput = {
        productId,
        sku,
        translations: values.translations,
        ...(typeof values.enabled === 'boolean' ? { enabled: values.enabled } : {}),
    };
    applyVariantWriteValues(input, values);
    if (optionIds && optionIds.length > 0) input.optionIds = optionIds;
    if (values.prices && values.prices.length > 0) {
        input.price = resolveDefaultCurrencyPrice(ctx, values.prices);
    }
    return input;
}

function applyVariantWriteValues(
    input: CreateProductVariantInput | UpdateProductVariantInput,
    values: VariantWriteValues,
): void {
    if (values.prices && values.prices.length > 0) {
        if ('id' in input) input.prices = values.prices;
    } else if (typeof values.priceMinor === 'number') {
        input.price = values.priceMinor;
    }
    if (typeof values.stockOnHand === 'number') {
        input.stockOnHand = Math.max(0, Math.floor(values.stockOnHand));
    }
    if (values.stockLevels && values.stockLevels.length > 0) input.stockLevels = values.stockLevels;
    if (values.taxCategoryId) input.taxCategoryId = values.taxCategoryId;
    if (values.customFields) input.customFields = values.customFields;
}
