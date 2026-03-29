/** Example pipeline definitions for dev-server and integration testing. */

export {
    pimCatalogSync,
    magentoProductMigration,
    shopifyInventorySync,
} from './catalog-pipelines';

export {
    csvCustomerImport,
    productFeedGenerator,
    webhookOrderImport,
    webhookBasicAuthImport,
    webhookJwtAuthImport,
    fileWatchImport,
    messageQueueImport,
} from './operations-pipelines';

export {
    cdcProductSync,
    eventStockAlert,
    customerAnalyticsExport,
    entityLifecycleOps,
    pimCustomerSync,
    pimOrderImport,
    magentoCustomerMigration,
    resilienceTest,
} from './integration-pipelines';

export {
    searchIndexSync,
    multiFeedExport,
    searchIndexCrudSync,
} from './sink-feed-pipelines';

export {
    erpFullProductImport,
    erpCustomerSync,
    erpOrderImport,
    erpDeltaSyncPipeline,
    erpChannelSpecificCatalog,
} from './erp-complex-pipelines';

export { enterpriseComplexPipeline } from './enterprise-complex-pipeline';

export {
    operatorStressTest,
    customerLifecycleTest,
    orderImportStateTest,
    multiStepTransformChain,
    reconciliationAudit,
} from './enterprise-test-pipelines';

export {
    multiSourceProductAggregation,
    webhookMultiApiEnrichment,
    crossSystemOrderSync,
    biDirectionalSyncA,
    biDirectionalSyncB,
    multiSinkFanOut,
} from './multi-source-pipelines';

export {
    hookScripts,
    interceptorHookDemo,
    scriptHookDemo,
    searchEnrichmentHookDemo,
    multiHookChainDemo,
    allStagesHookDemo,
} from './hook-examples-pipelines';

import {
    pimCatalogSync,
    magentoProductMigration,
    shopifyInventorySync,
} from './catalog-pipelines';

import {
    csvCustomerImport,
    productFeedGenerator,
    webhookOrderImport,
    webhookBasicAuthImport,
    webhookJwtAuthImport,
    fileWatchImport,
    messageQueueImport,
} from './operations-pipelines';

import {
    cdcProductSync,
    eventStockAlert,
    customerAnalyticsExport,
    entityLifecycleOps,
    pimCustomerSync,
    pimOrderImport,
    magentoCustomerMigration,
    resilienceTest,
} from './integration-pipelines';

import {
    searchIndexSync,
    multiFeedExport,
    searchIndexCrudSync,
} from './sink-feed-pipelines';

import {
    erpFullProductImport,
    erpCustomerSync,
    erpOrderImport,
    erpDeltaSyncPipeline,
    erpChannelSpecificCatalog,
} from './erp-complex-pipelines';

import { enterpriseComplexPipeline } from './enterprise-complex-pipeline';

import {
    operatorStressTest,
    customerLifecycleTest,
    orderImportStateTest,
    multiStepTransformChain,
    reconciliationAudit,
} from './enterprise-test-pipelines';

import {
    multiSourceProductAggregation,
    webhookMultiApiEnrichment,
    crossSystemOrderSync,
    biDirectionalSyncA,
    biDirectionalSyncB,
    multiSinkFanOut,
} from './multi-source-pipelines';

import {
    interceptorHookDemo,
    scriptHookDemo,
    searchEnrichmentHookDemo,
    multiHookChainDemo,
    allStagesHookDemo,
} from './hook-examples-pipelines';

export const examplePipelines = {
    catalog: {
        pimCatalogSync,
        magentoProductMigration,
        shopifyInventorySync,
    },
    operations: {
        csvCustomerImport,
        productFeedGenerator,
        webhookOrderImport,
        webhookBasicAuthImport,
        webhookJwtAuthImport,
        fileWatchImport,
        messageQueueImport,
    },
    integration: {
        cdcProductSync,
        eventStockAlert,
        customerAnalyticsExport,
        entityLifecycleOps,
    },
    erp: {
        pimCustomerSync,
        pimOrderImport,
        magentoCustomerMigration,
        resilienceTest,
    },
    erpComplex: {
        erpFullProductImport,
        erpCustomerSync,
        erpOrderImport,
        erpDeltaSyncPipeline,
        erpChannelSpecificCatalog,
    },
    sinkAndFeed: {
        searchIndexSync,
        multiFeedExport,
        searchIndexCrudSync,
    },
    enterprise: {
        enterpriseComplexPipeline,
    },
    enterpriseTest: {
        operatorStressTest,
        customerLifecycleTest,
        orderImportStateTest,
        multiStepTransformChain,
        reconciliationAudit,
    },
    multiSource: {
        multiSourceProductAggregation,
        webhookMultiApiEnrichment,
        crossSystemOrderSync,
        biDirectionalSyncA,
        biDirectionalSyncB,
        multiSinkFanOut,
    },
    hooks: {
        interceptorHookDemo,
        scriptHookDemo,
        searchEnrichmentHookDemo,
        multiHookChainDemo,
        allStagesHookDemo,
    },
};

export const allExamplePipelines = [
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
    searchIndexCrudSync,
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
    interceptorHookDemo,
    scriptHookDemo,
    searchEnrichmentHookDemo,
    multiHookChainDemo,
    allStagesHookDemo,
];
