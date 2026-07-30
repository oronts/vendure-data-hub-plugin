import { describe, expect, it } from 'vitest';
import { TRUNCATION } from '../../constants';
import { validateAutoMapperConfig } from './auto-mapper-config.types';

describe('validateAutoMapperConfig', () => {
    it('accepts bounded string aliases and exclusions', () => {
        expect(validateAutoMapperConfig({
            customAliases: { sku: ['stock_code', 'article_number'] },
            excludeFields: ['internalNotes'],
        })).toMatchObject({ valid: true, errors: [] });
    });

    it('rejects malformed JSON values before they reach string matching', () => {
        const result = validateAutoMapperConfig({
            customAliases: { sku: ['stock_code', 17] } as never,
            excludeFields: ['internalNotes', { field: 'secret' }] as never,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            'customAliases[sku] must contain valid field-name strings',
            'excludeFields must contain valid field-name strings',
        ]));
    });

    it('rejects non-object aliases, non-finite scores, and oversized names', () => {
        const result = validateAutoMapperConfig({
            confidenceThreshold: Number.NaN,
            weightNameSimilarity: Number.POSITIVE_INFINITY,
            customAliases: [] as never,
            excludeFields: ['x'.repeat(TRUNCATION.MAX_AUTOMAPPER_FIELD_NAME_LENGTH + 1)],
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            'confidenceThreshold must be between 0 and 1',
            'weightNameSimilarity must be between 0 and 1',
            'customAliases must be an object',
            'excludeFields must contain valid field-name strings',
        ]));
    });
});
