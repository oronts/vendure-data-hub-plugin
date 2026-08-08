import type { EnhancedSchemaDefinition } from '../types/index';
import { id, timestamps } from './schema-field-builders';

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
            description: 'Code stored in the TaxCategory customFields.code field',
        },
        taxCategoryId: {
            type: 'string',
            label: 'Tax Category ID',
            description: 'ID of the tax category (alternative to taxCategoryCode)',
        },
        zoneCode: {
            type: 'string',
            label: 'Zone Code',
            description: 'Code stored in the Zone customFields.code field',
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

