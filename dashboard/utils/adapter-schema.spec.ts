import { describe, expect, it } from 'vitest';
import { mapAdapterSchema } from './adapter-schema';

describe('mapAdapterSchema', () => {
    it('preserves defaults, constraints, dependencies, and group metadata', () => {
        const schema = mapAdapterSchema({
            groups: [{ id: 'paging', label: 'Pagination', description: 'Paging controls' }],
            fields: [
                {
                    key: 'pagination.type',
                    type: 'SELECT',
                    defaultValue: 'NONE',
                    group: 'paging',
                    options: [{ value: 'NONE', label: 'None' }],
                },
                {
                    key: 'pagination.limit',
                    type: 'NUMBER',
                    defaultValue: 0,
                    validation: { min: 0, max: 100, minLength: null },
                    dependsOn: { field: 'pagination.type', value: 'NONE', operator: 'ne' },
                },
            ],
        });

        expect(schema.groups).toEqual([
            { key: 'paging', label: 'Pagination', description: 'Paging controls' },
        ]);
        expect(schema.fields).toEqual([
            expect.objectContaining({
                key: 'pagination.type',
                type: 'select',
                default: 'NONE',
                group: 'paging',
            }),
            expect.objectContaining({
                key: 'pagination.limit',
                type: 'number',
                default: 0,
                validation: expect.objectContaining({ min: 0, max: 100 }),
                dependsOn: { field: 'pagination.type', value: 'NONE', operator: 'ne' },
            }),
        ]);
    });

    it('returns an empty schema for malformed serialized metadata', () => {
        expect(mapAdapterSchema('{not-json')).toEqual({ fields: [] });
        expect(mapAdapterSchema({ fields: 'invalid' })).toEqual({ fields: [] });
    });

    it('falls back to equality for unknown dependency operators', () => {
        const schema = mapAdapterSchema({
            fields: [{
                key: 'target',
                type: 'string',
                dependsOn: { field: 'mode', value: 'active', operator: 'unsupported' },
            }],
        });

        expect(schema.fields[0].dependsOn?.operator).toBe('eq');
    });
});
