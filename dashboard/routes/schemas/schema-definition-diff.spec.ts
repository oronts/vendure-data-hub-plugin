import { describe, expect, it } from 'vitest';
import { compareSchemaDefinitions } from './schema-definition-diff';

describe('compareSchemaDefinitions', () => {
    it('reports nested additions, removals, and modifications in stable order', () => {
        expect(compareSchemaDefinitions(
            {
                fields: {
                    name: { type: 'string' },
                    price: { type: 'number', required: false },
                },
            },
            {
                fields: {
                    price: { type: 'integer', required: false },
                    sku: { type: 'string' },
                },
            },
        )).toEqual([
            {
                path: '/fields/name',
                type: 'REMOVED',
                before: { type: 'string' },
            },
            {
                path: '/fields/price/type',
                type: 'MODIFIED',
                before: 'number',
                after: 'integer',
            },
            {
                path: '/fields/sku',
                type: 'ADDED',
                after: { type: 'string' },
            },
        ]);
    });

    it('treats identical arrays as unchanged and changed arrays as one value', () => {
        expect(compareSchemaDefinitions(
            { enum: ['a', 'b'] },
            { enum: ['a', 'b'] },
        )).toEqual([]);
        expect(compareSchemaDefinitions(
            { enum: ['a', 'b'] },
            { enum: ['a', 'c'] },
        )).toEqual([{
            path: '/enum',
            type: 'MODIFIED',
            before: ['a', 'b'],
            after: ['a', 'c'],
        }]);
    });

    it('escapes JSON Pointer path segments', () => {
        expect(compareSchemaDefinitions(
            { 'a/b': 1 },
            { 'a/b': 2 },
        )[0]?.path).toBe('/a~1b');
    });
});
