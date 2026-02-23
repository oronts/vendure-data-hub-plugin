/**
 * Module-level adapter registry — Public SDK surface
 *
 * These functions provide a simple, DI-free API for registering and querying
 * adapters from external plugins, standalone scripts, and test setups.
 *
 * Internal services should use the Injectable DataHubRegistryService
 * (src/sdk/registry.service.ts) which is managed by NestJS DI.
 */
import { AdapterDefinition, AdapterType } from '../sdk/types';
import { DataHubLogger } from '../services/logger/datahub-logger';
import { CustomTransformInfo } from '../transforms/types';
import { ScriptFunction } from '../../shared/types';

const MAX_ADAPTERS = 200;
const adapterRegistry = new Map<string, AdapterDefinition>();
const adaptersByType = new Map<AdapterType, Set<string>>();
const logger = new DataHubLogger('AdapterRegistry');

/** Register extractor adapter (pulls data from REST, GraphQL, CSV, etc.) */
export function registerExtractor(adapter: AdapterDefinition): void {
    if (adapter.type !== 'EXTRACTOR') {
        throw new Error(`registerExtractor expects type 'EXTRACTOR', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom extractor: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register loader adapter (writes to Vendure entities) */
export function registerLoader(adapter: AdapterDefinition): void {
    if (adapter.type !== 'LOADER') {
        throw new Error(`registerLoader expects type 'LOADER', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom loader: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register operator adapter (transforms or filters records) */
export function registerOperator(adapter: AdapterDefinition): void {
    if (adapter.type !== 'OPERATOR') {
        throw new Error(`registerOperator expects type 'OPERATOR', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom operator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
        pure: adapter.pure,
    });
}

/** Register exporter adapter (sends data to external systems) */
export function registerExporter(adapter: AdapterDefinition): void {
    if (adapter.type !== 'EXPORTER') {
        throw new Error(`registerExporter expects type 'EXPORTER', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom exporter: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register feed adapter (generates product feeds for Google, Meta, etc.) */
export function registerFeed(adapter: AdapterDefinition): void {
    if (adapter.type !== 'FEED') {
        throw new Error(`registerFeed expects type 'FEED', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom feed: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register sink adapter (indexes data to Elasticsearch, Algolia, etc.) */
export function registerSink(adapter: AdapterDefinition): void {
    if (adapter.type !== 'SINK') {
        throw new Error(`registerSink expects type 'SINK', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom sink: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register validator adapter (checks data against rules/schemas) */
export function registerValidator(adapter: AdapterDefinition): void {
    if (adapter.type !== 'VALIDATOR') {
        throw new Error(`registerValidator expects type 'VALIDATOR', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom validator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register enricher adapter (adds data from external APIs) */
export function registerEnricher(adapter: AdapterDefinition): void {
    if (adapter.type !== 'ENRICHER') {
        throw new Error(`registerEnricher expects type 'ENRICHER', got '${adapter.type}'`);
    }
    registerAdapter(adapter);
    logger.info(`Registered custom enricher: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register adapter (throws if code already exists or registry is full) */
export function registerAdapter(adapter: AdapterDefinition): void {
    if (adapterRegistry.has(adapter.code)) {
        throw new Error(`Adapter with code '${adapter.code}' is already registered`);
    }

    if (adapterRegistry.size >= MAX_ADAPTERS) {
        throw new Error(`Adapter registry is full (max ${MAX_ADAPTERS}). Cannot register '${adapter.code}'.`);
    }

    adapterRegistry.set(adapter.code, adapter);

    // Add to type index
    if (!adaptersByType.has(adapter.type)) {
        adaptersByType.set(adapter.type, new Set());
    }
    adaptersByType.get(adapter.type)?.add(adapter.code);

    logger.debug(`Adapter registered: ${adapter.code} (${adapter.type})`);
}

/** Safely register adapter (warns and skips if already exists) */
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

export function clearRegistry(): void {
    const count = adapterRegistry.size;
    adapterRegistry.clear();
    adaptersByType.clear();
    logger.info(`Registry cleared`, { previousCount: count });
}

export function getAdapter(code: string): AdapterDefinition | undefined {
    return adapterRegistry.get(code);
}

export function getAdapterOrThrow(code: string): AdapterDefinition {
    const adapter = adapterRegistry.get(code);
    if (!adapter) {
        throw new Error(`Adapter with code '${code}' not found`);
    }
    return adapter;
}

export function hasAdapter(code: string): boolean {
    return adapterRegistry.has(code);
}

export function getAllAdapters(): AdapterDefinition[] {
    return Array.from(adapterRegistry.values());
}

export function getAdaptersByType(type: AdapterType): AdapterDefinition[] {
    const codes = adaptersByType.get(type);
    if (!codes) return [];
    return Array.from(codes)
        .map(code => adapterRegistry.get(code))
        .filter((adapter): adapter is AdapterDefinition => adapter !== undefined);
}

export function getAdapterCodesByType(type: AdapterType): string[] {
    const codes = adaptersByType.get(type);
    return codes ? Array.from(codes) : [];
}

export function findAdapters(
    predicate: (adapter: AdapterDefinition) => boolean,
): AdapterDefinition[] {
    return getAllAdapters().filter(predicate);
}

export function searchAdapters(query: string): AdapterDefinition[] {
    const lowerQuery = query.toLowerCase();
    return findAdapters(adapter =>
        adapter.code.toLowerCase().includes(lowerQuery) ||
        (adapter.name?.toLowerCase().includes(lowerQuery) ?? false) ||
        (adapter.description?.toLowerCase().includes(lowerQuery) ?? false),
    );
}

export function getAdapterCount(): number {
    return adapterRegistry.size;
}

export function getAdapterCountByType(): Record<AdapterType, number> {
    const counts: Partial<Record<AdapterType, number>> = {};
    adaptersByType.forEach((codes, type) => {
        counts[type] = codes.size;
    });
    return counts as Record<AdapterType, number>;
}

export function getAdapterCodes(): string[] {
    return Array.from(adapterRegistry.keys());
}

export function getExtractors(): AdapterDefinition[] {
    return getAdaptersByType('EXTRACTOR');
}

export function getLoaders(): AdapterDefinition[] {
    return getAdaptersByType('LOADER');
}

export function getOperators(): AdapterDefinition[] {
    return getAdaptersByType('OPERATOR');
}

export function getExporters(): AdapterDefinition[] {
    return getAdaptersByType('EXPORTER');
}

export function getFeeds(): AdapterDefinition[] {
    return getAdaptersByType('FEED');
}

export function getSinks(): AdapterDefinition[] {
    return getAdaptersByType('SINK');
}

export function getValidators(): AdapterDefinition[] {
    return getAdaptersByType('VALIDATOR');
}

export function getEnrichers(): AdapterDefinition[] {
    return getAdaptersByType('ENRICHER');
}

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

// ==========================================
// Transform Registry
// ==========================================

const MAX_TRANSFORMS = 100;
const transformRegistry = new Map<string, CustomTransformInfo>();

/**
 * Register a custom field-level transform
 *
 * Custom transforms allow plugins to add new field transformation types
 * that can be used in TransformConfig alongside built-in transforms.
 *
 * @example
 * ```typescript
 * registerTransform({
 *     type: 'REVERSE_STRING',
 *     name: 'Reverse String',
 *     description: 'Reverses the characters in a string',
 *     transform: (ctx, value) => {
 *         if (typeof value !== 'string') return value;
 *         return value.split('').reverse().join('');
 *     }
 * });
 * ```
 */
export function registerTransform(transform: CustomTransformInfo): void {
    if (!transform.type) {
        throw new Error('Transform type is required');
    }
    if (!transform.name) {
        throw new Error('Transform name is required');
    }
    if (!transform.transform || typeof transform.transform !== 'function') {
        throw new Error('Transform function is required');
    }
    if (transformRegistry.has(transform.type)) {
        throw new Error(`Transform with type '${transform.type}' is already registered`);
    }
    if (transformRegistry.size >= MAX_TRANSFORMS) {
        throw new Error(`Transform registry is full (max ${MAX_TRANSFORMS})`);
    }

    transformRegistry.set(transform.type, transform);
    logger.info(`Registered custom transform: ${transform.type}`, {
        type: transform.type,
        name: transform.name,
    });
}

/**
 * Get all registered custom transforms
 * Used by the bootstrap process to propagate module-level registrations to DI services
 */
export function getModuleLevelTransforms(): CustomTransformInfo[] {
    return Array.from(transformRegistry.values());
}

/**
 * Check if a transform type is registered
 */
export function hasTransform(type: string): boolean {
    return transformRegistry.has(type);
}

/**
 * Get a specific transform by type
 */
export function getTransform(type: string): CustomTransformInfo | undefined {
    return transformRegistry.get(type);
}

/**
 * Get all registered transform types
 */
export function getTransformTypes(): string[] {
    return Array.from(transformRegistry.keys());
}

/**
 * Get count of registered custom transforms
 */
export function getTransformCount(): number {
    return transformRegistry.size;
}

/**
 * Clear all registered custom transforms (primarily for testing)
 */
export function clearTransforms(): void {
    transformRegistry.clear();
    logger.info('Cleared all custom transforms');
}

// ==========================================
// Hook Script Registry
// ==========================================

const MAX_SCRIPTS = 100;
const scriptRegistry = new Map<string, ScriptFunction>();

/**
 * Register a custom hook script function
 *
 * Hook scripts allow plugins to add custom code that can be executed
 * during pipeline execution via script hooks. Scripts are referenced by
 * name in hook configurations.
 *
 * @example
 * ```typescript
 * registerScript('myValidation', async (ctx, record) => {
 *     if (!record.email) {
 *         throw new Error('Email is required');
 *     }
 *     return record;
 * });
 * ```
 */
export function registerScript(name: string, fn: ScriptFunction): void {
    if (!name) {
        throw new Error('Script name is required');
    }
    if (typeof fn !== 'function') {
        throw new Error('Script function is required');
    }
    if (scriptRegistry.has(name)) {
        logger.warn(`Script "${name}" is being overwritten`);
    }
    if (scriptRegistry.size >= MAX_SCRIPTS) {
        throw new Error(`Script registry is full (max ${MAX_SCRIPTS})`);
    }

    scriptRegistry.set(name, fn);
    logger.info(`Registered hook script: ${name}`);
}

/**
 * Get all registered custom hook scripts
 * Used by the bootstrap process to propagate module-level registrations to HookService
 */
export function getModuleLevelScripts(): Array<{ name: string; fn: ScriptFunction }> {
    return Array.from(scriptRegistry.entries()).map(([name, fn]) => ({ name, fn }));
}

/**
 * Check if a script is registered
 */
export function hasScript(name: string): boolean {
    return scriptRegistry.has(name);
}

/**
 * Get a specific script by name
 */
export function getScript(name: string): ScriptFunction | undefined {
    return scriptRegistry.get(name);
}

/**
 * Get all registered script names
 */
export function getScriptNames(): string[] {
    return Array.from(scriptRegistry.keys());
}

/**
 * Get count of registered scripts
 */
export function getScriptCount(): number {
    return scriptRegistry.size;
}

/**
 * Clear all registered scripts (primarily for testing)
 */
export function clearScripts(): void {
    scriptRegistry.clear();
    logger.info('Cleared all hook scripts');
}
