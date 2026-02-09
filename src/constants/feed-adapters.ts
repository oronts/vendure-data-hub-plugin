/**
 * Feed adapter definitions - Product feeds for marketplaces and advertising
 */
import { AdapterDefinition } from '../sdk/types';
import { FileFormat } from './enums';

export const FEED_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'FEED',
        code: 'googleMerchant',
        description: 'Generate Google Merchant Center product feed.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true, description: 'File path or URL' },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: FileFormat.XML, label: 'XML (RSS 2.0)' },
                    { value: FileFormat.TSV, label: 'TSV (tab-separated)' },
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
        type: 'FEED',
        code: 'metaCatalog',
        description: 'Generate Meta (Facebook/Instagram) product catalog feed.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: FileFormat.CSV, label: 'CSV' },
                    { value: FileFormat.XML, label: 'XML' },
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
        type: 'FEED',
        code: 'amazonFeed',
        description: 'Generate Amazon Seller Central inventory feed.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true, description: 'File path for the feed output' },
                { key: 'currency', label: 'Currency', type: 'string', required: true, description: 'ISO currency code (e.g., USD)' },
                { key: 'channelId', label: 'Channel', type: 'string', description: 'Vendure channel to use' },
                { key: 'titleField', label: 'Title field', type: 'string', description: 'Field path for product title' },
                { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field path for description' },
                { key: 'priceField', label: 'Price field', type: 'string', description: 'Field path for price' },
                { key: 'imageField', label: 'Image field', type: 'string', description: 'Field path for main image URL' },
                { key: 'brandField', label: 'Brand field', type: 'string', description: 'Field path for brand' },
                { key: 'gtinField', label: 'GTIN field', type: 'string', description: 'Field path for UPC/EAN/GTIN' },
            ],
        },
    },
    {
        type: 'FEED',
        code: 'customFeed',
        description: 'Generate custom product feed with configurable field mapping.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                { key: 'format', label: 'Format', type: 'select', required: true, options: [
                    { value: FileFormat.XML, label: 'XML' },
                    { value: FileFormat.CSV, label: 'CSV' },
                    { value: FileFormat.JSON, label: 'JSON' },
                    { value: FileFormat.TSV, label: 'TSV' },
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
