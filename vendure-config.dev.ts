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
    comprehensiveAdvancedPipeline,
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
        conflictResolution: 'SOURCE_WINS',
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
        conflictResolution: 'SOURCE_WINS',
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
        conflictResolution: 'SOURCE_WINS',
        skuField: 'slug',
        nameField: 'name',
    })
    .edge('start', 'source')
    .edge('source', 'process')
    .edge('process', 'save')
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
// PIMCORE CONNECTOR (Example Configuration)
// =============================================================================
const pimcoreConfig: PimcoreConnectorConfig = {
    connection: {
        // Demo endpoint - replace with actual Pimcore DataHub URL
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

            // Custom adapters (operators, extractors, loaders)
            adapters: [...allCustomAdapters, pimcoreGraphQLExtractor],

            // Custom feed generators
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
                { code: 'comprehensive-advanced', name: 'Comprehensive Advanced Pipeline', definition: comprehensiveAdvancedPipeline, enabled: true },
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
                // PIMCORE CONNECTOR PIPELINES
                // =====================================================================
                { code: 'pimcore-product-sync', name: 'Pimcore Product Sync', definition: pimcorePipelines[0], enabled: true },
                { code: 'pimcore-category-sync', name: 'Pimcore Category Sync', definition: pimcorePipelines[1], enabled: true },
                { code: 'pimcore-asset-sync', name: 'Pimcore Asset Sync', definition: pimcorePipelines[2], enabled: true },
                { code: 'pimcore-facet-sync', name: 'Pimcore Facet Sync', definition: pimcorePipelines[3], enabled: true },
            ],

            // Secrets for API authentication
            // Providers: 'INLINE' (stored in DB, encrypted if DATAHUB_MASTER_KEY set)
            //            'ENV' (reads from environment variable at runtime)
            // Env provider supports fallback syntax: 'ENV_VAR|fallback_value'
            secrets: [
                { code: 'demo-api-key', provider: 'INLINE', value: 'demo-key-12345' },
                { code: 'crm-api-key', provider: 'INLINE', value: 'crm-demo-key-67890' },
                { code: 'webhook-api-key', provider: 'INLINE', value: 'webhook-secret-abcdef' },
                { code: 'google-merchant-key', provider: 'INLINE', value: 'google-merchant-demo-key' },
                { code: 'facebook-catalog-key', provider: 'INLINE', value: 'fb-catalog-demo-key' },
                // Pimcore connector secrets - use env provider with fallback for dev
                // In production: set PIMCORE_API_KEY environment variable
                // For testing: uses 'demo-pimcore-key' fallback (will fail auth but allows pipeline validation)
                { code: 'pimcore-api-key', provider: 'ENV', value: 'PIMCORE_API_KEY|demo-pimcore-key' },
                { code: 'pimcore-webhook-key', provider: 'ENV', value: 'PIMCORE_WEBHOOK_KEY|demo-webhook-key' },
            ],

            // Database connections
            connections: [
                {
                    code: 'demo-postgres',
                    type: 'postgres',
                    name: 'Demo PostgreSQL',
                    settings: { host: 'localhost', port: 5432, database: 'demo', username: 'demo', password: 'demo' },
                },
                {
                    code: 'erp-api',
                    type: 'http',
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
