import { describe, expect, it } from 'vitest';
import {
    FeedFieldMappings,
    formatFeedAmount,
    formatFeedPrice,
    mapToFeedItem,
} from './feed-handler.types';

function fields(overrides: Partial<FeedFieldMappings> = {}): FeedFieldMappings {
    return {
        titleField: 'name',
        descriptionField: 'description',
        priceField: 'price',
        imageField: 'image',
        linkField: 'link',
        brandField: 'brand',
        gtinField: 'gtin',
        availabilityField: 'availability',
        currency: 'USD',
        priceUnit: 'MINOR',
        pricePrecision: 2,
        ...overrides,
    };
}

describe('feed price formatting', () => {
    it('formats Vendure minor units as a major-unit feed price', () => {
        expect(formatFeedPrice(2999, fields())).toBe('29.99 USD');
        expect(mapToFeedItem({ id: 'SKU-1', price: 2999 }, fields()).price).toBe('29.99 USD');
    });

    it('uses Vendure MoneyStrategy precision for minor units', () => {
        expect(formatFeedPrice(12340, fields({ pricePrecision: 3 }))).toBe('12.340 USD');
    });

    it('supports explicitly declared major-unit source values', () => {
        expect(formatFeedAmount('19.99', fields({ priceUnit: 'MAJOR' }))).toBe('19.99');
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 'invalid'])(
        'rejects invalid feed price %s',
        value => {
            expect(() => formatFeedPrice(value, fields())).toThrow();
        },
    );
});
