import type { EnhancedSchemaDefinition } from '../types/index';
import { currencyCode, id, money, timestamps } from './schema-field-builders';

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

