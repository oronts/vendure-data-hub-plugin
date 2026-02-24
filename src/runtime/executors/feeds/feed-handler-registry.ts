/**
 * Feed Handler Registry
 *
 * Single source of truth for feed adapter definitions AND handler functions.
 * Adding a new feed handler requires only:
 * 1. Create the handler file in this directory
 * 2. Add its entry to FEED_HANDLER_REGISTRY below
 *
 * BUILTIN_ADAPTERS, FEED_CODE constants, and the FeedExecutor
 * all derive from this registry automatically.
 */
import { AdapterDefinition } from '../../../sdk/types';
import {
    GOOGLE_MERCHANT_FORMAT_OPTIONS,
    META_CATALOG_FORMAT_OPTIONS,
    CUSTOM_FEED_FORMAT_OPTIONS,
} from '../../../constants/adapter-schema-options';
import { FeedHandlerFn } from './feed-handler.types';
import { googleMerchantFeedHandler } from './google-merchant-feed.handler';
import { metaCatalogFeedHandler } from './meta-catalog-feed.handler';
import { amazonFeedHandler } from './amazon-feed.handler';
import { customFeedHandler } from './custom-feed.handler';

/**
 * Registry entry carrying both the handler function and its adapter definition.
 */
interface FeedRegistryEntry {
    handler: FeedHandlerFn;
    definition: AdapterDefinition;
}

/**
 * Maps each feed code to its corresponding handler function and adapter definition.
 * Used by FeedExecutor for dispatch and BUILTIN_ADAPTERS for UI rendering.
 */
export const FEED_HANDLER_REGISTRY = new Map<string, FeedRegistryEntry>([
    ['googleMerchant', {
        handler: googleMerchantFeedHandler,
        definition: {
            type: 'FEED',
            code: 'googleMerchant',
            name: 'Google Merchant',
            description: 'Generate Google Merchant Center product feed.',
            category: 'EXTERNAL',
            icon: 'shopping-cart',
            color: '#4285f4',
            formatType: 'XML',
            schema: {
                fields: [
                    { key: 'outputPath', label: 'Output path', type: 'string', required: true, description: 'File path or URL' },
                    { key: 'format', label: 'Format', type: 'select', required: true, options: GOOGLE_MERCHANT_FORMAT_OPTIONS },
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
    }],
    ['metaCatalog', {
        handler: metaCatalogFeedHandler,
        definition: {
            type: 'FEED',
            code: 'metaCatalog',
            name: 'Meta Catalog',
            description: 'Generate Meta (Facebook/Instagram) product catalog feed.',
            category: 'EXTERNAL',
            icon: 'users',
            color: '#1877f2',
            formatType: 'CSV',
            schema: {
                fields: [
                    { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                    { key: 'format', label: 'Format', type: 'select', required: true, options: META_CATALOG_FORMAT_OPTIONS },
                    { key: 'currency', label: 'Currency', type: 'string', required: true },
                    { key: 'channelId', label: 'Channel', type: 'string' },
                    { key: 'brandField', label: 'Brand field', type: 'string', description: 'Field path for brand' },
                    { key: 'categoryField', label: 'Category field', type: 'string', description: 'Field path for Google category' },
                    { key: 'includeVariants', label: 'Include variants', type: 'boolean' },
                ],
            },
        },
    }],
    ['amazonFeed', {
        handler: amazonFeedHandler,
        definition: {
            type: 'FEED',
            code: 'amazonFeed',
            name: 'Amazon',
            description: 'Generate Amazon Seller Central inventory feed.',
            category: 'EXTERNAL',
            icon: 'shopping-cart',
            color: '#ff9900',
            formatType: 'XML',
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
    }],
    ['customFeed', {
        handler: customFeedHandler,
        definition: {
            type: 'FEED',
            code: 'customFeed',
            name: 'Custom Feed',
            description: 'Generate custom product feed with configurable field mapping.',
            category: 'EXTERNAL',
            icon: 'code',
            color: '#8b5cf6',
            schema: {
                fields: [
                    { key: 'outputPath', label: 'Output path', type: 'string', required: true },
                    { key: 'format', label: 'Format', type: 'select', required: true, options: CUSTOM_FEED_FORMAT_OPTIONS },
                    { key: 'template', label: 'Template', type: 'textarea', description: 'Template for item rendering (uses Handlebars)' },
                    { key: 'fieldMapping', label: 'Field mapping', type: 'json', required: true, description: 'Map source fields to feed fields' },
                    { key: 'rootElement', label: 'Root element (XML)', type: 'string' },
                    { key: 'itemElement', label: 'Item element (XML)', type: 'string' },
                    { key: 'connectionCode', label: 'Upload connection', type: 'string' },
                ],
            },
        },
    }],
]);

/** All feed adapter definitions, auto-derived from the registry */
export const FEED_ADAPTERS: AdapterDefinition[] =
    Array.from(FEED_HANDLER_REGISTRY.values()).map(e => e.definition);

/**
 * Auto-derived feed code constants from registry keys.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'googleMerchant' -> FEED_CODE.GOOGLE_MERCHANT = 'googleMerchant'
 */
export const FEED_CODE = Object.fromEntries(
    Array.from(FEED_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;

/**
 * Auto-derived feed format → adapter code mappings.
 * Values are SCREAMING_SNAKE_CASE of adapter codes (matching FormatStep's toFormatId()).
 * Served via GraphQL configOptions for the wizard's format-to-adapter resolution.
 */
export const FEED_ADAPTER_CODES: Array<{ value: string; label: string; adapterCode: string }> =
    Array.from(FEED_HANDLER_REGISTRY.values()).map(e => ({
        value: e.definition.code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        label: e.definition.name ?? e.definition.code,
        adapterCode: e.definition.code,
    }));
