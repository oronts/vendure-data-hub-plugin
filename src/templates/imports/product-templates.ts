/**
 * Product Import Templates
 */

import { ImportTemplate } from './types';

/**
 * Simple Products CSV Template
 */
export const simpleProductsTemplate: ImportTemplate = {
    id: 'simple-products-csv',
    name: 'Simple Products (CSV)',
    description: 'Import basic products with name, SKU, price, and description from a CSV file. Perfect for getting started with product imports.',
    category: 'products',
    icon: 'shopping-bag',
    difficulty: 'beginner',
    estimatedTime: '5 minutes',
    requiredFields: ['name', 'sku', 'price'],
    optionalFields: ['description', 'slug', 'enabled', 'facetCodes'],
    formats: ['csv'],
    tags: ['initial-import', 'bulk-update'],
    featured: true,
    sortOrder: 1,
    sampleData: [
        { name: 'Blue T-Shirt', sku: 'TSHIRT-BLU-M', price: '29.99', description: 'Comfortable cotton t-shirt' },
        { name: 'Red Sneakers', sku: 'SNEAK-RED-42', price: '89.99', description: 'Stylish running sneakers' },
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
                    trimWhitespace: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
                allowedExtensions: ['.csv'],
            },
        },
        target: {
            entity: 'PRODUCT_VARIANT',
            operation: 'UPSERT',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'name', target: 'name', required: true },
            { source: 'sku', target: 'sku', required: true },
            {
                source: 'price',
                target: 'price',
                required: true,
                transforms: [
                    { type: 'PARSE_FLOAT' },
                    { type: 'TO_CENTS' },
                ],
            },
            { source: 'description', target: 'description' },
            {
                source: 'slug',
                target: 'slug',
                transforms: [{ type: 'SLUGIFY' }],
            },
            {
                source: 'enabled',
                target: 'enabled',
                transforms: [{ type: 'PARSE_BOOLEAN' }],
                defaultValue: true,
            },
        ],
        options: {
            batchSize: 100,
            onError: 'SKIP',
            skipDuplicates: false,
        },
    },
};

/**
 * Products with Variants CSV Template
 */
export const productsWithVariantsTemplate: ImportTemplate = {
    id: 'products-with-variants-csv',
    name: 'Products with Variants (CSV)',
    description: 'Import products with multiple variants (sizes, colors) from a CSV file. Handles grouped variants and automatic option creation.',
    category: 'products',
    icon: 'layers',
    difficulty: 'intermediate',
    estimatedTime: '10 minutes',
    requiredFields: ['product_name', 'variant_sku', 'price'],
    optionalFields: ['variant_name', 'color', 'size', 'stock_quantity', 'weight'],
    formats: ['csv'],
    tags: ['initial-import'],
    sortOrder: 2,
    sampleData: [
        { product_name: 'T-Shirt', variant_sku: 'TS-BLU-S', variant_name: 'Blue Small', color: 'Blue', size: 'S', price: '29.99', stock_quantity: '50' },
        { product_name: 'T-Shirt', variant_sku: 'TS-BLU-M', variant_name: 'Blue Medium', color: 'Blue', size: 'M', price: '29.99', stock_quantity: '75' },
        { product_name: 'T-Shirt', variant_sku: 'TS-RED-S', variant_name: 'Red Small', color: 'Red', size: 'S', price: '29.99', stock_quantity: '30' },
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
                    trimWhitespace: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
                allowedExtensions: ['.csv'],
            },
        },
        target: {
            entity: 'PRODUCT_VARIANT',
            operation: 'UPSERT',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'product_name', target: 'productName', required: true },
            { source: 'variant_sku', target: 'sku', required: true },
            { source: 'variant_name', target: 'name' },
            {
                source: 'price',
                target: 'price',
                transforms: [
                    { type: 'PARSE_FLOAT' },
                    { type: 'TO_CENTS' },
                ],
            },
            {
                source: 'stock_quantity',
                target: 'stockOnHand',
                transforms: [{ type: 'PARSE_INT' }],
                defaultValue: 0,
            },
            {
                source: 'color',
                target: 'facetValues',
                transforms: [
                    { type: 'TEMPLATE', config: { template: 'color:${value}' } },
                ],
            },
            {
                source: 'size',
                target: 'facetValues',
                transforms: [
                    { type: 'TEMPLATE', config: { template: 'size:${value}' } },
                ],
            },
        ],
        options: {
            batchSize: 50,
            onError: 'SKIP',
        },
    },
};

/**
 * Shopify Products CSV Template
 */
export const shopifyProductsTemplate: ImportTemplate = {
    id: 'shopify-products-csv',
    name: 'Shopify Product Export',
    description: 'Import products exported from Shopify in their standard CSV format. Automatically maps Shopify fields to Vendure entities.',
    category: 'products',
    icon: 'shopping-cart',
    difficulty: 'intermediate',
    estimatedTime: '15 minutes',
    requiredFields: ['Title', 'Variant SKU', 'Variant Price'],
    optionalFields: ['Body (HTML)', 'Vendor', 'Tags', 'Variant Inventory Qty', 'Image Src'],
    formats: ['csv'],
    tags: ['migration', 'shopify'],
    featured: true,
    sortOrder: 3,
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
                    trimWhitespace: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
            },
        },
        target: {
            entity: 'PRODUCT_VARIANT',
            operation: 'UPSERT',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'Title', target: 'productName', required: true },
            { source: 'Variant SKU', target: 'sku', required: true },
            {
                source: 'Variant Price',
                target: 'price',
                transforms: [
                    { type: 'PARSE_FLOAT' },
                    { type: 'TO_CENTS' },
                ],
            },
            {
                source: 'Body (HTML)',
                target: 'description',
                transforms: [{ type: 'STRIP_HTML' }],
            },
            { source: 'Vendor', target: 'customFields.vendor' },
            {
                source: 'Tags',
                target: 'facetValues',
                transforms: [
                    { type: 'SPLIT', config: { delimiter: ', ' } },
                ],
            },
            {
                source: 'Variant Inventory Qty',
                target: 'stockOnHand',
                transforms: [{ type: 'PARSE_INT' }],
            },
            { source: 'Image Src', target: 'assetUrls' },
        ],
        options: {
            batchSize: 50,
            onError: 'SKIP',
        },
    },
};

/**
 * WooCommerce Products CSV Template
 */
export const woocommerceProductsTemplate: ImportTemplate = {
    id: 'woocommerce-products-csv',
    name: 'WooCommerce Product Export',
    description: 'Import products exported from WooCommerce using the standard Product CSV Export. Handles variable products and attributes.',
    category: 'products',
    icon: 'store',
    difficulty: 'intermediate',
    estimatedTime: '15 minutes',
    requiredFields: ['Name', 'SKU', 'Regular price'],
    optionalFields: ['Description', 'Categories', 'Tags', 'Images', 'Stock', 'Attribute 1 name', 'Attribute 1 value(s)'],
    formats: ['csv'],
    tags: ['migration', 'woocommerce'],
    sortOrder: 4,
    sampleData: [
        { Name: 'Premium Hoodie', SKU: 'HOODIE-001', 'Regular price': '59.99', Description: 'Warm cotton hoodie', Categories: 'Clothing > Hoodies', Stock: '25' },
        { Name: 'Classic Jeans', SKU: 'JEANS-001', 'Regular price': '79.99', Description: 'Slim fit jeans', Categories: 'Clothing > Pants', Stock: '40' },
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
                    trimWhitespace: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
            },
        },
        target: {
            entity: 'PRODUCT_VARIANT',
            operation: 'UPSERT',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'Name', target: 'productName', required: true },
            { source: 'SKU', target: 'sku', required: true },
            {
                source: 'Regular price',
                target: 'price',
                transforms: [
                    { type: 'PARSE_FLOAT' },
                    { type: 'TO_CENTS' },
                ],
            },
            { source: 'Description', target: 'description' },
            {
                source: 'Categories',
                target: 'collectionSlugs',
                transforms: [
                    { type: 'SPLIT', config: { delimiter: ' > ' } },
                    { type: 'SLUGIFY' },
                ],
            },
            {
                source: 'Stock',
                target: 'stockOnHand',
                transforms: [{ type: 'PARSE_INT' }],
            },
            { source: 'Images', target: 'assetUrls' },
        ],
        options: {
            batchSize: 50,
            onError: 'SKIP',
        },
    },
};

/**
 * Price Update Template
 */
export const priceUpdateTemplate: ImportTemplate = {
    id: 'price-update-csv',
    name: 'Bulk Price Update (CSV)',
    description: 'Update product prices in bulk by SKU. Perfect for seasonal sales or price adjustments.',
    category: 'products',
    icon: 'dollar-sign',
    difficulty: 'beginner',
    estimatedTime: '3 minutes',
    requiredFields: ['sku', 'price'],
    optionalFields: ['sale_price', 'cost_price'],
    formats: ['csv'],
    tags: ['bulk-update'],
    sortOrder: 5,
    sampleData: [
        { sku: 'PROD-001', price: '29.99', sale_price: '24.99' },
        { sku: 'PROD-002', price: '49.99', sale_price: '' },
        { sku: 'PROD-003', price: '99.99', sale_price: '79.99' },
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
            entity: 'PRODUCT_VARIANT',
            operation: 'UPDATE',
            lookupFields: ['sku'],
        },
        mappings: [
            { source: 'sku', target: 'sku', required: true },
            {
                source: 'price',
                target: 'price',
                required: true,
                transforms: [
                    { type: 'PARSE_FLOAT' },
                    { type: 'TO_CENTS' },
                ],
            },
        ],
        options: {
            batchSize: 200,
            onError: 'SKIP',
        },
    },
};

/**
 * All product templates
 */
export const productTemplates: ImportTemplate[] = [
    simpleProductsTemplate,
    productsWithVariantsTemplate,
    shopifyProductsTemplate,
    woocommerceProductsTemplate,
    priceUpdateTemplate,
];
