/**
 * Data Hub Plugin Examples
 *
 * Custom adapter examples (operators, extractors, loaders) and 37 production-quality
 * pipeline examples covering all DataHub capabilities.
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
    pimCatalogSync,
    magentoProductMigration,
    shopifyInventorySync,
    csvCustomerImport,
    productFeedGenerator,
    webhookOrderImport,
    cdcProductSync,
    eventStockAlert,
    customerAnalyticsExport,
    entityLifecycleOps,
    searchIndexSync,
    multiFeedExport,
    searchIndexCrudSync,
    examplePipelines,
    allExamplePipelines,
    hookScripts,
    interceptorHookDemo,
    scriptHookDemo,
    searchEnrichmentHookDemo,
    multiHookChainDemo,
} from './pipelines';
