/**
 * Example Pipelines Index
 *
 * Production-quality example pipelines demonstrating DataHub capabilities.
 * These examples cover common use cases and best practices.
 *
 * Categories:
 * - EXPORTS: Extract data from Vendure for reporting, feeds, or integration
 * - IMPORTS: Load data into Vendure from CSV, API, or other sources
 * - SYNC: Bi-directional sync with external systems (Google, Facebook, ERPs)
 * - PROCESSING: Data enrichment, analytics, and segmentation
 * - SCHEDULED: Automated, recurring data operations
 */

// =============================================================================
// EXPORT PIPELINES
// =============================================================================
export {
    // Full product catalog export with variants flattened to rows
    productExportFull,
    // Customer export with addresses, order count, and total spent
    customerExportFull,
    // Order export with line items flattened and customer info
    orderExportFull,
    // Inventory export by SKU and stock location
    inventoryExport,
} from './export-pipelines';

// =============================================================================
// IMPORT PIPELINES
// =============================================================================
export {
    // Product import from CSV with transformations
    productImportCsv,
    // Customer import with address parsing and validation
    customerImportCsv,
    // Stock level update from CSV
    stockUpdateCsv,
    // Bulk price update with currency support
    priceUpdateCsv,
} from './import-pipelines';

// =============================================================================
// SYNC & INTEGRATION PIPELINES
// =============================================================================
export {
    // Google Merchant Center product feed
    googleShoppingFeed,
    // Facebook/Meta product catalog feed
    facebookCatalogFeed,
    // Import from external REST API with pagination
    restApiImport,
} from './sync-pipelines';

// =============================================================================
// DATA PROCESSING PIPELINES
// =============================================================================
export {
    // Enrich products with calculated fields and SEO metadata
    productEnrichment,
    // Extract and analyze order data
    orderAnalytics,
    // Segment customers based on RFM analysis
    customerSegmentation,
} from './processing-pipelines';

// =============================================================================
// SCHEDULED PIPELINES
// =============================================================================
export {
    // Daily stock sync from ERP with delta detection
    dailyStockSync,
    // Hourly price sync from pricing engine
    hourlyPriceSync,
    // Weekly customer cleanup/archival
    weeklyCustomerCleanup,
    // Webhook-triggered order processing
    webhookOrderSync,
    // Event-triggered low stock alerts
    lowStockAlert,
    // Webhook authentication examples
    webhookApiKeyAuth,
    webhookJwtAuth,
    webhookBasicAuth,
} from './scheduled-pipelines';

// =============================================================================
// ADVANCED PIPELINES - Hooks, Scripts, Custom Adapters
// =============================================================================
export {
    // Interceptor hooks that modify records during pipeline execution
    interceptorHooksPipeline,
    // Script hooks using registered functions
    scriptHooksPipeline,
    // Script operator for inline JavaScript transformations
    scriptOperatorPipeline,
    // Comprehensive example combining all approaches
    comprehensiveAdvancedPipeline,
    // All 18 hook stages demonstration
    allHookStagesPipeline,
    // Custom SDK adapter pattern
    customAdapterPipeline,
} from './advanced-pipelines';

// =============================================================================
// ALL PIPELINES (for bulk registration)
// =============================================================================
import {
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
} from './export-pipelines';

import {
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
} from './import-pipelines';

import {
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
} from './sync-pipelines';

import {
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
} from './processing-pipelines';

import {
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
    webhookApiKeyAuth,
    webhookJwtAuth,
    webhookBasicAuth,
} from './scheduled-pipelines';

import {
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    comprehensiveAdvancedPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
} from './advanced-pipelines';

/**
 * All example pipelines grouped by category
 */
export const examplePipelines = {
    exports: {
        productExportFull,
        customerExportFull,
        orderExportFull,
        inventoryExport,
    },
    imports: {
        productImportCsv,
        customerImportCsv,
        stockUpdateCsv,
        priceUpdateCsv,
    },
    sync: {
        googleShoppingFeed,
        facebookCatalogFeed,
        restApiImport,
    },
    processing: {
        productEnrichment,
        orderAnalytics,
        customerSegmentation,
    },
    scheduled: {
        dailyStockSync,
        hourlyPriceSync,
        weeklyCustomerCleanup,
        webhookOrderSync,
        lowStockAlert,
        webhookApiKeyAuth,
        webhookJwtAuth,
        webhookBasicAuth,
    },
    advanced: {
        interceptorHooksPipeline,
        scriptHooksPipeline,
        scriptOperatorPipeline,
        comprehensiveAdvancedPipeline,
        allHookStagesPipeline,
        customAdapterPipeline,
    },
};

/**
 * Flat array of all example pipelines for registration
 */
export const allExamplePipelines = [
    // Exports
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
    // Imports
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
    // Sync
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
    // Processing
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
    // Scheduled
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
    webhookApiKeyAuth,
    webhookJwtAuth,
    webhookBasicAuth,
    // Advanced
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    comprehensiveAdvancedPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
];
