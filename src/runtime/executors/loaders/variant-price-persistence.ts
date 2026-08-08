import { ID, ProductVariantService, RequestContext } from '@vendure/core';
import {
    CurrencyCode,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';

export type VariantCurrencyPrice = Pick<
    UpdateProductVariantPriceInput,
    'currencyCode' | 'price'
>;

export function resolveDefaultCurrencyPrice(
    ctx: RequestContext,
    prices: readonly VariantCurrencyPrice[],
): number {
    const defaultCurrencyCode = ctx.channel.defaultCurrencyCode;
    const defaultPrice = prices.find(price => price.currencyCode === defaultCurrencyCode);
    if (!defaultPrice) {
        throw new Error(
            `Currency prices must include the channel default currency "${defaultCurrencyCode}"`,
        );
    }
    return defaultPrice.price;
}

export async function persistVariantCurrencyPrices(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    variantId: ID,
    prices: readonly VariantCurrencyPrice[],
): Promise<void> {
    if (prices.length === 0) {
        return;
    }
    await productVariantService.update(ctx, [{
        id: variantId,
        prices: prices.map(price => ({
            currencyCode: price.currencyCode as CurrencyCode,
            price: price.price,
        })),
    }]);
}
