export * from './types';
export * from './base';

// Registry functions - uses AdapterDefinition from ../sdk/types
export {
    // Type-specific registration (with type validation)
    registerExtractor,
    registerLoader,
    registerOperator,
    registerExporter,
    registerFeed,
    registerSink,
    registerValidator,
    registerEnricher,
    // Generic registration
    registerAdapter,
    registerAdapterSafe,
    registerAdapters,
    unregisterAdapter,
    clearRegistry,
    // Lookup functions
    getAdapter,
    getAdapterOrThrow,
    hasAdapter,
    getAllAdapters,
    getRegisteredAdapters,
    getAdaptersByType,
    getAdapterCodesByType,
    // Type-specific getters
    getExtractors,
    getLoaders,
    getOperators,
    getExporters,
    getFeeds,
    getSinks,
    getValidators,
    getEnrichers,
    // Query functions
    findAdapters,
    searchAdapters,
    // Registry info
    getAdapterCount,
    getAdapterCountByType,
    getAdapterCodes,
    getRegistrySummary,
} from './registry';

export * from './utils';
export * from './extractors';
export * from './loaders';
export * from './transformers';
export * from './data-validators';
export * from './exporters';

export { COMMON_ADAPTERS } from './common-adapters';
