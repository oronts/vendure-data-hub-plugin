import { describe, expect, it } from 'vitest';
import { parseCSVLine } from '../../../shared/utils/csv-parse';
import { validateFeedConfig } from '../feed-config.validation';
import { generateCSVFeed } from './csv-feed.generator';
import { generateJSONFeed } from './json-feed.generator';
import type { FeedConfig, VariantWithCustomFields } from './feed-types';

const variant = {
    id: 1,
    sku: 'SKU-1',
    name: 'Variant name',
    priceWithTax: 1000,
    currencyCode: 'USD',
    saleableStockLevel: 1,
    customFields: {},
    options: [],
    product: {
        id: 10,
        slug: 'safe-product',
        name: 'Product name',
        description: 'Description',
        enabled: true,
        customFields: {},
        facetValues: [],
        assets: [],
    },
} as unknown as VariantWithCustomFields;

function config(
    format: FeedConfig['format'],
    fieldMappings: NonNullable<FeedConfig['fieldMappings']>,
): FeedConfig {
    return {
        code: 'mapped-feed',
        name: 'Mapped feed',
        format,
        fieldMappings,
        options: { baseUrl: 'https://shop.example.com', currency: 'USD' },
    };
}

describe('built-in feed field mappings', () => {
    it('applies CSV defaults for missing source values', async () => {
        const content = await generateCSVFeed(
            {} as never,
            [variant],
            config('csv', {
                missing: { source: 'customFields.missing', default: 'fallback' },
                zero: { source: 'customFields.zero', default: 0 },
                disabled: { source: 'customFields.disabled', default: false },
            }),
            {} as never,
            2,
        );

        const [headers, values] = content.split('\n').map(row => parseCSVLine(row));
        expect(headers).toEqual(['missing', 'zero', 'disabled']);
        expect(values).toEqual(['fallback', '0', 'false']);
    });

    it('applies persisted mappings to the built-in JSON generator', async () => {
        const content = await generateJSONFeed(
            {} as never,
            [variant],
            config('json', {
                merchant_title: 'product.name',
                fallback: { source: 'product.customFields.absent', default: 'default value' },
            }),
            {} as never,
            2,
        );

        const output = JSON.parse(content) as {
            items: Array<Record<string, unknown>>;
        };
        expect(output.items[0].merchant_title).toBe('Product name');
        expect(output.items[0].fallback).toBe('default value');
    });

    it('rejects mappings for built-in formats that cannot execute them', () => {
        expect(() => validateFeedConfig(
            config('xml', { title: 'product.name' }),
            new Map(),
        )).toThrow('fieldMappings are not supported for xml feeds');
    });
});
