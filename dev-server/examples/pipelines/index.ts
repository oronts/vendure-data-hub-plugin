/**
 * Example Pipelines Index
 *
 * 37 production-quality pipelines covering ALL DataHub capabilities:
 * - Catalog (3): PIM sync, Magento migration, Shopify inventory
 * - Operations (7): CSV customer import, feed generation, webhook orders (3 auth modes), file watch, message queue
 * - Integration (8): CDC sync, event alerts, analytics, entity lifecycle, PIM customer sync, PIM order import, Magento customer migration, resilience test
 * - Sink & Feed (2): Search index sync (5 engines), multi-feed export (4 marketplaces)
 * - ERP Complex (5): Full product import, customer sync, order import, delta sync, channel catalog
 * - Enterprise Complex (1): Full enterprise pipeline
 * - Enterprise Test (5): Operator stress, customer lifecycle, order state, transform chain, reconciliation
 * - Multi-Source (6): Multi-source aggregation, webhook enrichment, cross-system order sync, bi-directional sync (2), multi-sink fan-out
 */

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
];
