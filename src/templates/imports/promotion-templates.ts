/**
 * Promotion Import Templates
 */

import { ImportTemplate } from './types';

/**
 * Discount Coupons CSV Template
 */
export const couponsTemplate: ImportTemplate = {
    id: 'coupons-csv',
    name: 'Discount Coupons (CSV)',
    description: 'Import coupon codes with discount amounts, validity dates, and usage limits for promotional campaigns.',
    category: 'promotions',
    icon: 'percent',
    requiredFields: ['name', 'coupon_code'],
    optionalFields: ['discount_percentage', 'discount_amount', 'starts_at', 'ends_at', 'usage_limit'],
    formats: ['csv'],
    tags: ['initial-import', 'bulk-update'],
    featured: true,
    sortOrder: 1,
    sampleData: [
        { name: 'Summer Sale', coupon_code: 'SUMMER20', discount_percentage: '20', starts_at: '2024-06-01', ends_at: '2024-08-31', usage_limit: '100' },
        { name: 'New Customer', coupon_code: 'WELCOME10', discount_percentage: '10', starts_at: '', ends_at: '', usage_limit: '1' },
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
            entity: 'PROMOTION',
            operation: 'UPSERT',
            lookupFields: ['couponCode'],
        },
        mappings: [
            { source: 'name', target: 'name', required: true },
            {
                source: 'coupon_code',
                target: 'couponCode',
                required: true,
                transforms: [{ type: 'UPPERCASE' }],
            },
            {
                source: 'discount_percentage',
                target: 'actions[0].args.discount',
                transforms: [{ type: 'PARSE_INT' }],
            },
            {
                source: 'starts_at',
                target: 'startsAt',
                transforms: [{ type: 'PARSE_DATE' }],
            },
            {
                source: 'ends_at',
                target: 'endsAt',
                transforms: [{ type: 'PARSE_DATE' }],
            },
            {
                source: 'usage_limit',
                target: 'usageLimit',
                transforms: [{ type: 'PARSE_INT' }],
            },
        ],
        options: {
            batchSize: 50,
            onError: 'SKIP',
        },
    },
};

/**
 * All promotion templates
 */
export const promotionTemplates: ImportTemplate[] = [
    couponsTemplate,
];
