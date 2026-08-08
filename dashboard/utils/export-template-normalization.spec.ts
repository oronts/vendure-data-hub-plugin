import { describe, expect, it } from 'vitest';
import { normalizeExportEntityType, normalizeExportTemplate } from './export-template-normalization';

describe('export template normalization', () => {
    it.each([
        ['ProductVariant', 'PRODUCT_VARIANT'],
        ['product-variant', 'PRODUCT_VARIANT'],
        ['product variant', 'PRODUCT_VARIANT'],
        ['PRODUCT_VARIANT', 'PRODUCT_VARIANT'],
    ])('normalizes entity type %s', (input, expected) => {
        expect(normalizeExportEntityType(input)).toBe(expected);
    });

    it('maps the public string field contract and top-level format', () => {
        expect(normalizeExportTemplate({
            id: 'products',
            name: 'Products',
            description: 'Product export',
            format: 'csv',
            definition: {
                sourceEntity: 'Product',
                fields: ['id', 'name'],
                formatOptions: { delimiter: ';' },
            },
        })).toEqual({
            id: 'products',
            name: 'Products',
            description: 'Product export',
            icon: undefined,
            format: 'CSV',
            requiredFields: [],
            tags: undefined,
            definition: {
                sourceEntity: 'PRODUCT',
                fields: [
                    { sourceField: 'id', outputName: 'id' },
                    { sourceField: 'name', outputName: 'name' },
                ],
                formatOptions: { delimiter: ';' },
            },
        });
    });

    it('ignores malformed optional definition values', () => {
        expect(normalizeExportTemplate({
            id: 'minimal',
            name: 'Minimal',
            description: 'Minimal export',
            format: 'JSON',
            definition: { sourceEntity: 42, fields: [{ sourceField: 'id' }] },
        }).definition).toBeUndefined();
    });
});
