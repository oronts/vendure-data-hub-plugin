/**
 * Initial Data for Dev Server
 *
 * This data is used to populate a fresh database with the minimum
 * required Vendure entities (zones, countries, tax rates, etc.)
 */
import { InitialData, LanguageCode, CurrencyCode } from '@vendure/core';

export const initialData: InitialData = {
    defaultLanguage: LanguageCode.en,
    defaultZone: 'Americas',
    taxRates: [
        { name: 'Standard Tax', percentage: 0 },
    ],
    shippingMethods: [
        { name: 'Standard Shipping', price: 500 },
        { name: 'Express Shipping', price: 1000 },
    ],
    paymentMethods: [
        {
            name: 'Standard Payment',
            handler: {
                code: 'dummy-payment-handler',
                arguments: [{ name: 'automaticSettle', value: 'true' }],
            },
        },
    ],
    countries: [
        { name: 'United States', code: 'US', zone: 'Americas' },
        { name: 'United Kingdom', code: 'GB', zone: 'Europe' },
        { name: 'Germany', code: 'DE', zone: 'Europe' },
        { name: 'France', code: 'FR', zone: 'Europe' },
        { name: 'Canada', code: 'CA', zone: 'Americas' },
        { name: 'Australia', code: 'AU', zone: 'Oceania' },
    ],
    collections: [
        {
            name: 'All Products',
            filters: [
                {
                    code: 'facet-value-filter',
                    args: { facetValueNames: [''], containsAny: false },
                },
            ],
            assetPaths: [],
        },
    ],
};
