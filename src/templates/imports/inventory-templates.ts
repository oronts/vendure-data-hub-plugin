/**
 * Inventory Import Templates
 */

import { ImportTemplate } from './types';

/**
 * Stock Update CSV Template
 */
export const stockUpdateTemplate: ImportTemplate = {
    id: 'stock-update-csv',
    name: 'Stock Level Update (CSV)',
    description: 'Update inventory stock levels for existing products by SKU.',
    category: 'inventory',
    icon: 'package',
    difficulty: 'beginner',
    estimatedTime: '3 minutes',
    requiredFields: ['sku', 'quantity'],
    optionalFields: ['location', 'reason'],
    sampleData: [
        { sku: 'PROD-001', quantity: '100' },
        { sku: 'PROD-002', quantity: '50' },
        { sku: 'PROD-003', quantity: '0' },
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
            entity: 'INVENTORY',
            operation: 'UPDATE',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'sku', target: 'sku', required: true },
            {
                source: 'quantity',
                target: 'stockOnHand',
                required: true,
                transforms: [{ type: 'PARSE_INT' }],
            },
            { source: 'location', target: 'stockLocationName' },
            { source: 'reason', target: 'reason' },
        ],
        options: {
            batchSize: 200,
            onError: 'SKIP',
        },
    },
};

/**
 * All inventory templates
 */
export const inventoryTemplates: ImportTemplate[] = [
    stockUpdateTemplate,
];
