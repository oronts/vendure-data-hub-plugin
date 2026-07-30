import { describe, expect, it } from 'vitest';
import { assertPimcoreGraphqlApiKey } from './pimcore-api';

describe('Pimcore development credentials', () => {
    it('requires an explicit API key for a configured GraphQL endpoint', () => {
        expect(() => assertPimcoreGraphqlApiKey(
            'http://localhost:8080/pimcore-graphql-webservices/shop',
            undefined,
        )).toThrow('PIMCORE_API_KEY must be set explicitly');
        expect(() => assertPimcoreGraphqlApiKey(
            'http://localhost:8080/pimcore-graphql-webservices/shop',
            'configured-key',
        )).not.toThrow();
    });

    it('allows the mock API default when no GraphQL endpoint is configured', () => {
        expect(() => assertPimcoreGraphqlApiKey(undefined, undefined)).not.toThrow();
    });
});
