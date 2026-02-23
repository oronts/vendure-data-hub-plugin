/**
 * Complete Vendure Entity Schema Definitions
 *
 * These schemas define ALL fields for Vendure entities including:
 * - Core fields
 * - Relationships
 * - Custom fields placeholders
 * - Translations
 */

import type { EnhancedSchemaDefinition, EnhancedFieldDefinition } from '../types/index';
import { kebabToScreamingSnake } from '../../shared/utils/string-case';

// HELPER FUNCTIONS

function id(label: string = 'ID'): EnhancedFieldDefinition {
    return { type: 'string', required: true, label, description: 'Unique identifier' };
}

function timestamps(): Record<string, EnhancedFieldDefinition> {
    return {
        createdAt: { type: 'datetime', label: 'Created At', readonly: true },
        updatedAt: { type: 'datetime', label: 'Updated At', readonly: true },
    };
}

function money(label: string): EnhancedFieldDefinition {
    return {
        type: 'integer',
        label,
        description: 'Amount in minor units (cents)',
        validation: { min: 0 },
    };
}

function currencyCode(): EnhancedFieldDefinition {
    return {
        type: 'currency',
        label: 'Currency',
        default: 'USD',
    };
}

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

// ORDER SCHEMA

export const ORDER_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-order',
    label: 'Order',
    description: 'Customer orders with lines, payments, and fulfillments',
    primaryKey: 'code',

    groups: [
        { id: 'basic', label: 'Order Info', fields: ['id', 'code', 'state', 'active', 'orderPlacedAt'] },
        { id: 'customer', label: 'Customer', fields: ['customerId', 'customer'] },
        { id: 'lines', label: 'Order Lines', fields: ['lines', 'totalQuantity'] },
        { id: 'totals', label: 'Totals', fields: ['subTotal', 'subTotalWithTax', 'shipping', 'shippingWithTax', 'total', 'totalWithTax', 'currencyCode'] },
        { id: 'shipping', label: 'Shipping', fields: ['shippingAddress', 'shippingLines'] },
        { id: 'billing', label: 'Billing', fields: ['billingAddress'] },
        { id: 'payments', label: 'Payments', fields: ['payments'] },
        { id: 'fulfillments', label: 'Fulfillments', fields: ['fulfillments'] },
    ],

    fields: {
        id: id('Order ID'),
        code: {
            type: 'string',
            required: true,
            label: 'Order Code',
            description: 'Human-readable order reference',
        },
        state: {
            type: 'enum',
            required: true,
            label: 'Order State',
            enum: [
                'Created', 'AddingItems', 'ArrangingPayment',
                'PaymentAuthorized', 'PaymentSettled',
                'PartiallyShipped', 'Shipped',
                'PartiallyDelivered', 'Delivered',
                'Modifying', 'ArrangingAdditionalPayment',
                'Cancelled',
            ],
        },
        active: { type: 'boolean', label: 'Active' },
        orderPlacedAt: { type: 'datetime', label: 'Order Placed At' },
        couponCodes: {
            type: 'array',
            label: 'Coupon Codes',
            items: { type: 'string' },
        },
        customerId: { type: 'string', label: 'Customer ID' },
        customer: {
            type: 'object',
            label: 'Customer',
            fields: {
                id: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                emailAddress: { type: 'email' },
                phoneNumber: { type: 'phone' },
            },
        },
        lines: {
            type: 'array',
            required: true,
            label: 'Order Lines',
            validation: { minItems: 1 },
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    productVariantId: { type: 'string', required: true },
                    sku: { type: 'string' },
                    productName: { type: 'string' },
                    variantName: { type: 'string' },
                    quantity: { type: 'integer', required: true, validation: { min: 1 } },
                    unitPrice: money('Unit Price'),
                    unitPriceWithTax: money('Unit Price with Tax'),
                    linePrice: money('Line Price'),
                    linePriceWithTax: money('Line Price with Tax'),
                    discountedLinePrice: money('Discounted Line Price'),
                    discountedLinePriceWithTax: money('Discounted Line Price with Tax'),
                    taxRate: { type: 'float', label: 'Tax Rate' },
                    customFields: { type: 'json' },
                },
            },
        },
        totalQuantity: { type: 'integer', label: 'Total Quantity' },
        subTotal: money('Subtotal'),
        subTotalWithTax: money('Subtotal with Tax'),
        shipping: money('Shipping'),
        shippingWithTax: money('Shipping with Tax'),
        total: money('Total'),
        totalWithTax: money('Total with Tax'),
        currencyCode: currencyCode(),
        shippingAddress: {
            type: 'object',
            label: 'Shipping Address',
            fields: {
                fullName: { type: 'string' },
                company: { type: 'string' },
                streetLine1: { type: 'string' },
                streetLine2: { type: 'string' },
                city: { type: 'string' },
                province: { type: 'string' },
                postalCode: { type: 'string' },
                countryCode: { type: 'country' },
                phoneNumber: { type: 'phone' },
            },
        },
        billingAddress: {
            type: 'object',
            label: 'Billing Address',
            fields: {
                fullName: { type: 'string' },
                company: { type: 'string' },
                streetLine1: { type: 'string' },
                streetLine2: { type: 'string' },
                city: { type: 'string' },
                province: { type: 'string' },
                postalCode: { type: 'string' },
                countryCode: { type: 'country' },
                phoneNumber: { type: 'phone' },
            },
        },
        shippingLines: {
            type: 'array',
            label: 'Shipping Lines',
            items: {
                type: 'object',
                fields: {
                    shippingMethodId: { type: 'string' },
                    shippingMethodCode: { type: 'string' },
                    price: money('Shipping Price'),
                    priceWithTax: money('Shipping Price with Tax'),
                },
            },
        },
        payments: {
            type: 'array',
            label: 'Payments',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    method: { type: 'string' },
                    amount: money('Amount'),
                    state: { type: 'enum', enum: ['Created', 'Authorized', 'Settled', 'Declined', 'Error', 'Cancelled'] },
                    transactionId: { type: 'string' },
                    errorMessage: { type: 'string' },
                    metadata: { type: 'json' },
                },
            },
        },
        fulfillments: {
            type: 'array',
            label: 'Fulfillments',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    state: { type: 'enum', enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'] },
                    method: { type: 'string' },
                    trackingCode: { type: 'string' },
                    handlerCode: { type: 'string' },
                    lines: {
                        type: 'array',
                        items: {
                            type: 'object',
                            fields: {
                                orderLineId: { type: 'string' },
                                quantity: { type: 'integer' },
                            },
                        },
                    },
                },
            },
        },
        taxSummary: {
            type: 'array',
            label: 'Tax Summary',
            items: {
                type: 'object',
                fields: {
                    description: { type: 'string' },
                    taxRate: { type: 'float' },
                    taxBase: money('Tax Base'),
                    taxTotal: money('Tax Total'),
                },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// CUSTOMER SCHEMA

export const CUSTOMER_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-customer',
    label: 'Customer',
    description: 'Customer accounts with addresses and order history',
    primaryKey: 'emailAddress',

    groups: [
        { id: 'basic', label: 'Basic Info', fields: ['id', 'firstName', 'lastName', 'emailAddress', 'phoneNumber', 'title'] },
        { id: 'addresses', label: 'Addresses', fields: ['addresses', 'defaultShippingAddressId', 'defaultBillingAddressId'] },
        { id: 'groups', label: 'Groups', fields: ['groups'] },
        { id: 'account', label: 'Account', fields: ['user'] },
        { id: 'custom', label: 'Custom Fields', fields: ['customFields'] },
    ],

    fields: {
        id: id('Customer ID'),
        firstName: {
            type: 'string',
            required: true,
            label: 'First Name',
        },
        lastName: {
            type: 'string',
            required: true,
            label: 'Last Name',
        },
        emailAddress: {
            type: 'email',
            required: true,
            label: 'Email Address',
        },
        phoneNumber: {
            type: 'phone',
            label: 'Phone Number',
        },
        title: {
            type: 'string',
            label: 'Title',
        },
        addresses: {
            type: 'array',
            label: 'Addresses',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    fullName: { type: 'string' },
                    company: { type: 'string' },
                    streetLine1: { type: 'string', required: true },
                    streetLine2: { type: 'string' },
                    city: { type: 'string', required: true },
                    province: { type: 'string' },
                    postalCode: { type: 'string', required: true },
                    countryCode: { type: 'country', required: true },
                    phoneNumber: { type: 'phone' },
                    defaultShippingAddress: { type: 'boolean' },
                    defaultBillingAddress: { type: 'boolean' },
                    customFields: { type: 'json' },
                },
            },
        },
        defaultShippingAddressId: { type: 'string', label: 'Default Shipping Address ID' },
        defaultBillingAddressId: { type: 'string', label: 'Default Billing Address ID' },
        groups: {
            type: 'array',
            label: 'Customer Groups',
            items: {
                type: 'object',
                fields: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                },
            },
        },
        user: {
            type: 'object',
            label: 'User Account',
            fields: {
                id: { type: 'string' },
                identifier: { type: 'string' },
                verified: { type: 'boolean' },
                lastLogin: { type: 'datetime' },
            },
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

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

// SHIPPING METHOD SCHEMA

export const SHIPPING_METHOD_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-shipping-method',
    label: 'Shipping Method',
    description: 'Shipping method configurations with calculators and checkers',
    primaryKey: 'code',

    fields: {
        id: id('Shipping Method ID'),
        name: { type: 'string', required: true, label: 'Name' },
        code: { type: 'string', required: true, label: 'Code' },
        description: { type: 'text', label: 'Description' },
        fulfillmentHandler: {
            type: 'string',
            required: true,
            label: 'Fulfillment Handler',
            description: 'Code of the fulfillment handler to use',
        },
        calculator: {
            type: 'object',
            required: true,
            label: 'Calculator',
            description: 'Calculator configuration for shipping rates',
            fields: {
                code: { type: 'string', required: true },
                args: { type: 'json' },
            },
        },
        checker: {
            type: 'object',
            label: 'Checker',
            description: 'Optional checker to determine eligibility',
            fields: {
                code: { type: 'string', required: true },
                args: { type: 'json' },
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

// PAYMENT METHOD SCHEMA

export const PAYMENT_METHOD_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-payment-method',
    label: 'Payment Method',
    description: 'Payment method configurations with handlers and eligibility checkers',
    primaryKey: 'code',

    fields: {
        id: id('Payment Method ID'),
        name: { type: 'string', required: true, label: 'Name' },
        code: { type: 'string', required: true, label: 'Code' },
        description: { type: 'text', label: 'Description' },
        enabled: { type: 'boolean', label: 'Enabled', default: true },
        handler: {
            type: 'object',
            required: true,
            label: 'Handler',
            description: 'Payment handler configuration',
            fields: {
                code: { type: 'string', required: true },
                args: { type: 'json' },
            },
        },
        checker: {
            type: 'object',
            label: 'Checker',
            description: 'Eligibility checker configuration',
            fields: {
                code: { type: 'string', required: true },
                args: { type: 'json' },
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

// TAX RATE SCHEMA

export const TAX_RATE_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-tax-rate',
    label: 'Tax Rate',
    description: 'Tax rate configurations with category and zone resolution',
    primaryKey: 'name',

    fields: {
        id: id('Tax Rate ID'),
        name: { type: 'string', required: true, label: 'Name' },
        value: {
            type: 'float',
            required: true,
            label: 'Rate (%)',
            description: 'Tax rate percentage (e.g., 20 for 20%)',
            validation: { min: 0, max: 100 },
        },
        enabled: { type: 'boolean', label: 'Enabled', default: true },
        taxCategoryCode: {
            type: 'string',
            label: 'Tax Category Code',
            description: 'Code of the tax category this rate belongs to',
        },
        taxCategoryId: {
            type: 'string',
            label: 'Tax Category ID',
            description: 'ID of the tax category (alternative to taxCategoryCode)',
        },
        zoneCode: {
            type: 'string',
            label: 'Zone Code',
            description: 'Code of the zone where this tax rate applies',
        },
        zoneId: {
            type: 'string',
            label: 'Zone ID',
            description: 'ID of the zone (alternative to zoneCode)',
        },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// STOCK LOCATION SCHEMA

export const STOCK_LOCATION_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-stock-location',
    label: 'Stock Location',
    description: 'Inventory locations and warehouses',
    primaryKey: 'name',

    fields: {
        id: id('Stock Location ID'),
        name: { type: 'string', required: true, label: 'Name' },
        description: { type: 'text', label: 'Description' },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// CHANNEL SCHEMA

export const CHANNEL_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'vendure-channel',
    label: 'Channel',
    description: 'Sales channel configurations',
    primaryKey: 'code',

    fields: {
        id: id('Channel ID'),
        code: { type: 'string', required: true, label: 'Code' },
        token: {
            type: 'string',
            label: 'Token',
            description: 'Unique identifier used in API requests',
        },
        defaultLanguageCode: {
            type: 'locale',
            required: true,
            label: 'Default Language',
        },
        availableLanguageCodes: {
            type: 'array',
            label: 'Available Languages',
            items: { type: 'locale' },
        },
        defaultCurrencyCode: {
            type: 'currency',
            required: true,
            label: 'Default Currency',
        },
        availableCurrencyCodes: {
            type: 'array',
            label: 'Available Currencies',
            items: { type: 'currency' },
        },
        pricesIncludeTax: {
            type: 'boolean',
            label: 'Prices Include Tax',
            default: false,
        },
        defaultTaxZoneCode: { type: 'string', label: 'Default Tax Zone Code' },
        defaultTaxZoneId: { type: 'string', label: 'Default Tax Zone ID' },
        defaultShippingZoneCode: { type: 'string', label: 'Default Shipping Zone Code' },
        defaultShippingZoneId: { type: 'string', label: 'Default Shipping Zone ID' },
        sellerId: { type: 'string', label: 'Seller ID' },
        customFields: { type: 'json', label: 'Custom Fields' },
        ...timestamps(),
    },
};

// EXPORT ALL SCHEMAS

export const VENDURE_ENTITY_SCHEMAS: Record<string, EnhancedSchemaDefinition> = {
    'product': PRODUCT_SCHEMA,
    'product-variant': PRODUCT_VARIANT_SCHEMA,
    'order': ORDER_SCHEMA,
    'customer': CUSTOMER_SCHEMA,
    'customer-group': CUSTOMER_GROUP_SCHEMA,
    'collection': COLLECTION_SCHEMA,
    'facet': FACET_SCHEMA,
    'facet-value': FACET_VALUE_SCHEMA,
    'asset': ASSET_SCHEMA,
    'inventory': STOCK_LEVEL_SCHEMA,
    'promotion': PROMOTION_SCHEMA,
    'shipping-method': SHIPPING_METHOD_SCHEMA,
    'payment-method': PAYMENT_METHOD_SCHEMA,
    'tax-rate': TAX_RATE_SCHEMA,
    'stock-location': STOCK_LOCATION_SCHEMA,
    'channel': CHANNEL_SCHEMA,
};

/** Auto-derived from VENDURE_ENTITY_SCHEMAS. Used by dashboard for entity selection UI. */
export const VENDURE_ENTITY_LIST = Object.entries(VENDURE_ENTITY_SCHEMAS).map(
    ([code, schema]) => ({
        code,
        name: schema.label ?? code,
        description: schema.description ?? '',
    }),
);

/** Auto-derived from VENDURE_ENTITY_SCHEMAS. Keyed by SCREAMING_SNAKE entity type for resolver use. */
export const ENTITY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    Object.entries(VENDURE_ENTITY_SCHEMAS).map(([key, schema]) => [
        kebabToScreamingSnake(key),
        schema.description ?? '',
    ]),
);
