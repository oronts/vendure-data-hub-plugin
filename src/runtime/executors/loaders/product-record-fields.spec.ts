import { describe, expect, it } from 'vitest';
import { CurrencyCode, GlobalFlag } from '@vendure/common/lib/generated-types';
import {
    buildVariantPrices,
    buildVariantStockFields,
    coerceProductFields,
    parseFacetValueCodes,
} from './product-record-fields';

describe('product record fields', () => {
    it('derives slug and SKU while converting scalar prices', () => {
        expect(coerceProductFields({
            name: 'Clean Product',
            price: '12.345',
        }, undefined, 2)).toEqual({
            name: 'Clean Product',
            description: undefined,
            slug: 'clean-product',
            sku: 'CLEAN-PRODUCT',
            priceMinor: 1235,
            priceByCurrency: undefined,
            trackInventory: undefined,
            stockOnHand: undefined,
            stockByLocation: undefined,
            customFields: undefined,
            enabled: undefined,
        });
    });

    it('normalizes explicit currency maps with configured precision', () => {
        const fields = coerceProductFields({
            name: 'Product',
            prices: { usd: 12.34, EUR: '10.50' },
        }, {
            adapterCode: 'productUpsert',
            priceByCurrencyField: 'prices',
        }, 3);

        expect(fields.priceMinor).toBeUndefined();
        expect(fields.priceByCurrency).toEqual({ USD: 12340, EUR: 10500 });
    });

    it('accepts an inline price map', () => {
        expect(coerceProductFields({
            name: 'Product',
            price: { USD: 8, EUR: 7.5 },
        }, undefined, 2).priceByCurrency).toEqual({
            USD: 800,
            EUR: 750,
        });
    });

    it('rejects conflicting, empty, invalid, and negative currency prices', () => {
        expect(() => coerceProductFields({
            price: 1,
            prices: { USD: 1 },
        }, {
            adapterCode: 'productUpsert',
            priceByCurrencyField: 'prices',
        }, 2)).toThrow('Configure either priceField or priceByCurrencyField data, not both');
        expect(() => coerceProductFields({ price: {} }, undefined, 2))
            .toThrow('Price map cannot be empty');
        expect(() => coerceProductFields({ price: { INVALID: 1 } }, undefined, 2))
            .toThrow('Invalid currency code "INVALID"');
        expect(() => coerceProductFields({ price: -1 }, undefined, 2))
            .toThrow('Price cannot be negative');
    });

    it('normalizes stock, inventory, enabled, and custom fields', () => {
        const fields = coerceProductFields({
            stock: -2.4,
            locations: { Berlin: '4.9', Hamburg: -1, Invalid: 'not-a-number' },
            published: 'TRUE',
            custom: { source: 'erp' },
        }, {
            adapterCode: 'productUpsert',
            stockField: 'stock',
            stockByLocationField: 'locations',
            trackInventory: 'true',
            enabledField: 'published',
            customFieldsField: 'custom',
        }, 2);

        expect(fields).toMatchObject({
            stockOnHand: 0,
            stockByLocation: { Berlin: 4, Hamburg: 0 },
            trackInventory: true,
            enabled: true,
            customFields: { source: 'erp' },
        });
    });

    it('builds Vendure variant price and stock inputs without empty arrays', () => {
        expect(buildVariantPrices(100, { USD: 100, EUR: 90 })).toEqual({
            price: 100,
            prices: [
                { currencyCode: CurrencyCode.USD, price: 100 },
                { currencyCode: CurrencyCode.EUR, price: 90 },
            ],
        });
        expect(buildVariantStockFields(3, [], false)).toEqual({
            stockOnHand: 3,
            trackInventory: GlobalFlag.FALSE,
        });
    });

    it('parses facet codes and rejects malformed entries', () => {
        expect(parseFacetValueCodes([' red ', { code: ' blue ' }]))
            .toEqual(['red', 'blue']);
        expect(parseFacetValueCodes(undefined)).toBeUndefined();
        expect(() => parseFacetValueCodes('red'))
            .toThrow('Product facet values must be an array');
        expect(() => parseFacetValueCodes([{ name: 'Red' }]))
            .toThrow('Invalid product facet value at index 0');
    });
});
