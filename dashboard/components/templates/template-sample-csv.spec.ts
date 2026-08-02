import { describe, expect, it } from 'vitest';
import { buildTemplateSampleCsv } from './template-sample-csv';

describe('buildTemplateSampleCsv', () => {
    it('escapes delimiters, quotes, and line breaks consistently', () => {
        expect(buildTemplateSampleCsv({
            requiredFields: ['sku', 'name'],
            optionalFields: ['description'],
            sampleData: [{
                sku: 'SKU-1',
                name: 'Large, "Blue" Shirt',
                description: 'First line\nSecond line',
            }],
        })).toBe(
            'sku,name,description\nSKU-1,"Large, ""Blue"" Shirt","First line\nSecond line"',
        );
    });

    it('preserves field order and emits empty cells for absent values', () => {
        expect(buildTemplateSampleCsv({
            requiredFields: ['sku'],
            optionalFields: ['name'],
            sampleData: [{ sku: 'SKU-1' }],
        })).toBe('sku,name\nSKU-1,');
    });
});
