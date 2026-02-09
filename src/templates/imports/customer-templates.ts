/**
 * Customer Import Templates
 */

import { ImportTemplate } from './types';

/**
 * Simple Customers CSV Template
 */
export const simpleCustomersTemplate: ImportTemplate = {
    id: 'simple-customers-csv',
    name: 'Simple Customers (CSV)',
    description: 'Import customer records with email, name, and optional phone number. Ideal for building your customer base.',
    category: 'customers',
    icon: 'users',
    difficulty: 'beginner',
    estimatedTime: '5 minutes',
    requiredFields: ['email', 'first_name', 'last_name'],
    optionalFields: ['phone', 'address_line1', 'city', 'postal_code', 'country'],
    formats: ['csv'],
    tags: ['initial-import'],
    featured: true,
    sortOrder: 1,
    sampleData: [
        { email: 'john@example.com', first_name: 'John', last_name: 'Doe', phone: '+1234567890' },
        { email: 'jane@example.com', first_name: 'Jane', last_name: 'Smith', phone: '+0987654321' },
    ],
    definition: {
        version: 1,
        type: 'IMPORT',
        source: {
            type: 'FILE_UPLOAD',
            format: {
                format: 'CSV',
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
            entity: 'CUSTOMER',
            operation: 'UPSERT',
            lookupFields: ['emailAddress'],
        },
        mappings: [
            {
                source: 'email',
                target: 'emailAddress',
                required: true,
                transforms: [
                    { type: 'LOWERCASE' },
                    { type: 'TRIM' },
                ],
            },
            {
                source: 'first_name',
                target: 'firstName',
                required: true,
                transforms: [{ type: 'TRIM' }],
            },
            {
                source: 'last_name',
                target: 'lastName',
                required: true,
                transforms: [{ type: 'TRIM' }],
            },
            { source: 'phone', target: 'phoneNumber' },
        ],
        options: {
            batchSize: 100,
            onError: 'SKIP',
            skipDuplicates: true,
        },
    },
};

/**
 * Customers with Addresses CSV Template
 */
export const customersWithAddressesTemplate: ImportTemplate = {
    id: 'customers-with-addresses-csv',
    name: 'Customers with Addresses (CSV)',
    description: 'Import customers with full address information for shipping and billing. Supports multiple addresses per customer.',
    category: 'customers',
    icon: 'map-pin',
    difficulty: 'intermediate',
    estimatedTime: '10 minutes',
    requiredFields: ['email', 'first_name', 'last_name', 'street', 'city', 'postal_code', 'country_code'],
    optionalFields: ['phone', 'company', 'province', 'customer_group'],
    formats: ['csv'],
    tags: ['initial-import', 'migration'],
    sortOrder: 2,
    sampleData: [
        {
            email: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
            street: '123 Main St',
            city: 'New York',
            postal_code: '10001',
            country_code: 'US',
        },
    ],
    definition: {
        version: 1,
        type: 'IMPORT',
        source: {
            type: 'FILE_UPLOAD',
            format: {
                format: 'CSV',
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
            entity: 'CUSTOMER',
            operation: 'UPSERT',
            lookupFields: ['emailAddress'],
        },
        mappings: [
            { source: 'email', target: 'emailAddress', required: true },
            { source: 'first_name', target: 'firstName', required: true },
            { source: 'last_name', target: 'lastName', required: true },
            { source: 'phone', target: 'phoneNumber' },
            { source: 'street', target: 'addresses[0].streetLine1' },
            { source: 'city', target: 'addresses[0].city' },
            { source: 'postal_code', target: 'addresses[0].postalCode' },
            {
                source: 'country_code',
                target: 'addresses[0].countryCode',
                transforms: [{ type: 'UPPERCASE' }],
            },
            { source: 'province', target: 'addresses[0].province' },
            { source: 'customer_group', target: 'groupCodes' },
        ],
        options: {
            batchSize: 50,
            onError: 'SKIP',
        },
    },
};

/**
 * All customer templates
 */
export const customerTemplates: ImportTemplate[] = [
    simpleCustomersTemplate,
    customersWithAddressesTemplate,
];
