import { describe, expect, it } from 'vitest';
import { validateEnrichmentConfig } from './enrichment-config.validator';

describe('validateEnrichmentConfig', () => {
    it.each([
        [{ defaults: { currency: 'EUR' } }, 'STATIC'],
        [{ sourceType: 'STATIC', set: { source: 'sync' } }, 'STATIC'],
        [{ sourceType: 'STATIC', computed: { label: '${name}' } }, 'STATIC'],
        [{ sourceType: 'HTTP', url: 'https://api.example.com/{{id}}' }, 'HTTP'],
        [{
            sourceType: 'VENDURE',
            entityType: 'PRODUCT_VARIANT',
            sourceField: 'sku',
            lookupField: 'sku',
        }, 'VENDURE'],
    ])('accepts valid config %#', (config, sourceType) => {
        expect(validateEnrichmentConfig(config)).toEqual({ sourceType, issues: [] });
    });

    it.each([
        {},
        { sourceType: 'STATIC' },
        { sourceType: 'STATIC', defaults: {}, set: {}, computed: {} },
    ])('rejects empty static config %#', config => {
        expect(validateEnrichmentConfig(config).issues).toContainEqual(
            expect.objectContaining({ errorCode: expect.stringMatching(/enrichment/) }),
        );
    });

    it.each(['API', 'http', 42])('rejects unsupported source type %s', sourceType => {
        expect(validateEnrichmentConfig({ sourceType }).issues).toContainEqual(
            expect.objectContaining({
                field: 'sourceType',
                errorCode: 'invalid-enrichment-source-type',
            }),
        );
    });

    it.each([undefined, '', '   ', 42])('rejects invalid HTTP URL %s', url => {
        expect(validateEnrichmentConfig({ sourceType: 'HTTP', url }).issues).toContainEqual(
            expect.objectContaining({ field: 'url' }),
        );
    });

    it.each(['entityType', 'sourceField', 'lookupField'] as const)(
        'requires VENDURE field %s',
        field => {
            const config: Record<string, unknown> = {
                sourceType: 'VENDURE',
                entityType: 'PRODUCT',
                sourceField: 'sku',
                lookupField: 'sku',
            };
            config[field] = ' ';
            expect(validateEnrichmentConfig(config).issues).toContainEqual(
                expect.objectContaining({ field }),
            );
        },
    );

    it('rejects malformed mutation maps and computed values', () => {
        const result = validateEnrichmentConfig({
            sourceType: 'STATIC',
            defaults: [],
            set: 'invalid',
            computed: { valid: '${id}', invalid: 42 },
        });
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'defaults' }),
            expect.objectContaining({ field: 'set' }),
            expect.objectContaining({ field: 'computed.invalid' }),
        ]));
    });
});
