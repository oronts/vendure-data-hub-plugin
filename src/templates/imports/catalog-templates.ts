/**
 * Catalog Import Templates (Collections and Facets)
 */

import { ImportTemplate } from './types';

/**
 * Collections CSV Template
 */
export const collectionsTemplate: ImportTemplate = {
    id: 'collections-csv',
    name: 'Collections/Categories (CSV)',
    description: 'Import product collections/categories with hierarchical structure.',
    category: 'catalog',
    icon: 'folder',
    difficulty: 'beginner',
    estimatedTime: '5 minutes',
    requiredFields: ['name'],
    optionalFields: ['slug', 'description', 'parent_slug', 'position'],
    sampleData: [
        { name: 'Electronics', slug: 'electronics', description: 'Electronic devices', parent_slug: '', position: '0' },
        { name: 'Phones', slug: 'phones', description: 'Mobile phones', parent_slug: 'electronics', position: '0' },
        { name: 'Laptops', slug: 'laptops', description: 'Laptop computers', parent_slug: 'electronics', position: '1' },
    ],
    definition: {
        version: 1,
        type: 'IMPORT',
        source: {
            type: 'FILE_UPLOAD',
            format: {
                format: 'csv',
                csv: {
                    delimiter: ',',
                    headerRow: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
            },
        },
        target: {
            entity: 'COLLECTION',
            operation: 'UPSERT',
            lookupFields: ['slug'],
        },
        mappings: [
            { source: 'name', target: 'name', required: true },
            {
                source: 'slug',
                target: 'slug',
                transforms: [{ type: 'SLUGIFY' }],
            },
            { source: 'description', target: 'description' },
            { source: 'parent_slug', target: 'parentSlug' },
            {
                source: 'position',
                target: 'position',
                transforms: [{ type: 'PARSE_INT' }],
                defaultValue: 0,
            },
        ],
        options: {
            batchSize: 100,
            onError: 'SKIP',
        },
    },
};

/**
 * Facets/Attributes CSV Template
 */
export const facetsTemplate: ImportTemplate = {
    id: 'facets-csv',
    name: 'Facets/Attributes (CSV)',
    description: 'Import product facets (like Color, Size, Brand) and their values.',
    category: 'catalog',
    icon: 'tag',
    difficulty: 'beginner',
    estimatedTime: '5 minutes',
    requiredFields: ['facet_name', 'facet_code', 'value_name', 'value_code'],
    optionalFields: [],
    sampleData: [
        { facet_name: 'Color', facet_code: 'color', value_name: 'Red', value_code: 'red' },
        { facet_name: 'Color', facet_code: 'color', value_name: 'Blue', value_code: 'blue' },
        { facet_name: 'Size', facet_code: 'size', value_name: 'Small', value_code: 's' },
        { facet_name: 'Size', facet_code: 'size', value_name: 'Medium', value_code: 'm' },
    ],
    definition: {
        version: 1,
        type: 'IMPORT',
        source: {
            type: 'FILE_UPLOAD',
            format: {
                format: 'csv',
                csv: {
                    delimiter: ',',
                    headerRow: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
            },
        },
        target: {
            entity: 'FACET_VALUE',
            operation: 'UPSERT',
            lookupFields: ['code'],
        },
        mappings: [
            { source: 'facet_code', target: 'facetCode', required: true },
            { source: 'value_name', target: 'name', required: true },
            {
                source: 'value_code',
                target: 'code',
                required: true,
                transforms: [
                    { type: 'LOWERCASE' },
                    { type: 'SLUGIFY' },
                ],
            },
        ],
        options: {
            batchSize: 100,
            onError: 'SKIP',
        },
    },
};

/**
 * All catalog templates
 */
export const catalogTemplates: ImportTemplate[] = [
    collectionsTemplate,
    facetsTemplate,
];
