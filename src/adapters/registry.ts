import { AdapterDefinition, AdapterType } from '../sdk/types';
import { DataHubLogger } from '../services/logger/datahub-logger';

const adapterRegistry = new Map<string, AdapterDefinition>();
const adaptersByType = new Map<AdapterType, Set<string>>();
const logger = new DataHubLogger('AdapterRegistry');

/**
 * Register a custom extractor adapter
 * Extractors pull data from external sources (REST, GraphQL, CSV, etc.)
 *
 * @param adapter - The extractor adapter definition
 * @throws Error if adapter code is already registered (use registerAdapterSafe for skip behavior)
 *
 * @example
 * ```typescript
 * registerExtractor({
 *   type: 'extractor',
 *   code: 'my-api',
 *   name: 'My API Extractor',
 *   description: 'Extract data from My API',
 *   schema: { fields: [...] }
 * });
 * ```
 */
export function registerExtractor(adapter: AdapterDefinition): void {
    if (adapter.type !== 'extractor') {
        throw new Error(`registerExtractor expects type 'extractor', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom extractor: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom loader adapter
 * Loaders write data to Vendure entities (products, customers, orders, etc.)
 *
 * @param adapter - The loader adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerLoader({
 *   type: 'loader',
 *   code: 'custom-product-sync',
 *   name: 'Custom Product Sync',
 *   description: 'Sync products with custom logic',
 *   schema: { fields: [...] }
 * });
 * ```
 */
export function registerLoader(adapter: AdapterDefinition): void {
    if (adapter.type !== 'loader') {
        throw new Error(`registerLoader expects type 'loader', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom loader: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom operator adapter
 * Operators transform or filter records (map, filter, enrich, etc.)
 *
 * @param adapter - The operator adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerOperator({
 *   type: 'operator',
 *   code: 'custom-transform',
 *   name: 'Custom Transform',
 *   description: 'Apply custom transformation logic',
 *   pure: true,
 *   schema: { fields: [...] }
 * });
 * ```
 */
export function registerOperator(adapter: AdapterDefinition): void {
    if (adapter.type !== 'operator') {
        throw new Error(`registerOperator expects type 'operator', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom operator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
        pure: adapter.pure,
    });
}

/**
 * Register a custom exporter adapter
 * Exporters send data to external systems (files, APIs, warehouses, etc.)
 *
 * @param adapter - The exporter adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerExporter({
 *   type: 'exporter',
 *   code: 'sftp-export',
 *   name: 'SFTP Export',
 *   description: 'Export data to SFTP server',
 *   schema: { fields: [
 *     { key: 'host', type: 'string', label: 'Host', required: true },
 *     { key: 'path', type: 'string', label: 'Remote Path', required: true },
 *   ]}
 * });
 * ```
 */
export function registerExporter(adapter: AdapterDefinition): void {
    if (adapter.type !== 'exporter') {
        throw new Error(`registerExporter expects type 'exporter', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom exporter: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom feed adapter
 * Feeds generate product feeds for marketplaces (Google, Meta, etc.)
 *
 * @param adapter - The feed adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerFeed({
 *   type: 'feed',
 *   code: 'pinterest-feed',
 *   name: 'Pinterest Product Feed',
 *   description: 'Generate Pinterest shopping feed',
 *   schema: { fields: [
 *     { key: 'shopUrl', type: 'string', label: 'Shop URL', required: true },
 *     { key: 'currency', type: 'string', label: 'Currency', required: true },
 *   ]}
 * });
 * ```
 */
export function registerFeed(adapter: AdapterDefinition): void {
    if (adapter.type !== 'feed') {
        throw new Error(`registerFeed expects type 'feed', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom feed: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom sink adapter
 * Sinks index data to search engines (Elasticsearch, Algolia, etc.)
 *
 * @param adapter - The sink adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerSink({
 *   type: 'sink',
 *   code: 'typesense-sink',
 *   name: 'Typesense Search Index',
 *   description: 'Index products to Typesense',
 *   schema: { fields: [
 *     { key: 'apiKey', type: 'secret', label: 'API Key', required: true },
 *     { key: 'collection', type: 'string', label: 'Collection', required: true },
 *   ]}
 * });
 * ```
 */
export function registerSink(adapter: AdapterDefinition): void {
    if (adapter.type !== 'sink') {
        throw new Error(`registerSink expects type 'sink', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom sink: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom validator adapter
 * Validators check record data against rules/schemas
 *
 * @param adapter - The validator adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerValidator({
 *   type: 'validator',
 *   code: 'sku-validator',
 *   name: 'SKU Validator',
 *   description: 'Validate SKU format and uniqueness',
 *   schema: { fields: [
 *     { key: 'pattern', type: 'string', label: 'SKU Pattern', required: true },
 *     { key: 'checkUniqueness', type: 'boolean', label: 'Check Uniqueness' },
 *   ]}
 * });
 * ```
 */
export function registerValidator(adapter: AdapterDefinition): void {
    if (adapter.type !== 'validator') {
        throw new Error(`registerValidator expects type 'validator', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom validator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a custom enricher adapter
 * Enrichers add additional data to records (e.g., from external APIs)
 *
 * @param adapter - The enricher adapter definition
 * @throws Error if adapter code is already registered
 *
 * @example
 * ```typescript
 * registerEnricher({
 *   type: 'enricher',
 *   code: 'inventory-enricher',
 *   name: 'Inventory Enricher',
 *   description: 'Enrich products with real-time inventory data',
 *   schema: { fields: [
 *     { key: 'warehouseId', type: 'string', label: 'Warehouse ID', required: true },
 *     { key: 'includeReserved', type: 'boolean', label: 'Include Reserved Stock' },
 *   ]}
 * });
 * ```
 */
export function registerEnricher(adapter: AdapterDefinition): void {
    if (adapter.type !== 'enricher') {
        throw new Error(`registerEnricher expects type 'enricher', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom enricher: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/**
 * Register a single adapter (any type)
 * Throws if adapter with same code already exists
 *
 * @param adapter - The adapter definition to register
 * @throws Error if adapter code is already registered
 */
export function registerAdapter(adapter: AdapterDefinition): void {
    if (adapterRegistry.has(adapter.code)) {
        throw new Error(`Adapter with code '${adapter.code}' is already registered`);
    }

    adapterRegistry.set(adapter.code, adapter);

    // Add to type index
    if (!adaptersByType.has(adapter.type)) {
        adaptersByType.set(adapter.type, new Set());
    }
    adaptersByType.get(adapter.type)?.add(adapter.code);

    logger.debug(`Adapter registered: ${adapter.code} (${adapter.type})`);
}

/**
 * Safely register a single adapter
 * Warns and skips if adapter with same code already exists (no error)
 *
 * @param adapter - The adapter definition to register
 * @returns true if registered, false if skipped (already exists)
 */
export function registerAdapterSafe(adapter: AdapterDefinition): boolean {
    if (adapterRegistry.has(adapter.code)) {
        logger.warn(`Adapter '${adapter.code}' already registered, skipping duplicate registration`, {
            adapterCode: adapter.code,
            existingType: adapterRegistry.get(adapter.code)?.type,
            newType: adapter.type,
        });
        return false;
    }

    registerAdapter(adapter);
    return true;
}

/**
 * Register multiple adapters at once
 * Warns and skips adapters that already exist (no error)
 *
 * @param adapters - Array of adapter definitions to register
 * @returns Object with counts of registered and skipped adapters
 */
export function registerAdapters(adapters: AdapterDefinition[]): { registered: number; skipped: number } {
    let registered = 0;
    let skipped = 0;

    for (const adapter of adapters) {
        if (registerAdapterSafe(adapter)) {
            registered++;
        } else {
            skipped++;
        }
    }

    if (registered > 0) {
        logger.info(`Bulk registration complete`, { registered, skipped, total: adapters.length });
    }

    return { registered, skipped };
}

/**
 * Unregister an adapter by code
 * Returns true if adapter was found and removed
 *
 * @param code - The adapter code to unregister
 * @returns true if found and removed, false if not found
 */
export function unregisterAdapter(code: string): boolean {
    const adapter = adapterRegistry.get(code);
    if (!adapter) {
        logger.debug(`Unregister failed: adapter '${code}' not found`);
        return false;
    }

    adapterRegistry.delete(code);

    // Remove from type index
    const typeSet = adaptersByType.get(adapter.type);
    if (typeSet) {
        typeSet.delete(code);
    }

    logger.info(`Unregistered adapter: ${code}`, {
        adapterCode: code,
        adapterType: adapter.type,
    });

    return true;
}

/**
 * Clear all registered adapters
 * Useful for testing
 */
export function clearRegistry(): void {
    const count = adapterRegistry.size;
    adapterRegistry.clear();
    adaptersByType.clear();
    logger.info(`Registry cleared`, { previousCount: count });
}

/**
 * Get adapter by code
 * Returns undefined if not found
 */
export function getAdapter(code: string): AdapterDefinition | undefined {
    return adapterRegistry.get(code);
}

/**
 * Get adapter by code (throws if not found)
 */
export function getAdapterOrThrow(code: string): AdapterDefinition {
    const adapter = adapterRegistry.get(code);
    if (!adapter) {
        throw new Error(`Adapter with code '${code}' not found`);
    }
    return adapter;
}

/**
 * Check if adapter exists
 */
export function hasAdapter(code: string): boolean {
    return adapterRegistry.has(code);
}

/**
 * Get all registered adapters
 */
export function getAllAdapters(): AdapterDefinition[] {
    return Array.from(adapterRegistry.values());
}

/**
 * Get adapters by type
 */
export function getAdaptersByType(type: AdapterType): AdapterDefinition[] {
    const codes = adaptersByType.get(type);
    if (!codes) return [];
    return Array.from(codes)
        .map(code => adapterRegistry.get(code))
        .filter((adapter): adapter is AdapterDefinition => adapter !== undefined);
}

/**
 * Get adapter codes by type
 */
export function getAdapterCodesByType(type: AdapterType): string[] {
    const codes = adaptersByType.get(type);
    return codes ? Array.from(codes) : [];
}

/**
 * Find adapters matching a predicate
 */
export function findAdapters(
    predicate: (adapter: AdapterDefinition) => boolean,
): AdapterDefinition[] {
    return getAllAdapters().filter(predicate);
}

/**
 * Search adapters by name, code, or description
 * Case-insensitive partial match
 */
export function searchAdapters(query: string): AdapterDefinition[] {
    const lowerQuery = query.toLowerCase();
    return findAdapters(adapter =>
        adapter.code.toLowerCase().includes(lowerQuery) ||
        (adapter.name?.toLowerCase().includes(lowerQuery) ?? false) ||
        (adapter.description?.toLowerCase().includes(lowerQuery) ?? false),
    );
}

/**
 * Get count of registered adapters
 */
export function getAdapterCount(): number {
    return adapterRegistry.size;
}

/**
 * Get count of adapters by type
 */
export function getAdapterCountByType(): Record<AdapterType, number> {
    const counts: Partial<Record<AdapterType, number>> = {};
    adaptersByType.forEach((codes, type) => {
        counts[type] = codes.size;
    });
    return counts as Record<AdapterType, number>;
}

/**
 * Get all registered adapter codes
 */
export function getAdapterCodes(): string[] {
    return Array.from(adapterRegistry.keys());
}

/**
 * Get all registered adapters (alias for getAllAdapters)
 */
export function getRegisteredAdapters(): AdapterDefinition[] {
    return getAllAdapters();
}

/**
 * Get all registered extractor adapters
 */
export function getExtractors(): AdapterDefinition[] {
    return getAdaptersByType('extractor');
}

/**
 * Get all registered loader adapters
 */
export function getLoaders(): AdapterDefinition[] {
    return getAdaptersByType('loader');
}

/**
 * Get all registered operator adapters
 */
export function getOperators(): AdapterDefinition[] {
    return getAdaptersByType('operator');
}

/**
 * Get all registered exporter adapters
 */
export function getExporters(): AdapterDefinition[] {
    return getAdaptersByType('exporter');
}

/**
 * Get all registered feed adapters
 */
export function getFeeds(): AdapterDefinition[] {
    return getAdaptersByType('feed');
}

/**
 * Get all registered sink adapters
 */
export function getSinks(): AdapterDefinition[] {
    return getAdaptersByType('sink');
}

/**
 * Get all registered validator adapters
 */
export function getValidators(): AdapterDefinition[] {
    return getAdaptersByType('validator');
}

/**
 * Get all registered enricher adapters
 */
export function getEnrichers(): AdapterDefinition[] {
    return getAdaptersByType('enricher');
}

/**
 * Get a summary of the registry state
 */
export function getRegistrySummary(): {
    total: number;
    byType: Record<AdapterType, number>;
    codes: string[];
} {
    return {
        total: adapterRegistry.size,
        byType: getAdapterCountByType(),
        codes: getAdapterCodes(),
    };
}
