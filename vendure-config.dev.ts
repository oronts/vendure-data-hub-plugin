/**
 * Data Hub Plugin Dev Server Configuration
 *
 * Showcases ALL DataHub features:
 * - Built-in adapters (80+ extractors, operators, loaders, feeds, sinks)
 * - Custom adapters (operators, extractors, loaders)
 * - Custom feed generators
 * - 25+ example pipelines covering all use cases
 */
import { DefaultJobQueuePlugin, DefaultSchedulerPlugin, DefaultSearchPlugin, dummyPaymentHandler, VendureConfig } from '@vendure/core';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import path from 'path';

import { DataHubPlugin, createPipeline } from './src';
import { pimcoreConnectorDefinition, PimcoreConnectorConfig, pimcoreGraphQLExtractor } from './connectors/pimcore';
import {
    allCustomAdapters,
    allCustomFeedGenerators,
    customOperatorsPipelineExample,
    customExtractorsPipelineExample,
    customLoadersPipelineExample,
    customAdapterPipelineExample,
} from './dev-server/examples/custom';
import {
    // Export pipelines
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
    // Import pipelines
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
    // Sync pipelines
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
    // Processing pipelines
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
    // Scheduled pipelines
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
    // Advanced pipelines (hooks, scripts, interceptors)
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    advancedValidationPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
    // Architectural gap pipelines
    joinDemoPipeline,
    parallelDemoPipeline,
    retryDemoPipeline,
    gateDemoPipeline,
    cdcDemoPipeline,
    graphqlMutationDemoPipeline,
    fileTransformDemoPipeline,
} from './dev-server/examples/pipelines';

const PORT = process.env.PORT ? +process.env.PORT : 3000;
const VENDURE_BASE_URL = process.env.VENDURE_BASE_URL || `http://localhost:${PORT}`;
const VITE_DEV_PORT = process.env.VITE_DEV_PORT ? +process.env.VITE_DEV_PORT : 5173;
const PIMCORE_API_URL = process.env.PIMCORE_API_URL || 'http://localhost:3333';

// =============================================================================
// EXAMPLE PIPELINES
// =============================================================================

const httpApiExtractorExample = createPipeline()
    .name('REST API Extractor')
    .description('Extract products from external REST API')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch', {
        adapterCode: 'httpApi',
        url: 'https://api.example.com/products',
        method: 'GET',
        headers: { Authorization: 'Bearer {{secret:demo-api-key}}' },
    })
    .transform('map', {
        operators: [
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'price' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .load('upsert', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
    })
    .edge('start', 'fetch')
    .edge('fetch', 'map')
    .edge('map', 'upsert')
    .build();

const vendureQueryExample = createPipeline()
    .name('Vendure Query Extractor')
    .description('Extract products from Vendure')
    .capabilities({ requires: ['UpdateDataHubSettings'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset',
        batchSize: 100,
    })
    .transform('flatten', {
        operators: [
            { op: 'flatten', args: { source: 'variants' } },
            { op: 'template', args: { template: '${slug}-${sku}', target: 'fullSku' } },
        ],
    })
    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://webhook.example.com/products',
        method: 'POST',
    })
    .edge('start', 'query')
    .edge('query', 'flatten')
    .edge('flatten', 'export')
    .build();

const productLoaderExample = createPipeline()
    .name('Product Loader')
    .description('Import products from CSV data')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('source', {
        adapterCode: 'csv',
        rows: [
            { sku: 'DEMO-001', name: 'Demo Product 1', slug: 'demo-product-1', price: '2999', description: 'First demo product' },
            { sku: 'DEMO-002', name: 'Demo Product 2', slug: 'demo-product-2', price: '4999', description: 'Second demo product' },
        ],
    })
    .transform('prepare', {
        operators: [
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .load('upsert', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
    })
    .edge('start', 'source')
    .edge('source', 'prepare')
    .edge('prepare', 'upsert')
    .build();

const customerLoaderExample = createPipeline()
    .name('Customer Loader')
    .description('Import customers from CSV data')
    .capabilities({ requires: ['UpdateCustomer'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('source', {
        adapterCode: 'csv',
        rows: [
            { email: 'john@example.com', firstName: 'John', lastName: 'Doe' },
            { email: 'jane@example.com', firstName: 'Jane', lastName: 'Smith' },
        ],
    })
    .transform('prepare', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
        ],
    })
    .load('upsert', {
        adapterCode: 'customerUpsert',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
    })
    .edge('start', 'source')
    .edge('source', 'prepare')
    .edge('prepare', 'upsert')
    .build();

const transformOperatorsExample = createPipeline()
    .name('Transform Operators')
    .description('String, numeric, and data transformations')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('source', {
        adapterCode: 'csv',
        rows: [
            { name: '  iPhone 15 Pro  ', price: '1199.99', weight: '0.187', active: 'true' },
            { name: '  MacBook Air  ', price: '999.00', weight: '1.24', active: 'false' },
        ],
    })
    .transform('process', {
        operators: [
            { op: 'trim', args: { path: 'name' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'toNumber', args: { source: 'weight' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
            { op: 'math', args: { operation: 'multiply', source: 'weight', operand: '1000', target: 'weightInGrams' } },
            { op: 'template', args: { template: '${name} - $${price}', target: 'description' } },
        ],
    })
    .load('save', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'slug',
        nameField: 'name',
    })
    .edge('start', 'source')
    .edge('source', 'process')
    .edge('process', 'save')
    .build();

// =============================================================================
// PIM OPTION GROUP TEST — Simple pipeline testing variant option group
// auto-creation from PIM product attributes (size, color, volume, etc.)
// =============================================================================
const pimOptionGroupTest = createPipeline()
    .name('PIM Option Group Test')
    .description('Test variant option group auto-creation from PIM attributes')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-listing', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })
    .transform('enrich-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })
    .transform('map-products', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.variants', target: '_variants' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'omit', args: { fields: ['_detail', 'id', 'type', 'variantCount', 'channels', 'modifiedAt'] } },
        ],
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        createVariants: false,
    })
    .transform('expand-variants', {
        operators: [
            { op: 'expand', args: { path: '_variants', parentFields: { productSlug: 'slug' } } },
        ],
    })
    .transform('map-variants', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'title', target: 'name' } },
            { op: 'copy', args: { source: 'attributes', target: 'options' } },
            {
                op: 'script',
                args: {
                    code: `
                        const price = record.price;
                        if (price && typeof price === 'object' && price.value != null) {
                            record.priceValue = Number(price.value);
                        } else if (typeof price === 'number') {
                            record.priceValue = price;
                        } else {
                            record.priceValue = 0;
                        }
                        return record;
                    `,
                },
            },
            { op: 'validateRequired', args: { fields: ['sku'] } },
            { op: 'pick', args: { fields: ['sku', 'name', 'productSlug', 'priceValue', 'options'] } },
        ],
    })
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        channel: '__default_channel__',
        skuField: 'sku',
        nameField: 'name',
        priceField: 'priceValue',
        optionGroupsField: 'options',
    })
    .edge('start', 'fetch-listing')
    .edge('fetch-listing', 'enrich-detail')
    .edge('enrich-detail', 'map-products')
    .edge('map-products', 'upsert-products')
    .edge('map-products', 'expand-variants')
    .edge('expand-variants', 'map-variants')
    .edge('map-variants', 'upsert-variants')
    .edge('upsert-products', 'upsert-variants')
    .build();

// =============================================================================
// PIM ENTERPRISE SYNC — Full enterprise integration pipeline.
// 6 parallel branches, 25 steps, 3 triggers (manual / schedule / webhook).
// Syncs: products, variants (with option groups), facets, facet values,
// collections, promotions, stock locations, and inventory levels.
// Requires: npx ts-node dev-server/mock-pimcore-api.ts (port 3333)
// =============================================================================
const pimEnterpriseSync = createPipeline()
    .name('PIM Enterprise Sync')
    .description('Full enterprise sync: products, variants (option groups), facets, facet values, collections, promotions, stock locations, inventory')
    .capabilities({ requires: ['UpdateCatalog', 'UpdatePromotion'] })
    // Triggers
    .trigger('manual-trigger', { type: 'MANUAL' })
    .trigger('scheduled-sync', { type: 'SCHEDULE', cron: '0 */4 * * *', timezone: 'Europe/Berlin' })
    .trigger('webhook-trigger', { type: 'WEBHOOK', authentication: 'API_KEY', apiKeySecretCode: 'pimcore-webhook-key', apiKeyHeaderName: 'x-api-key' })

    // Branch 1: Facets + Facet Values
    .extract('extract-facets', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/facets`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'facets',
    })
    .transform('map-facets', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'facetCode' } },
            { op: 'copy', args: { source: 'name', target: 'facetName' } },
            { op: 'pick', args: { fields: ['facetCode', 'facetName', 'values'] } },
        ],
    })
    .load('upsert-facets', {
        adapterCode: 'facetUpsert',
        strategy: 'UPSERT',
        codeField: 'facetCode',
        nameField: 'facetName',
    })
    .transform('expand-fv', {
        operators: [
            { op: 'expand', args: { path: 'values', parentFields: { facetCode: 'facetCode' } } },
        ],
    })
    .transform('map-fv', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'valueCode' } },
            { op: 'copy', args: { source: 'name', target: 'valueName' } },
            { op: 'pick', args: { fields: ['facetCode', 'valueCode', 'valueName'] } },
        ],
    })
    .load('upsert-fv', {
        adapterCode: 'facetValueUpsert',
        strategy: 'UPSERT',
        facetCodeField: 'facetCode',
        codeField: 'valueCode',
        nameField: 'valueName',
    })

    // Branch 2: Categories → Collections
    .extract('extract-categories', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/categories`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'categories',
    })
    .transform('map-categories', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'slug' } },
            { op: 'copy', args: { source: 'name', target: 'collName' } },
            { op: 'copy', args: { source: 'description', target: 'collDesc' } },
            { op: 'copy', args: { source: 'parentCode', target: 'parentSlug' } },
            { op: 'pick', args: { fields: ['slug', 'collName', 'collDesc', 'parentSlug'] } },
        ],
    })
    .load('upsert-collections', {
        adapterCode: 'collectionUpsert',
        strategy: 'UPSERT',
        channel: '__default_channel__',
        slugField: 'slug',
        nameField: 'collName',
        descriptionField: 'collDesc',
        parentSlugField: 'parentSlug',
    })

    // Branch 3: Products + Variants (with option groups)
    .extract('extract-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })
    .transform('enrich-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })
    .transform('map-products', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.variants', target: '_variants' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'omit', args: { fields: ['_detail', 'id', 'type', 'variantCount', 'channels', 'modifiedAt', 'categoryCode'] } },
        ],
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        createVariants: false,
    })
    .transform('expand-variants', {
        operators: [
            { op: 'expand', args: { path: '_variants', parentFields: { productSlug: 'slug' } } },
        ],
    })
    .transform('map-variants', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'title', target: 'name' } },
            { op: 'copy', args: { source: 'attributes', target: 'options' } },
            { op: 'copy', args: { source: 'price.EUR', target: 'priceValue' } },
            { op: 'validateRequired', args: { fields: ['sku'] } },
            { op: 'pick', args: { fields: ['sku', 'name', 'productSlug', 'priceValue', 'options'] } },
        ],
    })
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'name',
        priceField: 'priceValue',
        optionGroupsField: 'options',
    })

    // Branch 4: Promotions
    .extract('extract-promotions', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/promotions`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'promotions',
    })
    .transform('map-promotions', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'promoCode' } },
            { op: 'copy', args: { source: 'name', target: 'promoName' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Build Vendure ConfigurableOperationInput format
                        if (record.type === 'percentage' && record.discountPercent) {
                            record.actions = [{ code: 'order_percentage_discount', arguments: [{ name: 'discount', value: String(record.discountPercent) }] }];
                        } else if (record.type === 'fixed' && record.discountFixed) {
                            record.actions = [{ code: 'order_fixed_discount', arguments: [{ name: 'discount', value: String(record.discountFixed) }] }];
                        } else {
                            record.actions = [];
                        }
                        record.conditions = [];
                        if (record.minQuantity) {
                            record.conditions.push({ code: 'minimum_order_amount', arguments: [{ name: 'amount', value: String(record.minQuantity * 100) }, { name: 'taxInclusive', value: 'false' }] });
                        }
                        return record;
                    `,
                },
            },
            { op: 'pick', args: { fields: ['promoCode', 'promoName', 'enabled', 'startsAt', 'endsAt', 'conditions', 'actions'] } },
        ],
    })
    .load('upsert-promotions', {
        adapterCode: 'promotionUpsert',
        strategy: 'UPSERT',
        codeField: 'promoCode',
        nameField: 'promoName',
        enabledField: 'enabled',
        startsAtField: 'startsAt',
        endsAtField: 'endsAt',
        conditionsField: 'conditions',
        actionsField: 'actions',
    })

    // Branch 5: Stock Locations
    .extract('extract-locations', {
        adapterCode: 'csv',
        rows: [
            { locName: 'Hauptlager', locDesc: 'Main warehouse' },
            { locName: 'Aussenlager', locDesc: 'External warehouse' },
        ],
    })
    .load('upsert-locations', {
        adapterCode: 'stockLocationUpsert',
        strategy: 'UPSERT',
        nameField: 'locName',
        descriptionField: 'locDesc',
    })

    // Branch 6: Inventory Levels
    .extract('extract-stock', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/stock`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'stock',
    })
    .transform('map-stock', {
        operators: [
            { op: 'rename', args: { from: 'qty', to: 'stockOnHand' } },
            { op: 'rename', args: { from: 'location', to: 'locationName' } },
        ],
    })
    .load('adjust-inventory', {
        adapterCode: 'inventoryAdjust',
        strategy: 'UPSERT',
        skuField: 'sku',
        stockOnHandField: 'stockOnHand',
        stockLocationNameField: 'locationName',
    })

    // Graph edges: all triggers → 6 parallel extract branches
    .edge('manual-trigger', 'extract-facets')
    .edge('manual-trigger', 'extract-categories')
    .edge('manual-trigger', 'extract-products')
    .edge('manual-trigger', 'extract-promotions')
    .edge('manual-trigger', 'extract-locations')
    .edge('manual-trigger', 'extract-stock')
    .edge('scheduled-sync', 'extract-facets')
    .edge('scheduled-sync', 'extract-categories')
    .edge('scheduled-sync', 'extract-products')
    .edge('scheduled-sync', 'extract-promotions')
    .edge('scheduled-sync', 'extract-locations')
    .edge('scheduled-sync', 'extract-stock')
    .edge('webhook-trigger', 'extract-facets')
    .edge('webhook-trigger', 'extract-categories')
    .edge('webhook-trigger', 'extract-products')
    .edge('webhook-trigger', 'extract-promotions')
    .edge('webhook-trigger', 'extract-locations')
    .edge('webhook-trigger', 'extract-stock')
    // Facets
    .edge('extract-facets', 'map-facets')
    .edge('map-facets', 'upsert-facets')
    .edge('map-facets', 'expand-fv')
    .edge('expand-fv', 'map-fv')
    .edge('map-fv', 'upsert-fv')
    .edge('upsert-facets', 'upsert-fv')
    // Categories
    .edge('extract-categories', 'map-categories')
    .edge('map-categories', 'upsert-collections')
    // Products + Variants
    .edge('extract-products', 'enrich-detail')
    .edge('enrich-detail', 'map-products')
    .edge('map-products', 'upsert-products')
    .edge('map-products', 'expand-variants')
    .edge('expand-variants', 'map-variants')
    .edge('map-variants', 'upsert-variants')
    .edge('upsert-products', 'upsert-variants')
    // Promotions
    .edge('extract-promotions', 'map-promotions')
    .edge('map-promotions', 'upsert-promotions')
    // Stock locations
    .edge('extract-locations', 'upsert-locations')
    // Inventory (depends on variants + locations being created first)
    .edge('extract-stock', 'map-stock')
    .edge('map-stock', 'adjust-inventory')
    .edge('upsert-variants', 'adjust-inventory')
    .edge('upsert-locations', 'adjust-inventory')
    .build();

const customAdapterExample = createPipeline()
    .name('Custom Adapters Demo')
    .description('Generator + currency convert + PII mask')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('generate', {
        adapterCode: 'generator',
        count: 10,
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
            { op: 'template', args: { template: 'GEN-${id}', target: 'sku' } },
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

// =============================================================================
// EXPORT PIPELINE EXAMPLES
// =============================================================================

const productExportExample = createPipeline()
    .name('Product Export to Webhook')
    .description('Export all products to external webhook (scheduled daily)')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'SCHEDULE', cron: '0 2 * * *' }) // Daily at 2am
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,facetValues',
        batchSize: 100,
    })
    .transform('prepare', {
        operators: [
            { op: 'flatten', args: { source: 'variants' } },
            { op: 'pick', args: { fields: ['id', 'name', 'slug', 'sku', 'price', 'featuredAsset.preview'] } },
            { op: 'set', args: { path: 'exportedAt', value: '${new Date().toISOString()}' } },
        ],
    })
    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://webhook.example.com/products/sync',
        method: 'POST',
        batchMode: 'array',
        maxBatchSize: 100,
    })
    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')
    .build();

const customerExportExample = createPipeline()
    .name('Customer Export')
    .description('Export customers to external CRM')
    .capabilities({ requires: ['ReadCustomer'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'addresses,groups',
        batchSize: 50,
    })
    .transform('prepare', {
        operators: [
            { op: 'pick', args: { fields: ['id', 'emailAddress', 'firstName', 'lastName', 'phoneNumber', 'createdAt'] } },
            { op: 'rename', args: { from: 'emailAddress', to: 'email' } },
            { op: 'template', args: { template: '${firstName} ${lastName}', target: 'fullName' } },
        ],
    })
    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://crm.example.com/api/customers',
        method: 'POST',
        headers: { 'X-API-Key': '{{secret:crm-api-key}}' },
        batchMode: 'single',
        retries: 3,
    })
    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')
    .build();

const orderExportExample = createPipeline()
    .name('Order Export')
    .description('Export recent orders to fulfillment system')
    .capabilities({ requires: ['ReadOrder'] })
    .trigger('start', { type: 'SCHEDULE', cron: '*/15 * * * *' }) // Every 15 minutes
    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'lines,customer,shippingLines',
        batchSize: 20,
    })
    .transform('prepare', {
        operators: [
            { op: 'pick', args: { fields: ['code', 'state', 'total', 'customer.emailAddress', 'shippingAddress', 'lines'] } },
            { op: 'set', args: { path: 'source', value: 'vendure' } },
        ],
    })
    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://fulfillment.example.com/api/orders',
        method: 'POST',
        batchMode: 'single',
    })
    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')
    .build();

// =============================================================================
// PIMCORE CONNECTOR
// =============================================================================
const pimcoreConfig: PimcoreConnectorConfig = {
    connection: {
        endpoint: process.env.PIMCORE_ENDPOINT || 'https://pimcore.example.com/pimcore-datahub-webservices/shop',
        apiKeySecretCode: 'pimcore-api-key',
    },
    vendureChannel: '__default_channel__',
    defaultLanguage: 'en',
    languages: ['en', 'de'],
    sync: {
        deltaSync: true,
        batchSize: 100,
        includeUnpublished: false,
        includeVariants: true,
    },
    pipelines: {
        productSync: { enabled: true, schedule: '0 */4 * * *' },
        categorySync: { enabled: true, schedule: '0 2 * * *' },
        assetSync: { enabled: true, schedule: '0 3 * * *' },
        facetSync: { enabled: true, schedule: '0 1 * * 0' },
    },
};

const pimcorePipelines = pimcoreConnectorDefinition.createPipelines(pimcoreConfig);

export const config: VendureConfig = {
    apiOptions: {
        port: PORT,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        adminApiPlayground: true,
        shopApiPlayground: true,
    },
    authOptions: {
        cookieOptions: {
            secret: process.env.COOKIE_SECRET || 'dev-secret-change-in-production',
        },
        requireVerification: false,
        tokenMethod: ['cookie', 'bearer'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME || 'superadmin',
            password: process.env.SUPERADMIN_PASSWORD || 'superadmin',
        },
    },
    dbConnectionOptions: {
        type: 'better-sqlite3',
        synchronize: true,
        logging: false,
        database: path.join(__dirname, 'dev-server/vendure.sqlite'),
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    plugins: [
        DefaultJobQueuePlugin,
        DefaultSchedulerPlugin.init({}),
        DefaultSearchPlugin,
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, 'dev-server/assets'),
            assetUrlPrefix: `${VENDURE_BASE_URL}/assets/`,
        }),
        DataHubPlugin.init({
            enabled: true,
            debug: true,
            registerBuiltinAdapters: true,
            retentionDaysRuns: 30,
            retentionDaysErrors: 90,
            security: {
                ssrf: { disableSsrfProtection: true }, // Allow localhost for mock APIs in dev
            },

            connectors: [
                { definition: pimcoreConnectorDefinition, config: pimcoreConfig },
            ],

            adapters: [...allCustomAdapters, pimcoreGraphQLExtractor],

            feedGenerators: [...allCustomFeedGenerators],

            // All example pipelines organized by category
            pipelines: [
                // =====================================================================
                // BASIC EXAMPLES (inline definitions)
                // =====================================================================
                { code: 'http-api-extractor', name: 'HTTP API Extractor', definition: httpApiExtractorExample, enabled: true },
                { code: 'vendureQuery', name: 'Vendure Query', definition: vendureQueryExample, enabled: true },
                { code: 'product-loader', name: 'Product Loader', definition: productLoaderExample, enabled: true },
                { code: 'customer-loader', name: 'Customer Loader', definition: customerLoaderExample, enabled: true },
                { code: 'transform-operators', name: 'Transform Operators', definition: transformOperatorsExample, enabled: true },
                { code: 'custom-adapters', name: 'Custom Adapters Demo', definition: customAdapterExample, enabled: true },
                { code: 'product-export', name: 'Product Export', definition: productExportExample, enabled: true },
                { code: 'customer-export', name: 'Customer Export', definition: customerExportExample, enabled: true },
                { code: 'order-export', name: 'Order Export', definition: orderExportExample, enabled: true },

                // =====================================================================
                // CUSTOM ADAPTER DEMOS
                // =====================================================================
                { code: 'custom-operators-demo', name: 'Custom Operators Demo', definition: customOperatorsPipelineExample, enabled: true },
                { code: 'custom-extractors-demo', name: 'Custom Extractors Demo', definition: customExtractorsPipelineExample, enabled: true },
                { code: 'custom-loaders-demo', name: 'Custom Loaders Demo', definition: customLoadersPipelineExample, enabled: true },
                { code: 'full-custom-demo', name: 'Full Custom Adapters Demo', definition: customAdapterPipelineExample, enabled: true },

                // =====================================================================
                // EXPORT PIPELINES (full exports)
                // =====================================================================
                { code: 'product-export-full', name: 'Product Export - Full Catalog', definition: productExportFull, enabled: true },
                { code: 'customer-export-full', name: 'Customer Export - Full', definition: customerExportFull, enabled: true },
                { code: 'order-export-full', name: 'Order Export - Full', definition: orderExportFull, enabled: true },
                { code: 'inventory-export', name: 'Inventory Export', definition: inventoryExport, enabled: true },

                // =====================================================================
                // IMPORT PIPELINES (data ingestion)
                // =====================================================================
                { code: 'product-import-csv', name: 'Product Import from CSV', definition: productImportCsv, enabled: true },
                { code: 'customer-import-csv', name: 'Customer Import from CSV', definition: customerImportCsv, enabled: true },
                { code: 'stock-update-csv', name: 'Stock Update from CSV', definition: stockUpdateCsv, enabled: true },
                { code: 'price-update-csv', name: 'Price Update from CSV', definition: priceUpdateCsv, enabled: true },

                // =====================================================================
                // SYNC & INTEGRATION PIPELINES
                // =====================================================================
                { code: 'google-shopping-feed', name: 'Google Shopping Feed', definition: googleShoppingFeed, enabled: true },
                { code: 'facebook-catalog-feed', name: 'Facebook Catalog Feed', definition: facebookCatalogFeed, enabled: true },
                { code: 'rest-api-import', name: 'REST API Import', definition: restApiImport, enabled: true },

                // =====================================================================
                // DATA PROCESSING PIPELINES
                // =====================================================================
                { code: 'product-enrichment', name: 'Product Enrichment', definition: productEnrichment, enabled: true },
                { code: 'order-analytics', name: 'Order Analytics', definition: orderAnalytics, enabled: true },
                { code: 'customer-segmentation', name: 'Customer Segmentation', definition: customerSegmentation, enabled: true },

                // =====================================================================
                // SCHEDULED PIPELINES (cron, webhook, event triggers)
                // =====================================================================
                { code: 'daily-stock-sync', name: 'Daily Stock Sync', definition: dailyStockSync, enabled: true },
                { code: 'hourly-price-sync', name: 'Hourly Price Sync', definition: hourlyPriceSync, enabled: true },
                { code: 'weekly-customer-cleanup', name: 'Weekly Customer Cleanup', definition: weeklyCustomerCleanup, enabled: true },
                { code: 'webhook-order-sync', name: 'Webhook Order Sync', definition: webhookOrderSync, enabled: true },
                { code: 'low-stock-alert', name: 'Low Stock Alert', definition: lowStockAlert, enabled: true },

                // =====================================================================
                // ADVANCED PIPELINES (hooks, scripts, interceptors)
                // =====================================================================
                { code: 'interceptor-hooks', name: 'Interceptor Hooks Example', definition: interceptorHooksPipeline, enabled: true },
                { code: 'script-hooks', name: 'Script Hooks Example', definition: scriptHooksPipeline, enabled: true },
                { code: 'script-operator', name: 'Script Operator Example', definition: scriptOperatorPipeline, enabled: true },
                { code: 'advanced-validation', name: 'Advanced Validation Pipeline', definition: advancedValidationPipeline, enabled: true },
                { code: 'all-hook-stages', name: 'All 18 Hook Stages Demo', definition: allHookStagesPipeline, enabled: true },
                { code: 'custom-adapter-sdk', name: 'Custom Adapter SDK Example', definition: customAdapterPipeline, enabled: true },

                // =====================================================================
                // ARCHITECTURAL GAPS (multi-join, parallel, retry, gate, CDC, GraphQL, file)
                // =====================================================================
                { code: 'join-demo', name: 'Multi-Source Join Demo', definition: joinDemoPipeline, enabled: true },
                { code: 'parallel-demo', name: 'Parallel Execution Demo', definition: parallelDemoPipeline, enabled: true },
                { code: 'retry-demo', name: 'Per-Record Retry Demo', definition: retryDemoPipeline, enabled: true },
                { code: 'gate-demo', name: 'Gate Approval Workflow Demo', definition: gateDemoPipeline, enabled: true },
                { code: 'cdc-demo', name: 'CDC Extraction Demo', definition: cdcDemoPipeline, enabled: true },
                { code: 'graphql-mutation-demo', name: 'GraphQL Mutation Loading Demo', definition: graphqlMutationDemoPipeline, enabled: true },
                { code: 'file-transform-demo', name: 'File Transformation Demo', definition: fileTransformDemoPipeline, enabled: true },

                // =====================================================================
                // PIM INTEGRATION (mock PIM API on port 3333)
                // =====================================================================
                { code: 'pim-option-group-test', name: 'PIM Option Group Test', definition: pimOptionGroupTest, enabled: true },
                { code: 'pim-enterprise-sync', name: 'PIM Enterprise Sync', definition: pimEnterpriseSync, enabled: true },

                // =====================================================================
                // PIMCORE CONNECTOR PIPELINES
                // =====================================================================
                { code: 'pimcore-product-sync', name: 'Pimcore Product Sync', definition: pimcorePipelines[0], enabled: true },
                { code: 'pimcore-category-sync', name: 'Pimcore Category Sync', definition: pimcorePipelines[1], enabled: true },
                { code: 'pimcore-asset-sync', name: 'Pimcore Asset Sync', definition: pimcorePipelines[2], enabled: true },
                { code: 'pimcore-facet-sync', name: 'Pimcore Facet Sync', definition: pimcorePipelines[3], enabled: true },
            ],

            secrets: [
                { code: 'demo-api-key', provider: 'INLINE', value: 'demo-key-12345' },
                { code: 'crm-api-key', provider: 'INLINE', value: 'crm-demo-key-67890' },
                { code: 'webhook-api-key', provider: 'INLINE', value: 'webhook-secret-abcdef' },
                { code: 'google-merchant-key', provider: 'INLINE', value: 'google-merchant-demo-key' },
                { code: 'facebook-catalog-key', provider: 'INLINE', value: 'fb-catalog-demo-key' },
                { code: 'pimcore-api-key', provider: 'ENV', value: 'PIMCORE_API_KEY|demo-pimcore-key' },
                { code: 'pimcore-webhook-key', provider: 'ENV', value: 'PIMCORE_WEBHOOK_KEY|demo-webhook-key' },
                { code: 'demo-pg-password', provider: 'ENV', value: 'DEMO_PG_PASSWORD|postgres' },
            ],

            connections: [
                {
                    code: 'demo-postgres',
                    type: 'DATABASE',
                    name: 'Demo PostgreSQL',
                    settings: {
                        host: process.env.DEMO_PG_HOST || 'localhost',
                        port: 5432,
                        database: process.env.DEMO_PG_DATABASE || 'postgres',
                        username: process.env.DEMO_PG_USER || 'postgres',
                        passwordSecretCode: 'demo-pg-password',
                    },
                },
                {
                    code: 'erp-api',
                    type: 'HTTP',
                    name: 'ERP API Connection',
                    settings: { baseUrl: 'https://erp.example.com/api', headers: { 'X-API-Key': '{{secret:demo-api-key}}' } },
                },
            ],
        }),
        DashboardPlugin.init({
            route: 'admin',
            appDir: path.join(__dirname, 'dist/dashboard'),
            viteDevServerPort: VITE_DEV_PORT,
        }),
    ],
};
