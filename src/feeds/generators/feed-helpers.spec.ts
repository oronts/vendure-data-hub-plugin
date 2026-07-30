import { describe, expect, it } from 'vitest';
import { VariantWithCustomFields } from './feed-types';
import {
    buildProductUrl,
    csvEscape,
    formatPrice,
    getFeedBaseUrl,
    getFeedStockQuantity,
    getImageUrl,
    getSaleableStockLevel,
} from './feed-helpers';

describe('feed base URL', () => {
    it('normalizes the configured storefront URL without inventing a host', () => {
        expect(getFeedBaseUrl({
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: 'https://shop.example.com/' },
        })).toBe('https://shop.example.com');
        expect(() => getFeedBaseUrl({
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
        })).toThrow('baseUrl is required for built-in feed formats');
    });
});

describe('feed product URL', () => {
    it('encodes product, variant, and tracking values as distinct URL components', () => {
        const variant = {
            id: 42,
            sku: 'SKU &?/+',
            product: { slug: 'summer/shirt' },
        } as unknown as VariantWithCustomFields;

        expect(buildProductUrl(
            'https://shop.example.com',
            variant,
            { utm_source: 'catalog & sale' },
        )).toBe(
            'https://shop.example.com/product/summer%2Fshirt?variant=SKU+%26%3F%2F%2B&utm_source=catalog+%26+sale',
        );
    });
});

describe('delimited feed escaping', () => {
    it('quotes the active delimiter, CR/LF, and embedded quotes', () => {
        expect(csvEscape('value\tother', '\t')).toBe('"value\tother"');
        expect(csvEscape('line\rreturn', '\t')).toBe('"line\rreturn"');
        expect(csvEscape('say "hello"', '\t')).toBe('"say ""hello"""');
        expect(csvEscape('plain', '\t')).toBe('plain');
    });
});

describe('feed stock helpers', () => {
    it('uses the Vendure saleable stock result', () => {
        const variant = {
            saleableStockLevel: 11,
        } as unknown as VariantWithCustomFields;

        expect(getSaleableStockLevel(variant)).toBe(11);
        expect(getFeedStockQuantity(variant)).toBe(11);
    });

    it('fails closed when Vendure stock was not resolved', () => {
        const variant = {} as VariantWithCustomFields;

        expect(getSaleableStockLevel(variant)).toBe(0);
    });

    it('does not serialize Vendure untracked inventory as a huge quantity', () => {
        const variant = {
            saleableStockLevel: Number.MAX_SAFE_INTEGER,
        } as VariantWithCustomFields;

        expect(getSaleableStockLevel(variant)).toBe(Number.MAX_SAFE_INTEGER);
        expect(getFeedStockQuantity(variant)).toBeNull();
    });

    it('clamps negative saleable stock to zero', () => {
        const variant = { saleableStockLevel: -4 } as VariantWithCustomFields;

        expect(getSaleableStockLevel(variant)).toBe(0);
    });
});

describe('feed image URL', () => {
    const variant = {
        featuredAsset: {
            source: 'source/product.jpg',
            preview: 'preview/product.jpg',
        },
    } as VariantWithCustomFields;

    it('uses the Vendure preview by default', () => {
        expect(getImageUrl(variant, undefined, 'https://shop.example')).toBe(
            'https://shop.example/assets/preview/product.jpg',
        );
    });

    it('uses the original source only when explicitly requested', () => {
        expect(getImageUrl(variant, undefined, 'https://shop.example', 'original')).toBe(
            'https://shop.example/assets/source/product.jpg',
        );
    });
});

describe('formatPrice', () => {
    it('formats two-decimal Vendure minor units', () => {
        expect(formatPrice(2999, 'usd', 2)).toBe('29.99 USD');
    });

    it('uses the configured three-decimal precision', () => {
        expect(formatPrice(1234, 'EUR', 3)).toBe('1.234 EUR');
    });

    it('rejects invalid minor units and currency codes', () => {
        expect(formatPrice(12.5, 'USD', 2)).toBeNull();
        expect(formatPrice(100, 'EURO', 2)).toBeNull();
    });
});
