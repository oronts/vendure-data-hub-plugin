import { describe, expect, it } from 'vitest';
import { collectResourceReferences } from './resource-references';

describe('collectResourceReferences', () => {
    it('collects nested resources without recursing through cycles', () => {
        const secretCodes: Record<string, unknown> = {
            primary: 'primary-token',
            nested: ['secondary-token', '  '],
        };
        secretCodes.self = secretCodes;
        const definition: Record<string, unknown> = {
            connectionCode: 'catalog-api',
            secretCodes,
        };
        definition.self = definition;

        const references = collectResourceReferences(definition);

        expect([...references.connections]).toEqual(['catalog-api']);
        expect([...references.secrets]).toEqual([
            'primary-token',
            'secondary-token',
        ]);
    });
});
