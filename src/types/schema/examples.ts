/**
 * Example Schema Definitions
 */

import type { EnhancedSchemaDefinition } from '../index';

/**
 * Example: Product Import Schema
 */
export const EXAMPLE_PRODUCT_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'product-import',

    primaryKey: 'sku',

    groups: [
        { id: 'basic', label: 'Basic Info', fields: ['sku', 'name', 'description', 'slug'] },
        { id: 'pricing', label: 'Pricing', fields: ['price', 'currency', 'taxCategory'] },
        { id: 'inventory', label: 'Inventory', fields: ['stock', 'trackInventory', 'stockLocations'] },
        { id: 'media', label: 'Media', fields: ['images', 'featuredImage'] },
        { id: 'attributes', label: 'Attributes', fields: ['facets', 'customFields'] },
    ],

    fields: {
        sku: {
            type: 'string',
            required: true,
            label: 'SKU',
            description: 'Unique product identifier',
            validation: {
                minLength: 1,
                maxLength: 50,
                pattern: '^[A-Z0-9-]+$',
                patternMessage: 'SKU must be uppercase letters, numbers, and hyphens only',
            },
            transform: [{ type: 'trim' }, { type: 'uppercase' }],
            ui: { placeholder: 'ABC-123' },
        },

        name: {
            type: 'string',
            required: true,
            label: 'Product Name',
            validation: { minLength: 3, maxLength: 255 },
            transform: [{ type: 'trim' }],
        },

        description: {
            type: 'text',
            label: 'Description',
            ui: { widget: 'rich-text' },
        },

        slug: {
            type: 'slug',
            label: 'URL Slug',
            defaultExpression: 'slugify(name)',
        },

        price: {
            type: 'decimal',
            required: true,
            label: 'Price',
            precision: 10,
            scale: 2,
            validation: { min: 0 },
            currencyField: 'currency',
        },

        currency: {
            type: 'currency',
            required: true,
            label: 'Currency',
            default: 'USD',
            enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
        },

        taxCategory: {
            type: 'string',
            label: 'Tax Category',
            default: 'standard',
        },

        stock: {
            type: 'integer',
            label: 'Stock Quantity',
            default: 0,
            validation: { min: 0 },
        },

        trackInventory: {
            type: 'boolean',
            label: 'Track Inventory',
            default: true,
        },

        stockLocations: {
            type: 'map',
            label: 'Stock by Location',
            description: 'Stock quantity per location code',
            values: {
                type: 'integer',
                validation: { min: 0 },
            },
            example: { 'warehouse-1': 100, 'warehouse-2': 50 },
        },

        images: {
            type: 'array',
            label: 'Product Images',
            items: {
                type: 'object',
                fields: {
                    url: { type: 'url', required: true },
                    alt: { type: 'string' },
                    order: { type: 'integer', default: 0 },
                },
            },
            validation: { maxItems: 20 },
        },

        featuredImage: {
            type: 'url',
            label: 'Featured Image URL',
        },

        facets: {
            type: 'array',
            label: 'Facet Values',
            items: {
                type: 'object',
                fields: {
                    facetCode: { type: 'string', required: true },
                    valueCode: { type: 'string', required: true },
                },
            },
        },

        customFields: {
            type: 'object',
            label: 'Custom Fields',
            description: 'Arbitrary custom field values',
            fields: {},  // Dynamic - any fields allowed
            validation: { additionalProperties: true },
        },

        variants: {
            type: 'array',
            label: 'Product Variants',
            items: {
                type: 'object',
                fields: {
                    sku: { type: 'string', required: true },
                    name: { type: 'string' },
                    price: { type: 'decimal', precision: 10, scale: 2 },
                    stock: { type: 'integer', default: 0 },
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            fields: {
                                name: { type: 'string', required: true },
                                value: { type: 'string', required: true },
                            },
                        },
                    },
                },
            },
        },
    },

    rules: [
        {
            id: 'price-positive',
            expression: 'price >= 0',
            message: 'Price must be positive',
        },
    ],

    computed: {
        fullName: {
            type: 'string',
            expression: 'concat(sku, " - ", name)',
            dependencies: ['sku', 'name'],
        },
    },
};

/**
 * Example: Order Export Schema
 */
export const EXAMPLE_ORDER_SCHEMA: EnhancedSchemaDefinition = {
    $version: '1.0.0',
    $id: 'order-export',

    primaryKey: 'orderCode',

    fields: {
        orderCode: {
            type: 'string',
            required: true,
            label: 'Order Code',
        },

        orderDate: {
            type: 'datetime',
            required: true,
            label: 'Order Date',
        },

        customer: {
            type: 'object',
            required: true,
            label: 'Customer',
            fields: {
                email: { type: 'email', required: true },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                phone: { type: 'phone' },
            },
        },

        shippingAddress: {
            type: 'object',
            label: 'Shipping Address',
            fields: {
                fullName: { type: 'string', required: true },
                streetLine1: { type: 'string', required: true },
                streetLine2: { type: 'string' },
                city: { type: 'string', required: true },
                province: { type: 'string' },
                postalCode: { type: 'string', required: true },
                country: { type: 'country', required: true },
            },
        },

        billingAddress: {
            type: 'ref',
            ref: 'address',  // Reference to a separate address schema
            label: 'Billing Address',
        },

        lines: {
            type: 'array',
            required: true,
            label: 'Order Lines',
            validation: { minItems: 1 },
            items: {
                type: 'object',
                fields: {
                    sku: { type: 'string', required: true },
                    productName: { type: 'string', required: true },
                    quantity: { type: 'integer', required: true, validation: { min: 1 } },
                    unitPrice: { type: 'decimal', required: true, precision: 10, scale: 2 },
                    lineTotal: { type: 'decimal', precision: 10, scale: 2 },
                    discounts: {
                        type: 'array',
                        items: {
                            type: 'object',
                            fields: {
                                code: { type: 'string' },
                                description: { type: 'string' },
                                amount: { type: 'decimal', precision: 10, scale: 2 },
                            },
                        },
                    },
                },
            },
        },

        totals: {
            type: 'object',
            label: 'Order Totals',
            fields: {
                subtotal: { type: 'decimal', precision: 10, scale: 2 },
                shipping: { type: 'decimal', precision: 10, scale: 2 },
                tax: { type: 'decimal', precision: 10, scale: 2 },
                discount: { type: 'decimal', precision: 10, scale: 2 },
                total: { type: 'decimal', required: true, precision: 10, scale: 2 },
            },
        },

        currency: {
            type: 'currency',
            required: true,
            default: 'USD',
        },

        state: {
            type: 'enum',
            required: true,
            label: 'Order State',
            enum: ['Created', 'AddingItems', 'ArrangingPayment', 'PaymentAuthorized', 'PaymentSettled', 'PartiallyShipped', 'Shipped', 'PartiallyDelivered', 'Delivered', 'Cancelled'],
            enumLabels: {
                'Created': 'Created',
                'AddingItems': 'Adding Items',
                'ArrangingPayment': 'Arranging Payment',
                'PaymentAuthorized': 'Payment Authorized',
                'PaymentSettled': 'Payment Settled',
                'PartiallyShipped': 'Partially Shipped',
                'Shipped': 'Shipped',
                'PartiallyDelivered': 'Partially Delivered',
                'Delivered': 'Delivered',
                'Cancelled': 'Cancelled',
            },
        },

        payments: {
            type: 'array',
            label: 'Payments',
            items: {
                type: 'object',
                fields: {
                    method: { type: 'string', required: true },
                    amount: { type: 'decimal', required: true, precision: 10, scale: 2 },
                    state: { type: 'enum', enum: ['Created', 'Authorized', 'Settled', 'Declined', 'Error', 'Cancelled'] },
                    transactionId: { type: 'string' },
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
                    method: { type: 'string' },
                    trackingCode: { type: 'string' },
                    carrier: { type: 'string' },
                    state: { type: 'enum', enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'] },
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

        notes: {
            type: 'array',
            label: 'Order Notes',
            items: {
                type: 'object',
                fields: {
                    note: { type: 'text', required: true },
                    isPrivate: { type: 'boolean', default: true },
                    createdAt: { type: 'datetime' },
                },
            },
        },

        metadata: {
            type: 'json',
            label: 'Custom Metadata',
            description: 'Arbitrary JSON data',
        },
    },

    rules: [
        {
            id: 'total-positive',
            expression: 'totals.total >= 0',
            message: 'Order total must be positive',
        },
        {
            id: 'lines-not-empty',
            expression: 'lines.length > 0',
            message: 'Order must have at least one line item',
        },
    ],
};
