import type { EnhancedSchemaDefinition } from '../types/index';
import { id, timestamps } from './schema-field-builders';

// COLLECTION SCHEMA

export const COLLECTION_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-collection',
    label: 'Collection',
    description: 'Product collections for navigation and categorization',
    primaryKey: 'slug',

    fields: {
        id: id('Collection ID'),
        name: { type: 'string', required: true, label: 'Name' },
        slug: { type: 'slug', required: true, label: 'Slug' },
        description: { type: 'text', label: 'Description' },
        position: { type: 'integer', label: 'Position', default: 0 },
        isPrivate: { type: 'boolean', label: 'Private', default: false },
        parentId: { type: 'string', label: 'Parent Collection ID' },
        featuredAssetId: { type: 'string', label: 'Featured Asset ID' },
        assetIds: { type: 'array', label: 'Asset IDs', items: { type: 'string' } },
        filters: {
            type: 'array',
            label: 'Collection Filters',
            items: {
                type: 'object',
                fields: {
                    code: { type: 'string', required: true },
                    args: { type: 'json' },
                },
            },
        },
        translations: {
            type: 'array',
            label: 'Translations',
            items: {
                type: 'object',
                fields: {
                    languageCode: { type: 'locale', required: true },
                    name: { type: 'string', required: true },
                    slug: { type: 'slug', required: true },
                    description: { type: 'text' },
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// FACET SCHEMA

export const FACET_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-facet',
    label: 'Facet',
    description: 'Facets for product filtering (e.g., Color, Size)',
    primaryKey: 'code',

    fields: {
        id: id('Facet ID'),
        code: { type: 'string', required: true, label: 'Code' },
        name: { type: 'string', required: true, label: 'Name' },
        isPrivate: { type: 'boolean', label: 'Private', default: false },
        values: {
            type: 'array',
            label: 'Values',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    code: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    translations: {
                        type: 'array',
                        items: {
                            type: 'object',
                            fields: {
                                languageCode: { type: 'locale', required: true },
                                name: { type: 'string', required: true },
                            },
                        },
                    },
                    customFields: { type: 'json' },
                },
            },
        },
        translations: {
            type: 'array',
            label: 'Translations',
            items: {
                type: 'object',
                fields: {
                    languageCode: { type: 'locale', required: true },
                    name: { type: 'string', required: true },
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// ASSET SCHEMA

export const ASSET_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-asset',
    label: 'Asset',
    description: 'Media assets including images and files',
    primaryKey: 'id',

    fields: {
        id: id('Asset ID'),
        name: { type: 'string', required: true, label: 'Name' },
        type: { type: 'enum', label: 'Type', enum: ['IMAGE', 'VIDEO', 'BINARY'] },
        mimeType: { type: 'string', label: 'MIME Type' },
        width: { type: 'integer', label: 'Width' },
        height: { type: 'integer', label: 'Height' },
        fileSize: { type: 'integer', label: 'File Size (bytes)' },
        source: { type: 'url', required: true, label: 'Source URL' },
        preview: { type: 'url', label: 'Preview URL' },
        focalPoint: {
            type: 'object',
            label: 'Focal Point',
            fields: {
                x: { type: 'float' },
                y: { type: 'float' },
            },
        },
        tags: {
            type: 'array',
            label: 'Tags',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    value: { type: 'string' },
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// STOCK LEVEL SCHEMA

export const STOCK_LEVEL_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-stock-level',
    label: 'Inventory',
    description: 'Stock levels for product variants',
    primaryKey: ['productVariantId', 'stockLocationId'],

    fields: {
        id: id('Stock Level ID'),
        productVariantId: { type: 'string', required: true, label: 'Product Variant ID' },
        productVariantSku: { type: 'string', label: 'SKU' },
        stockLocationId: { type: 'string', required: true, label: 'Stock Location ID' },
        stockLocationName: { type: 'string', label: 'Stock Location Name' },
        stockOnHand: { type: 'integer', required: true, label: 'Stock on Hand', validation: { min: 0 } },
        stockAllocated: { type: 'integer', label: 'Stock Allocated', default: 0, validation: { min: 0 } },
        ...timestamps(),
    },
};

// PROMOTION SCHEMA

export const PROMOTION_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-promotion',
    label: 'Promotion',
    description: 'Promotional rules and coupon codes',
    primaryKey: 'couponCode',

    fields: {
        id: id('Promotion ID'),
        name: { type: 'string', required: true, label: 'Name' },
        description: { type: 'text', label: 'Description' },
        couponCode: { type: 'string', label: 'Coupon Code' },
        perCustomerUsageLimit: { type: 'integer', label: 'Per Customer Usage Limit' },
        usageLimit: { type: 'integer', label: 'Total Usage Limit' },
        startsAt: { type: 'datetime', label: 'Starts At' },
        endsAt: { type: 'datetime', label: 'Ends At' },
        enabled: { type: 'boolean', label: 'Enabled', default: true },
        conditions: {
            type: 'array',
            label: 'Conditions',
            items: {
                type: 'object',
                fields: {
                    code: { type: 'string', required: true },
                    args: { type: 'json' },
                },
            },
        },
        actions: {
            type: 'array',
            label: 'Actions',
            items: {
                type: 'object',
                fields: {
                    code: { type: 'string', required: true },
                    args: { type: 'json' },
                },
            },
        },
        translations: {
            type: 'array',
            label: 'Translations',
            items: {
                type: 'object',
                fields: {
                    languageCode: { type: 'locale', required: true },
                    name: { type: 'string', required: true },
                    description: { type: 'text' },
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// CUSTOMER GROUP SCHEMA

export const CUSTOMER_GROUP_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-customer-group',
    label: 'Customer Group',
    description: 'Customer groups for segmentation and pricing',
    primaryKey: 'name',

    fields: {
        id: id('Customer Group ID'),
        name: { type: 'string', required: true, label: 'Name' },
        customerEmails: {
            type: 'array',
            label: 'Customer Emails',
            items: { type: 'email' },
            description: 'Email addresses of customers to add to this group',
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// FACET VALUE SCHEMA

export const FACET_VALUE_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-facet-value',
    label: 'Facet Value',
    description: 'Individual facet values (e.g., Red, Large)',
    primaryKey: 'code',

    fields: {
        id: id('Facet Value ID'),
        name: { type: 'string', required: true, label: 'Name' },
        code: { type: 'string', required: true, label: 'Code' },
        facetCode: {
            type: 'string',
            required: true,
            label: 'Facet Code',
            description: 'Code of the parent facet this value belongs to',
        },
        facetId: {
            type: 'string',
            label: 'Facet ID',
            description: 'ID of the parent facet (alternative to facetCode)',
        },
        translations: {
            type: 'array',
            label: 'Translations',
            items: {
                type: 'object',
                fields: {
                    languageCode: { type: 'locale', required: true },
                    name: { type: 'string', required: true },
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

