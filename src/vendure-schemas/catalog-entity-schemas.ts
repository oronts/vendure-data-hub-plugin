import type { EnhancedSchemaDefinition } from '../types/index';
import { currencyCode, id, money, timestamps } from './schema-field-builders';

// PRODUCT SCHEMA

export const PRODUCT_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-product',
    label: 'Product',
    description: 'Products with variants, assets, and custom fields',
    primaryKey: 'id',

    groups: [
        { id: 'basic', label: 'Basic Information', fields: ['id', 'name', 'slug', 'description', 'enabled'] },
        { id: 'assets', label: 'Assets', fields: ['featuredAssetId', 'assetIds'] },
        { id: 'facets', label: 'Facets & Collections', fields: ['facetValueIds', 'collectionIds'] },
        { id: 'custom', label: 'Custom Fields', fields: ['customFields'] },
        { id: 'meta', label: 'Metadata', fields: ['createdAt', 'updatedAt'] },
    ],

    fields: {
        id: id('Product ID'),
        name: {
            type: 'string',
            required: true,
            label: 'Product Name',
            validation: { minLength: 1, maxLength: 255 },
        },
        slug: {
            type: 'slug',
            required: true,
            label: 'URL Slug',
            description: 'URL-friendly identifier',
        },
        description: {
            type: 'text',
            label: 'Description',
            ui: { widget: 'rich-text' },
        },
        enabled: {
            type: 'boolean',
            label: 'Enabled',
            default: true,
        },
        featuredAssetId: {
            type: 'string',
            label: 'Featured Asset ID',
            description: 'Primary product image',
        },
        assetIds: {
            type: 'array',
            label: 'Asset IDs',
            items: { type: 'string' },
            description: 'All product images',
        },
        facetValueIds: {
            type: 'array',
            label: 'Facet Value IDs',
            items: { type: 'string' },
        },
        collectionIds: {
            type: 'array',
            label: 'Collection IDs',
            items: { type: 'string' },
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
        customFields: {
            type: 'json',
            label: 'Custom Fields',
            description: 'Custom field values',
        },
        ...timestamps(),
    },
};

// PRODUCT VARIANT SCHEMA

export const PRODUCT_VARIANT_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-product-variant',
    label: 'Product Variant',
    description: 'Individual product variants with SKU, pricing, and inventory',
    primaryKey: 'sku',

    groups: [
        { id: 'basic', label: 'Basic Information', fields: ['id', 'sku', 'name', 'enabled', 'productId'] },
        { id: 'pricing', label: 'Pricing', fields: ['price', 'currencyCode', 'taxCategoryId', 'priceWithTax'] },
        { id: 'inventory', label: 'Inventory', fields: ['stockOnHand', 'stockAllocated', 'outOfStockThreshold', 'useGlobalOutOfStockThreshold', 'trackInventory'] },
        { id: 'options', label: 'Options', fields: ['optionIds', 'options'] },
        { id: 'assets', label: 'Assets', fields: ['featuredAssetId', 'assetIds'] },
        { id: 'custom', label: 'Custom Fields', fields: ['customFields'] },
    ],

    fields: {
        id: id('Variant ID'),
        productId: {
            type: 'string',
            required: true,
            label: 'Product ID',
            description: 'Parent product',
        },
        sku: {
            type: 'string',
            required: true,
            label: 'SKU',
            validation: { minLength: 1, maxLength: 100 },
        },
        name: {
            type: 'string',
            required: true,
            label: 'Variant Name',
        },
        enabled: {
            type: 'boolean',
            label: 'Enabled',
            default: true,
        },
        price: money('Price'),
        currencyCode: currencyCode(),
        priceWithTax: money('Price with Tax'),
        taxCategoryId: {
            type: 'string',
            label: 'Tax Category ID',
        },
        stockOnHand: {
            type: 'integer',
            label: 'Stock on Hand',
            default: 0,
            validation: { min: 0 },
        },
        stockAllocated: {
            type: 'integer',
            label: 'Stock Allocated',
            default: 0,
            validation: { min: 0 },
        },
        outOfStockThreshold: {
            type: 'integer',
            label: 'Out of Stock Threshold',
            default: 0,
        },
        useGlobalOutOfStockThreshold: {
            type: 'boolean',
            label: 'Use Global Threshold',
            default: true,
        },
        trackInventory: {
            type: 'enum',
            label: 'Track Inventory',
            enum: ['TRUE', 'FALSE', 'INHERIT'],
            default: 'INHERIT',
        },
        optionIds: {
            type: 'array',
            label: 'Option IDs',
            items: { type: 'string' },
        },
        options: {
            type: 'array',
            label: 'Options',
            items: {
                type: 'object',
                fields: {
                    groupId: { type: 'string' },
                    groupCode: { type: 'string' },
                    code: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                },
            },
        },
        featuredAssetId: { type: 'string', label: 'Featured Asset ID' },
        assetIds: {
            type: 'array',
            label: 'Asset IDs',
            items: { type: 'string' },
        },
        facetValueIds: {
            type: 'array',
            label: 'Facet Value IDs',
            items: { type: 'string' },
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

