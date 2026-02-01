/**
 * Data Hub Plugin Examples
 *
 * This module exports:
 * - Custom adapter examples (operators, extractors, loaders)
 * - Production-quality pipeline examples for common use cases
 *
 * Pipeline Categories:
 * - EXPORTS: Product, Customer, Order, Inventory exports
 * - IMPORTS: CSV imports with validation and transformation
 * - SYNC: Google Shopping, Facebook Catalog, REST API integration
 * - PROCESSING: Data enrichment, analytics, customer segmentation
 * - SCHEDULED: Cron-based sync, webhooks, event triggers
 */

export {
    currencyConvertOperator,
    currencyConvertSchema,
    maskPiiOperator,
    maskPiiSchema,
    inMemoryExtractor,
    inMemoryExtractorSchema,
    generatorExtractor,
    generatorExtractorSchema,
    webhookNotifyLoader,
    webhookNotifySchema,
    customAdaptersConfig,
    allCustomAdapters,
    customOperatorsPipelineExample,
    customExtractorsPipelineExample,
    customLoadersPipelineExample,
    customAdapterPipelineExample,
} from './custom';

export {
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
    webhookApiKeyAuth,
    webhookJwtAuth,
    webhookBasicAuth,
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    comprehensiveAdvancedPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
    examplePipelines,
    allExamplePipelines,
} from './pipelines';
