import type { EntityFieldSchema } from '../../types';
import { VendureEntityType } from '../../constants/enums';

export const ORDER_FIELD_SCHEMA: EntityFieldSchema = {
    entityType: VendureEntityType.ORDER,
    fields: [
        {
            key: 'code',
            label: 'Order Code',
            type: 'string',
            lookupable: true,
            description: 'Unique order code (auto-generated if not provided)',
            example: 'ORD-2024-001',
        },
        {
            key: 'customerEmail',
            label: 'Customer Email',
            type: 'string',
            required: true,
            description: 'Email of the customer placing the order',
            example: 'customer@example.com',
        },
        {
            key: 'lines',
            label: 'Order Lines',
            type: 'array',
            required: true,
            description: 'Array of line items',
            children: [
                { key: 'sku', label: 'Product SKU', type: 'string', required: true },
                { key: 'quantity', label: 'Quantity', type: 'number', required: true },
                {
                    key: 'unitPrice',
                    label: 'Unit Price',
                    type: 'number',
                    description: 'Unit price in minor units (informational - Vendure uses variant price at time of import)',
                },
                { key: 'customFields', label: 'Custom Fields', type: 'object' },
            ],
        },
        {
            key: 'shippingAddress',
            label: 'Shipping Address',
            type: 'object',
            description: 'Shipping address details',
            children: [
                { key: 'fullName', label: 'Full Name', type: 'string' },
                { key: 'streetLine1', label: 'Street Line 1', type: 'string', required: true },
                { key: 'streetLine2', label: 'Street Line 2', type: 'string' },
                { key: 'city', label: 'City', type: 'string', required: true },
                { key: 'province', label: 'Province/State', type: 'string' },
                { key: 'postalCode', label: 'Postal Code', type: 'string', required: true },
                { key: 'countryCode', label: 'Country Code', type: 'string', required: true },
                { key: 'phoneNumber', label: 'Phone', type: 'string' },
            ],
        },
        {
            key: 'billingAddress',
            label: 'Billing Address',
            type: 'object',
            description: 'Billing address (defaults to shipping if not provided)',
        },
        {
            key: 'shippingMethodCode',
            label: 'Shipping Method',
            type: 'string',
            description: 'Code of the shipping method to use (auto-resolved if not provided)',
            example: 'standard-shipping',
        },
        {
            key: 'paymentMethodCode',
            label: 'Payment Method',
            type: 'string',
            description: 'Code of the payment method for state transitions (auto-resolved if not provided)',
            example: 'standard-payment',
        },
        {
            key: 'state',
            label: 'Order State',
            type: 'string',
            description: 'Target order state after import',
            example: 'PaymentSettled',
        },
        {
            key: 'orderPlacedAt',
            label: 'Order Date',
            type: 'date',
            description: 'Original order placement date (ISO 8601)',
            example: '2024-01-15T10:30:00Z',
        },
        {
            key: 'metadata',
            label: 'Metadata',
            type: 'object',
            description: 'Additional metadata from source system (stored via customFields - Vendure has no native metadata field)',
        },
        {
            key: 'customFields',
            label: 'Custom Fields',
            type: 'object',
            description: 'Custom field values',
        },
    ],
};
