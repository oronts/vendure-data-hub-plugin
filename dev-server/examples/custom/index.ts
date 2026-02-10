/**
 * Custom Adapter Examples
 *
 * Working implementations of custom operators, extractors, and loaders.
 */

import { createPipeline } from '../../../src';

// Custom Operators
export {
    currencyConvertOperator,
    currencyConvertSchema,
} from './operators/currency-convert.operator';

export {
    maskPiiOperator,
    maskPiiSchema,
} from './operators/mask-pii.operator';

// Custom Extractors
export {
    inMemoryExtractor,
    inMemoryExtractorSchema,
} from './extractors/in-memory.extractor';

export {
    generatorExtractor,
    generatorExtractorSchema,
} from './extractors/generator.extractor';

export {
    shopifyProductsExtractor,
    shopifyProductsSchema,
} from './extractors/shopify-products.extractor';

// Custom Loaders
export {
    webhookNotifyLoader,
    webhookNotifySchema,
} from './loaders/webhook-notify.loader';

export {
    vendureProductSyncLoader,
    vendureProductSyncSchema,
} from './loaders/vendure-product-sync.loader';

// Custom Feed Generators
export {
    ssrFeedGenerator,
    shopifyExportGenerator,
} from './feeds';

// Registration imports
import { currencyConvertOperator } from './operators/currency-convert.operator';
import { maskPiiOperator } from './operators/mask-pii.operator';
import { inMemoryExtractor } from './extractors/in-memory.extractor';
import { generatorExtractor } from './extractors/generator.extractor';
import { shopifyProductsExtractor } from './extractors/shopify-products.extractor';
import { webhookNotifyLoader } from './loaders/webhook-notify.loader';
import { vendureProductSyncLoader } from './loaders/vendure-product-sync.loader';
import { ssrFeedGenerator, shopifyExportGenerator } from './feeds';

/**
 * All custom adapters for registration with DataHubRegistryService
 */
export const customAdaptersConfig = {
    operators: [currencyConvertOperator, maskPiiOperator] as const,
    extractors: [inMemoryExtractor, generatorExtractor, shopifyProductsExtractor] as const,
    loaders: [webhookNotifyLoader, vendureProductSyncLoader] as const,
    feedGenerators: [ssrFeedGenerator, shopifyExportGenerator] as const,
};

export const allCustomAdapters = [
    ...customAdaptersConfig.operators,
    ...customAdaptersConfig.extractors,
    ...customAdaptersConfig.loaders,
];

export const allCustomFeedGenerators = customAdaptersConfig.feedGenerators;

// =============================================================================
// EXAMPLE PIPELINES
// =============================================================================

/**
 * Pipeline using custom operators (currencyConvert, maskPII)
 */
export const customOperatorsPipelineExample = createPipeline()
    .name('Custom Operators Demo')
    .description('Currency conversion and PII masking')
    .capabilities({ requires: ['UpdateCustomer'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('sample-data', {
        adapterCode: 'csv',
        rows: [
            { email: 'john@example.com', phone: '555-123-4567', priceEUR: 100 },
            { email: 'jane@example.com', phone: '555-987-6543', priceEUR: 250 },
        ],
    })
    .transform('process', {
        operators: [
            { op: 'currencyConvert', args: { field: 'priceEUR', from: 'EUR', to: 'USD', targetField: 'priceUSD' } },
            { op: 'maskPII', args: { field: 'email', type: 'email' } },
            { op: 'maskPII', args: { field: 'phone', type: 'phone' } },
        ],
    })
    .load('save', {
        adapterCode: 'customerUpsert',
        emailField: 'email',
    })
    .edge('start', 'sample-data')
    .edge('sample-data', 'process')
    .edge('process', 'save')
    .build();

/**
 * Pipeline using custom generator extractor
 */
export const customExtractorsPipelineExample = createPipeline()
    .name('Custom Extractors Demo')
    .description('Generate test data with custom extractor')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('generate', {
        adapterCode: 'generator',
        count: 50,
        template: {
            id: '{{index}}',
            name: 'Product {{index}}',
            sku: 'GEN-{{index}}',
            price: '{{random 1000 9000}}',
        },
    })
    .transform('prepare', {
        operators: [
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .load('upsert', {
        adapterCode: 'variantUpsert',
        channel: '__default_channel__',
        skuField: 'sku',
        priceField: 'price',
    })
    .edge('start', 'generate')
    .edge('generate', 'prepare')
    .edge('prepare', 'upsert')
    .build();

/**
 * Pipeline using custom webhook loader
 */
export const customLoadersPipelineExample = createPipeline()
    .name('Custom Loaders Demo')
    .description('Send data to webhook with custom loader')
    .trigger('start', { type: 'MANUAL' })
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'translations',
        batchSize: 100,
    })
    .transform('prepare', {
        operators: [
            { op: 'pick', args: { fields: ['id', 'name', 'slug'] } },
            { op: 'set', args: { path: 'source', value: 'vendure' } },
        ],
    })
    .load('webhook', {
        adapterCode: 'webhookNotify',
        endpoint: 'https://webhook.example.com/products',
        method: 'POST',
        headers: { 'X-API-Key': '{{secret:webhook-api-key}}' },
        batchMode: 'batch',
        maxBatchSize: 50,
        retries: 3,
    })
    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'webhook')
    .build();

/**
 * Full pipeline combining all custom adapter types
 */
export const customAdapterPipelineExample = createPipeline()
    .name('Full Custom Adapters Demo')
    .description('Generator + currency convert + PII mask + webhook')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('generate', {
        adapterCode: 'generator',
        count: 20,
        template: {
            id: '{{index}}',
            name: 'Item {{index}}',
            email: 'user{{index}}@test.com',
            phone: '555-{{random 100 999}}-{{random 1000 9999}}',
            priceEUR: '{{random 50 500}}',
        },
    })
    .transform('process', {
        operators: [
            { op: 'toNumber', args: { source: 'priceEUR' } },
            { op: 'template', args: { template: 'TEST-${id}', target: 'sku' } },
            { op: 'currencyConvert', args: { field: 'priceEUR', from: 'EUR', to: 'USD', targetField: 'priceUSD' } },
            { op: 'maskPII', args: { field: 'email', type: 'email' } },
            { op: 'maskPII', args: { field: 'phone', type: 'phone' } },
        ],
    })
    .load('save', {
        adapterCode: 'variantUpsert',
        channel: '__default_channel__',
        skuField: 'sku',
        priceField: 'priceUSD',
    })
    .edge('start', 'generate')
    .edge('generate', 'process')
    .edge('process', 'save')
    .build();
