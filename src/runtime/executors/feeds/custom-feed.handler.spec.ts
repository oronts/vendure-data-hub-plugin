import { describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../../../services/logger';
import {
    customFeedHandler,
    resolveCustomFeedFieldMapping,
    resolveCustomFeedFormat,
} from './custom-feed.handler';
import type { FeedFieldMappings } from './feed-handler.types';

const fields = {
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
} satisfies FeedFieldMappings;

describe('custom feed format contract', () => {
    it.each([
        ['json', 'JSON'],
        ['CSV', 'CSV'],
        ['tsv', 'TSV'],
        ['Xml', 'XML'],
    ])('normalizes %s', (value, expected) => {
        expect(resolveCustomFeedFormat(value)).toBe(expected);
    });

    it.each([undefined, null, '', 'NDJSON', 'PDF', 42, {}])('rejects unsupported format %s', value => {
        expect(() => resolveCustomFeedFormat(value)).toThrow(
            'Custom feed format must be JSON, CSV, TSV, or XML',
        );
    });

    it('reports invalid format as a record failure without writing a file', async () => {
        const onRecordError = vi.fn(async () => undefined);

        await expect(customFeedHandler({
            stepKey: 'custom-feed',
            config: { format: 'PDF' } as never,
            records: [{ sku: 'SKU-1' }],
            fields,
            onRecordError,
            logger: {} as DataHubLogger,
        })).resolves.toEqual({ ok: 0, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'custom-feed',
            'Custom feed format must be JSON, CSV, TSV, or XML',
            {},
        );
    });
});

describe('custom feed field mapping contract', () => {
    it('accepts an explicit output-to-source mapping', () => {
        expect(resolveCustomFeedFieldMapping({
            sku: 'sku',
            title: 'product.name',
        })).toEqual({
            sku: 'sku',
            title: 'product.name',
        });
    });

    it.each([
        undefined,
        null,
        [],
        {},
        { '': 'sku' },
        { sku: '' },
        { ' sku': 'sku' },
        { sku: 'sku ' },
        { sku: 42 },
    ])('rejects invalid field mapping %#', value => {
        expect(() => resolveCustomFeedFieldMapping(value)).toThrow(
            'Custom feed fieldMapping must map non-empty output fields to source paths',
        );
    });

    it('fails closed when a direct pipeline omits the required mapping', async () => {
        const onRecordError = vi.fn(async () => undefined);

        await expect(customFeedHandler({
            stepKey: 'custom-feed',
            config: { format: 'JSON' } as never,
            records: [{ sku: 'SKU-1', internalCost: 1234 }],
            fields,
            onRecordError,
            logger: {} as DataHubLogger,
        })).resolves.toEqual({ ok: 0, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'custom-feed',
            'Custom feed fieldMapping must map non-empty output fields to source paths',
            {},
        );
    });
});
