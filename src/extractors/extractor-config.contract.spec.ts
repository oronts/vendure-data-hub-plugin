import { describe, expect, it } from 'vitest';
import {
    assertCanonicalExtractorConfig,
    findLegacyExtractorField,
} from './extractor-config.contract';

describe('extractor configuration contract', () => {
    it('accepts canonical HTTP fields', () => {
        expect(findLegacyExtractorField('httpApi', {
            url: 'https://example.test/products',
            dataPath: 'data.items',
            pagination: { type: 'OFFSET', limit: 100 },
            retry: { maxAttempts: 3 },
        })).toBeUndefined();
    });

    it.each([
        'itemsField',
        'paginationType',
        'pageParam',
        'nextPageField',
        'maxPages',
        'retries',
        'bearerTokenSecretCode',
        'basicSecretCode',
        'hmacSecretCode',
    ])(
        'rejects the HTTP alias %s',
        field => {
            expect(() => assertCanonicalExtractorConfig('httpApi', { [field]: 'value' }))
                .toThrow(`unsupported legacy field "${field}"`);
        },
    );

    it.each(['endpoint', 'itemsField', 'cursorVar', 'pageInfoField', 'pageSize'])(
        'rejects the GraphQL alias %s',
        field => {
            expect(() => assertCanonicalExtractorConfig('graphql', { [field]: 'value' }))
                .toThrow(`unsupported legacy field "${field}"`);
        },
    );

    it.each(['pagination.type', 'pagination.limit', 'retry.maxAttempts'])(
        'rejects the literal dotted key %s',
        field => {
            expect(() => assertCanonicalExtractorConfig('httpApi', { [field]: 1 }))
                .toThrow(`unsupported legacy field "${field}"`);
        },
    );

    it('rejects non-canonical pagination casing', () => {
        expect(() => assertCanonicalExtractorConfig('httpApi', {
            pagination: { type: 'offset' },
        })).toThrow('invalid pagination type "offset"');
    });

    it('rejects invalid pagination containers', () => {
        expect(() => assertCanonicalExtractorConfig('graphql', {
            pagination: 'RELAY',
        })).toThrow('pagination must be an object');
    });
});
