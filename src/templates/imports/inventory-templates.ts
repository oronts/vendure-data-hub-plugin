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
    description: 'Update inventory stock levels for existing products by SKU. Supports multiple stock locations.',
    category: 'inventory',
    icon: 'package',
    difficulty: 'beginner',
    estimatedTime: '3 minutes',
    requiredFields: ['sku', 'quantity'],
    optionalFields: ['location', 'reason'],
    formats: ['csv'],
    tags: ['bulk-update', 'sync'],
    featured: true,
    sortOrder: 1,
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
 * Multi-Location Inventory Template
 */
export const multiLocationInventoryTemplate: ImportTemplate = {
    id: 'multi-location-inventory-csv',
    name: 'Multi-Location Inventory (CSV)',
    description: 'Update stock levels across multiple warehouse locations. Perfect for distributed inventory management.',
    category: 'inventory',
    icon: 'warehouse',
    difficulty: 'intermediate',
    estimatedTime: '5 minutes',
    requiredFields: ['sku', 'location_name', 'quantity'],
    optionalFields: ['allocated', 'incoming', 'safety_stock'],
    formats: ['csv'],
    tags: ['bulk-update', 'sync'],
    sortOrder: 2,
    sampleData: [
        { sku: 'PROD-001', location_name: 'Warehouse A', quantity: '100', allocated: '10' },
        { sku: 'PROD-001', location_name: 'Warehouse B', quantity: '50', allocated: '5' },
        { sku: 'PROD-002', location_name: 'Warehouse A', quantity: '200', allocated: '20' },
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
            operation: 'UPSERT',
            lookupFields: ['sku', 'stockLocationName'],
        },
        mappings: [
            { source: 'sku', target: 'sku', required: true },
            { source: 'location_name', target: 'stockLocationName', required: true },
            {
                source: 'quantity',
                target: 'stockOnHand',
                required: true,
                transforms: [{ type: 'PARSE_INT' }],
            },
            {
                source: 'allocated',
                target: 'stockAllocated',
                transforms: [{ type: 'PARSE_INT' }],
                defaultValue: 0,
            },
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
    multiLocationInventoryTemplate,
];
