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

// =============================================================================
// CUSTOM ADAPTERS
// =============================================================================
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

// =============================================================================
// PRODUCTION-QUALITY PIPELINE EXAMPLES
// =============================================================================

// Export Pipelines
export {
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
} from './pipelines';

// Import Pipelines
export {
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
} from './pipelines';

// Sync & Integration Pipelines
export {
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
} from './pipelines';

// Data Processing Pipelines
export {
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
} from './pipelines';

// Scheduled Pipelines
export {
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
} from './pipelines';

// Grouped exports for easy registration
export {
    examplePipelines,
    allExamplePipelines,
} from './pipelines';
