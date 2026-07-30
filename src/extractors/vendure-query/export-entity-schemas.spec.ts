import { describe, expect, it } from 'vitest';
import { VENDURE_ENTITY_TYPE_OPTIONS } from '../../constants/adapter-schema-options';
import { EXPORT_ENTITY_SCHEMAS, getExportEntitySchema } from './export-entity-schemas';
import { getEntityClass } from './helpers';

describe('export entity schemas', () => {
    it('matches every entity advertised by the Vendure query extractor', () => {
        expect(EXPORT_ENTITY_SCHEMAS.map(schema => schema.entityType)).toEqual(
            VENDURE_ENTITY_TYPE_OPTIONS.map(option => option.value),
        );

        for (const schema of EXPORT_ENTITY_SCHEMAS) {
            expect(getEntityClass(schema.entityType)).toBeDefined();
            expect(schema.fields.some(field => field.key === 'id')).toBe(true);
            expect(schema.fields.every(field => field.label.length > 0)).toBe(true);
        }
    });

    it('marks query fields as a subset of emitted fields', () => {
        for (const schema of EXPORT_ENTITY_SCHEMAS) {
            const emittedFields = new Set(schema.fields.map(field => field.key));
            for (const field of schema.fields.filter(field => field.queryable)) {
                expect(emittedFields.has(field.key)).toBe(true);
            }
        }
    });

    it('looks up canonical entity types case-insensitively', () => {
        expect(getExportEntitySchema('product_variant')?.entityType).toBe('PRODUCT_VARIANT');
        expect(getExportEntitySchema('STOCK_LEVEL')).toBeUndefined();
    });
});
