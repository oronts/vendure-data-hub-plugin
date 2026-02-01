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

export {
    productExportFull,
    customerExportFull,
    orderExportFull,
    inventoryExport,
} from './export-pipelines';

export {
    productImportCsv,
    customerImportCsv,
    stockUpdateCsv,
    priceUpdateCsv,
} from './import-pipelines';

export {
    googleShoppingFeed,
    facebookCatalogFeed,
    restApiImport,
} from './sync-pipelines';

export {
    productEnrichment,
    orderAnalytics,
    customerSegmentation,
} from './processing-pipelines';

export {
    dailyStockSync,
    hourlyPriceSync,
    weeklyCustomerCleanup,
    webhookOrderSync,
    lowStockAlert,
    webhookApiKeyAuth,
    webhookJwtAuth,
    webhookBasicAuth,
    multiTriggerPipeline,
} from './scheduled-pipelines';

export {
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    comprehensiveAdvancedPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
} from './advanced-pipelines';

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
    multiTriggerPipeline,
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
        multiTriggerPipeline,
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
    multiTriggerPipeline,
    interceptorHooksPipeline,
    scriptHooksPipeline,
    scriptOperatorPipeline,
    comprehensiveAdvancedPipeline,
    allHookStagesPipeline,
    customAdapterPipeline,
];
