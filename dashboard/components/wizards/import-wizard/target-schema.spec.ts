import { describe, expect, it } from 'vitest';
import { buildImportTargetSchema } from './target-schema';

describe('buildImportTargetSchema', () => {
    it('creates mapping fields for backend-only entities and excludes read-only fields', () => {
        const schema = buildImportTargetSchema('custom-item', [
            {
                key: 'externalId',
                label: 'External ID',
                type: 'STRING',
                required: true,
                readonly: false,
                lookupable: true,
                translatable: false,
                children: [],
            },
            {
                key: 'createdAt',
                label: 'Created At',
                type: 'DATE',
                required: false,
                readonly: true,
                lookupable: false,
                translatable: false,
                children: [],
            },
        ]);

        expect(schema).toEqual(expect.objectContaining({
            $id: 'loader-custom-item',
            primaryKey: 'externalId',
        }));
        expect(schema?.fields).toEqual({
            externalId: expect.objectContaining({
                type: 'string',
                label: 'External ID',
                required: true,
            }),
        });
    });

    it('keeps rich static metadata only for fields still exposed by the backend', () => {
        const schema = buildImportTargetSchema('product', [{
            key: 'name',
            label: 'Current Name',
            type: 'STRING',
            required: true,
            readonly: false,
            lookupable: false,
            translatable: true,
            children: [],
        }], {
            label: 'Product',
            primaryKey: 'slug',
            fields: {
                name: { type: 'text', description: 'Rich metadata' },
                slug: { type: 'slug' },
            },
        });

        expect(schema?.fields).toEqual({
            name: expect.objectContaining({
                type: 'text',
                label: 'Current Name',
                description: 'Rich metadata',
            }),
        });
        expect(schema?.primaryKey).toBeUndefined();
    });
});
