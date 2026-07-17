/**
 * Data Hub Plugin Dev Server Configuration
 *
 * 37 example pipelines + 4 custom adapter demos + 5 hook demos + 3 Pimcore connector pipelines = 49 total
 */
import { DefaultJobQueuePlugin, DefaultSchedulerPlugin, DefaultSearchPlugin, dummyPaymentHandler, VendureConfig } from '@vendure/core';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import path from 'path';

import { DataHubPlugin } from './src';
import { pimcoreConnectorDefinition, PimcoreConnectorConfig, pimcoreGraphQLExtractor } from './connectors/pimcore';
import {
    DEFAULT_DEV_MASTER_KEY,
    DEFAULT_DEV_PIMCORE_API_KEY,
} from './dev-server/dev-credentials';
import {
    allCustomAdapters,
    allCustomFeedGenerators,
    customOperatorsPipelineExample,
    customExtractorsPipelineExample,
    customLoadersPipelineExample,
    customAdapterPipelineExample,
} from './dev-server/examples/custom';
import {
    pimCatalogSync,
    magentoProductMigration,
    shopifyInventorySync,
    csvCustomerImport,
    productFeedGenerator,
    webhookOrderImport,
    webhookBasicAuthImport,
    webhookJwtAuthImport,
    fileWatchImport,
    messageQueueImport,
    cdcProductSync,
    eventStockAlert,
    customerAnalyticsExport,
    entityLifecycleOps,
    pimCustomerSync,
    pimOrderImport,
    magentoCustomerMigration,
    resilienceTest,
    searchIndexSync,
    multiFeedExport,
    erpFullProductImport,
    erpCustomerSync,
    erpOrderImport,
    erpDeltaSyncPipeline,
    erpChannelSpecificCatalog,
    enterpriseComplexPipeline,
    operatorStressTest,
    customerLifecycleTest,
    orderImportStateTest,
    multiStepTransformChain,
    reconciliationAudit,
    multiSourceProductAggregation,
    webhookMultiApiEnrichment,
    crossSystemOrderSync,
    biDirectionalSyncA,
    biDirectionalSyncB,
    multiSinkFanOut,
    hookScripts,
    interceptorHookDemo,
    scriptHookDemo,
    searchEnrichmentHookDemo,
    multiHookChainDemo,
    allStagesHookDemo,
} from './dev-server/examples/pipelines';

process.env.DATAHUB_LOCK_BACKEND ??= 'MEMORY';
process.env.DATAHUB_MASTER_KEY ??= DEFAULT_DEV_MASTER_KEY;
process.env.PIMCORE_API_KEY ??= DEFAULT_DEV_PIMCORE_API_KEY;
process.env.PIMCORE_WEBHOOK_KEY ??= 'demo-webhook-key';
process.env.DEMO_PG_PASSWORD ??= 'postgres';

const PORT = process.env.PORT ? +process.env.PORT : 3000;
const VENDURE_BASE_URL = process.env.VENDURE_BASE_URL || `http://localhost:${PORT}`;
const VITE_DEV_PORT = process.env.VITE_DEV_PORT ? +process.env.VITE_DEV_PORT : 5173;
export const DEV_DATABASE_PATH = path.resolve(
    process.env.DATA_HUB_DEV_DB_PATH ?? path.join(__dirname, 'dev-server/vendure.sqlite'),
);

// =============================================================================
// PIMCORE CONNECTOR
// =============================================================================
const pimcoreConfig: PimcoreConnectorConfig = {
    connection: {
        endpoint: process.env.PIMCORE_ENDPOINT || 'https://pimcore.example.com/pimcore-graphql-webservices/shop',
        apiKeySecretCode: 'pimcore-api-key',
    },
    vendureChannel: '__default_channel__',
    defaultLanguage: 'en',
    sync: {
        deltaSync: true,
        batchSize: 100,
        maxPages: 100,
        includeUnpublished: false,
        includeVariants: true,
    },
    pipelines: {
        productSync: { enabled: true, schedule: '0 */4 * * *' },
        categorySync: { enabled: true, schedule: '0 2 * * *' },
        assetSync: { enabled: true, schedule: '0 3 * * *' },
    },
};

const [productSync, categorySync, assetSync] = pimcoreConnectorDefinition.createPipelines(pimcoreConfig);

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
        database: DEV_DATABASE_PATH,
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

            scripts: hookScripts,

            pipelines: [
                // =================================================================
                // 20 PRODUCTION-QUALITY EXAMPLE PIPELINES
                // =================================================================

                // Catalog pipelines
                { code: 'pim-catalog-sync', name: 'PIM Catalog Sync', definition: pimCatalogSync, enabled: true },
                { code: 'magento-product-migration', name: 'Magento Product Migration', definition: magentoProductMigration, enabled: true },
                { code: 'shopify-inventory-sync', name: 'Shopify Inventory Sync', definition: shopifyInventorySync, enabled: true },

                // Operations pipelines
                { code: 'csv-customer-import', name: 'CSV Customer Import', definition: csvCustomerImport, enabled: true },
                { code: 'product-feed-generator', name: 'Product Feed Generator', definition: productFeedGenerator, enabled: true },
                { code: 'webhook-order-import', name: 'Webhook Order Import', definition: webhookOrderImport, enabled: true },
                { code: 'webhook-basic-auth', name: 'Webhook Basic Auth Import', definition: webhookBasicAuthImport, enabled: true },
                { code: 'webhook-jwt-auth', name: 'Webhook JWT Auth Import', definition: webhookJwtAuthImport, enabled: true },
                { code: 'file-watch-import', name: 'File Watch Import', definition: fileWatchImport, enabled: true },
                { code: 'message-queue-import', name: 'Message Queue Import', definition: messageQueueImport, enabled: true },

                // Integration pipelines
                { code: 'cdc-product-sync', name: 'CDC Product Sync', definition: cdcProductSync, enabled: true },
                { code: 'event-stock-alert', name: 'Event Stock Alert', definition: eventStockAlert, enabled: true },
                { code: 'customer-analytics-export', name: 'Customer Analytics Export', definition: customerAnalyticsExport, enabled: true },
                { code: 'entity-lifecycle-ops', name: 'Entity Lifecycle Operations', definition: entityLifecycleOps, enabled: true },

                // ERP & Integration pipelines
                { code: 'pim-customer-sync', name: 'PIM Customer Sync', definition: pimCustomerSync, enabled: true },
                { code: 'pim-order-import', name: 'PIM Order Import', definition: pimOrderImport, enabled: true },
                { code: 'magento-customer-migration', name: 'Magento Customer Migration', definition: magentoCustomerMigration, enabled: true },
                { code: 'resilience-test', name: 'Resilience Test Pipeline', definition: resilienceTest, enabled: true },

                // Sink & Feed pipelines
                { code: 'search-index-sync', name: 'Search Index Sync', definition: searchIndexSync, enabled: true },
                { code: 'multi-feed-export', name: 'Multi-Feed Export', definition: multiFeedExport, enabled: true },

                // =================================================================
                // ERP COMPLEX PIPELINES (5)
                // =================================================================
                { code: 'erp-full-product-import', name: 'ERP Full Product Import', definition: erpFullProductImport, enabled: true },
                { code: 'erp-customer-sync', name: 'ERP Customer Sync', definition: erpCustomerSync, enabled: true },
                { code: 'erp-order-import', name: 'ERP Order Import', definition: erpOrderImport, enabled: true },
                { code: 'erp-delta-sync', name: 'ERP Delta Sync', definition: erpDeltaSyncPipeline, enabled: true },
                { code: 'erp-channel-catalog', name: 'ERP Channel-Specific Catalog', definition: erpChannelSpecificCatalog, enabled: true },
                { code: 'enterprise-complex', name: 'Enterprise Complex Pipeline', definition: enterpriseComplexPipeline, enabled: true },

                // =================================================================
                // ENTERPRISE TEST PIPELINES (Round 2) - 5 NEW SCENARIOS
                // =================================================================
                { code: 'et-operator-stress', name: 'ET-1: Operator Stress Test', definition: operatorStressTest, enabled: true },
                { code: 'et-customer-lifecycle', name: 'ET-2: Customer Lifecycle Test', definition: customerLifecycleTest, enabled: true },
                { code: 'et-order-state', name: 'ET-3: Order Import State Test', definition: orderImportStateTest, enabled: true },
                { code: 'et-transform-chain', name: 'ET-4: Multi-Step Transform Chain', definition: multiStepTransformChain, enabled: true },
                { code: 'et-reconciliation', name: 'ET-5: Reconciliation Audit', definition: reconciliationAudit, enabled: true },

                // =================================================================
                // MULTI-SOURCE API AGGREGATION PIPELINES (6)
                // =================================================================
                { code: 'ms-multi-source-products', name: 'MS-1: Multi-Source Product Aggregation', definition: multiSourceProductAggregation, enabled: true },
                { code: 'ms-webhook-enrichment', name: 'MS-2: Webhook Multi-API Enrichment', definition: webhookMultiApiEnrichment, enabled: true },
                { code: 'ms-order-sync', name: 'MS-3: Cross-System Order Sync', definition: crossSystemOrderSync, enabled: true },
                { code: 'ms-bidi-sync-import', name: 'MS-4A: Bi-Directional Sync Import', definition: biDirectionalSyncA, enabled: true },
                { code: 'ms-bidi-sync-event', name: 'MS-4B: Bi-Directional Sync Event', definition: biDirectionalSyncB, enabled: true },
                { code: 'ms-multi-sink-fanout', name: 'MS-5: Multi-Sink Fan-Out', definition: multiSinkFanOut, enabled: true },

                // =================================================================
                // CUSTOM ADAPTER DEMOS (4)
                // =================================================================
                { code: 'custom-operators-demo', name: 'Custom Operators Demo', definition: customOperatorsPipelineExample, enabled: true },
                { code: 'custom-extractors-demo', name: 'Custom Extractors Demo', definition: customExtractorsPipelineExample, enabled: true },
                { code: 'custom-loaders-demo', name: 'Custom Loaders Demo', definition: customLoadersPipelineExample, enabled: true },
                { code: 'full-custom-demo', name: 'Full Custom Adapters Demo', definition: customAdapterPipelineExample, enabled: true },

                // =================================================================
                // HOOK DEMO PIPELINES (5)
                // =================================================================
                { code: 'hook-interceptor-demo', name: 'Hook Demo: Interceptors', definition: interceptorHookDemo, enabled: true },
                { code: 'hook-script-demo', name: 'Hook Demo: Scripts', definition: scriptHookDemo, enabled: true },
                { code: 'hook-search-enrichment', name: 'Hook Demo: Search Enrichment', definition: searchEnrichmentHookDemo, enabled: true },
                { code: 'hook-multi-chain', name: 'Hook Demo: Multi-Stage Chain', definition: multiHookChainDemo, enabled: true },
                { code: 'hook-all-stages', name: 'Hook Demo: All Stages', definition: allStagesHookDemo, enabled: true },

                // =================================================================
                // PIMCORE CONNECTOR PIPELINES (3)
                // =================================================================
                { code: 'pimcore-product-sync', name: 'Pimcore Product Sync', definition: productSync, enabled: true },
                { code: 'pimcore-category-sync', name: 'Pimcore Category Sync', definition: categorySync, enabled: true },
                { code: 'pimcore-asset-sync', name: 'Pimcore Asset Sync', definition: assetSync, enabled: true },
            ],

            secrets: [
                { code: 'demo-api-key', provider: 'INLINE', value: 'demo-key-12345' },
                { code: 'crm-api-key', provider: 'INLINE', value: 'crm-demo-key-67890' },
                { code: 'webhook-api-key', provider: 'INLINE', value: 'webhook-secret-abcdef' },
                { code: 'webhook-hmac-secret', provider: 'INLINE', value: 'hmac-shared-secret-xyz' },
                { code: 'google-merchant-key', provider: 'INLINE', value: 'google-merchant-demo-key' },
                { code: 'facebook-catalog-key', provider: 'INLINE', value: 'fb-catalog-demo-key' },
                { code: 'magento-bearer-token', provider: 'INLINE', value: 'magento-dev-token-static-12345' },
                { code: 'pimcore-api-key', provider: 'ENV', value: 'PIMCORE_API_KEY' },
                { code: 'pimcore-webhook-key', provider: 'ENV', value: 'PIMCORE_WEBHOOK_KEY' },
                { code: 'demo-pg-password', provider: 'ENV', value: 'DEMO_PG_PASSWORD' },
                { code: 'meilisearch-api-key', provider: 'INLINE', value: 'testMasterKey123' },
                { code: 'elasticsearch-api-key', provider: 'INLINE', value: 'elastic-demo-key' },
                { code: 'opensearch-basic-auth', provider: 'INLINE', value: 'admin:admin' },
                { code: 'algolia-api-key', provider: 'INLINE', value: 'algolia-demo-admin-key' },
                { code: 'typesense-api-key', provider: 'INLINE', value: 'typesense-demo-key' },
            ],

            connections: [
                {
                    code: 'demo-postgres',
                    type: 'POSTGRES',
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
                    settings: {
                        baseUrl: 'https://erp.example.com/api',
                        auth: {
                            type: 'API_KEY',
                            secretCode: 'demo-api-key',
                            headerName: 'X-API-Key',
                        },
                    },
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
