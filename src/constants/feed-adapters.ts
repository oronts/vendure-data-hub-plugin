/**
 * Feed adapter definitions - Product feeds for marketplaces and advertising
 */
import { AdapterDefinition } from '../sdk/types';

export const FEED_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'feed',
        code: 'googleMerchant',
        description: 'Generate Google Merchant Center product feed.',
        category: 'external',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true, description: 'File path or URL' },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: 'xml', label: 'XML (RSS 2.0)' },
                    { value: 'tsv', label: 'TSV (tab-separated)' },
                ] },
                { key: 'targetCountry', label: 'Target country', type: 'string', required: true, description: 'ISO country code (e.g., US)' },
                { key: 'contentLanguage', label: 'Content language', type: 'string', required: true, description: 'ISO language code (e.g., en)' },
                { key: 'currency', label: 'Currency', type: 'string', required: true, description: 'ISO currency code (e.g., USD)' },
                { key: 'channelId', label: 'Channel', type: 'string', description: 'Vendure channel to use' },
                { key: 'includeOutOfStock', label: 'Include out of stock', type: 'boolean' },
                { key: 'storeName', label: 'Store name', type: 'string' },
                { key: 'storeUrl', label: 'Store URL', type: 'string', required: true },
                { key: 'shippingInfo', label: 'Shipping info', type: 'json', description: 'Default shipping configuration' },
            ],
        },
    },
    {
        type: 'feed',
        code: 'metaCatalog',
        description: 'Generate Meta (Facebook/Instagram) product catalog feed.',
        category: 'external',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: 'csv', label: 'CSV' },
                    { value: 'xml', label: 'XML' },
                ] },
                { key: 'currency', label: 'Currency', type: 'string', required: true },
                { key: 'channelId', label: 'Channel', type: 'string' },
                { key: 'brandField', label: 'Brand field', type: 'string', description: 'Field path for brand' },
                { key: 'categoryField', label: 'Category field', type: 'string', description: 'Field path for Google category' },
                { key: 'includeVariants', label: 'Include variants', type: 'boolean' },
            ],
        },
    },
    {
        type: 'feed',
        code: 'amazonFeed',
        description: 'Generate Amazon product feed.',
        category: 'external',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                { key: 'marketplace', label: 'Marketplace', type: 'select', required: true, options: [
                    { value: 'US', label: 'Amazon.com (US)' },
                    { value: 'UK', label: 'Amazon.co.uk (UK)' },
                    { value: 'DE', label: 'Amazon.de (Germany)' },
                    { value: 'FR', label: 'Amazon.fr (France)' },
                    { value: 'CA', label: 'Amazon.ca (Canada)' },
                ] },
                { key: 'feedType', label: 'Feed type', type: 'select', options: [
                    { value: 'inventory', label: 'Inventory' },
                    { value: 'pricing', label: 'Pricing' },
                    { value: 'product', label: 'Product' },
                ] },
                { key: 'sellerId', label: 'Seller ID', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'feed',
        code: 'customFeed',
        description: 'Generate custom product feed with flexible field mapping.',
        category: 'external',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: 'xml', label: 'XML' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'json', label: 'JSON' },
                    { value: 'tsv', label: 'TSV' },
                ] },
                { key: 'template', label: 'Template', type: 'textarea', description: 'Template for item rendering (uses Handlebars)' },
                { key: 'fieldMapping', label: 'Field mapping', type: 'json', required: true, description: 'Map source fields to feed fields' },
                { key: 'rootElement', label: 'Root element (XML)', type: 'string' },
                { key: 'itemElement', label: 'Item element (XML)', type: 'string' },
                { key: 'connectionCode', label: 'Upload connection', type: 'string' },
            ],
        },
    },
];
