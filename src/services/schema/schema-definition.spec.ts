import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../../types';
import {
    assertSchemaDefinition,
    validateSchemaRecord,
} from './schema-definition';
import { assertCompatibleSchemaEvolution } from './schema-compatibility';

const PRODUCT_SCHEMA: JsonObject = {
    fields: {
        sku: {
            type: 'string',
            required: true,
            validation: { minLength: 1 },
        },
        price: { type: 'number', validation: { min: 0 } },
    },
};

describe('schema definition validation', () => {
    it('rejects non-object JSON values before traversing them', () => {
        expect(() => assertSchemaDefinition('invalid' as never))
            .toThrow('Schema definition must be a JSON object');
        expect(() => assertSchemaDefinition([] as never))
            .toThrow('Schema definition must be a JSON object');
    });

    it('validates Data Hub records with explicit compatibility behavior', () => {
        expect(validateSchemaRecord(
            PRODUCT_SCHEMA,
            { sku: 'SKU-1', price: 10 },
            'BACKWARD',
        )).toEqual([]);
        expect(validateSchemaRecord(
            PRODUCT_SCHEMA,
            { sku: '', extra: true },
            'BACKWARD',
        )).toEqual([
            { path: '$.sku', message: 'must contain at least 1 characters' },
        ]);
        expect(validateSchemaRecord(
            PRODUCT_SCHEMA,
            { sku: 'SKU-1', extra: true },
            'STRICT',
        )).toEqual([
            { path: '$.extra', message: 'is not declared by the schema' },
        ]);
    });

    it('supports nested fields in the Data Hub dialect', () => {
        const definition: JsonObject = {
            fields: {
                sku: { type: 'string', required: true },
                dimensions: {
                    type: 'object',
                    fields: {
                        width: {
                            type: 'number',
                            validation: { min: 0 },
                        },
                    },
                },
            },
        };

        expect(() => assertSchemaDefinition(definition)).not.toThrow();
        expect(validateSchemaRecord(
            definition,
            { sku: 'SKU-1', dimensions: { width: -1 } },
            'BACKWARD',
        )).toEqual([
            { path: '$.dimensions.width', message: 'must be at least 0' },
        ]);
    });

    it('rejects unsafe patterns and unsupported dialect features', () => {
        expect(() => assertSchemaDefinition({
            fields: {
                value: {
                    type: 'string',
                    validation: { pattern: '(a+)+$' },
                },
            },
        })).toThrow(/Unsafe regex pattern/);
        expect(() => assertSchemaDefinition({
            fields: { nested: { type: 'ref', ref: 'other' } },
        })).toThrow(/not supported/);
        expect(() => assertSchemaDefinition({
            type: 'object',
            properties: {},
        })).toThrow(/not supported by registry validation/);
    });
});

describe('schema evolution compatibility', () => {
    it('rejects required fields and narrowed constraints in backward mode', () => {
        expect(() => assertCompatibleSchemaEvolution(
            PRODUCT_SCHEMA,
            {
                fields: {
                    sku: {
                        type: 'string',
                        required: true,
                        validation: { minLength: 2 },
                    },
                    name: { type: 'string', required: true },
                },
            },
            'BACKWARD',
        )).toThrow(/new required field|narrowed minLength/);
    });

    it('allows optional additions in backward mode and any change in permissive mode', () => {
        expect(() => assertCompatibleSchemaEvolution(
            PRODUCT_SCHEMA,
            {
                ...PRODUCT_SCHEMA,
                fields: {
                    ...(PRODUCT_SCHEMA.fields as JsonObject),
                    name: { type: 'string' },
                },
            },
            'BACKWARD',
        )).not.toThrow();
        expect(() => assertCompatibleSchemaEvolution(
            PRODUCT_SCHEMA,
            { fields: {} },
            'PERMISSIVE',
        )).not.toThrow();
    });

    it('requires canonical equality in strict mode', () => {
        expect(() => assertCompatibleSchemaEvolution(
            PRODUCT_SCHEMA,
            {
                fields: PRODUCT_SCHEMA.fields,
            },
            'STRICT',
        )).not.toThrow();
        expect(() => assertCompatibleSchemaEvolution(
            PRODUCT_SCHEMA,
            { ...PRODUCT_SCHEMA, description: 'Changed contract' },
            'STRICT',
        )).toThrow(/match the previous version exactly/);
    });
});
