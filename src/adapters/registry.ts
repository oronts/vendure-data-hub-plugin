/**
 * Module-level adapter registry - Public SDK surface
 *
 * These functions provide a simple, DI-free API for registering and querying
 * adapters from external plugins, standalone scripts, and test setups.
 *
 * Internal services should use the Injectable DataHubRegistryService
 * (src/sdk/registry.service.ts) which is managed by NestJS DI.
 */
import type {
    AdapterDefinition,
    AdapterType,
    BatchExtractorAdapter,
    EnricherAdapter,
    ExporterAdapter,
    ExtractorAdapter,
    FeedAdapter,
    LoaderAdapter,
    OperatorAdapter,
    SingleRecordOperator,
    SinkAdapter,
    ValidatorAdapter,
} from '../sdk/types/adapter-types';
import { DataHubLoggerFactory } from '../services/logger/datahub-logger';
import { LOGGER_CONTEXTS } from '../constants/core';
import type { ScriptFunction } from '../../shared/types';
import {
    validateAdapterLifecycleMetadata,
    validateBatchExtractorPreview,
} from '../sdk/adapter-metadata';

type RuntimeExtractor = ExtractorAdapter<unknown> | BatchExtractorAdapter<unknown>;

function hasExtractorRuntime(adapter: RuntimeExtractor): boolean {
    const value = adapter as unknown as Record<string, unknown>;
    return adapter.type === 'EXTRACTOR' &&
        (typeof value.extract === 'function' || typeof value.extractAll === 'function');
}

function assertRuntimeMethod(
    adapter: AdapterDefinition,
    expectedType: AdapterType,
    methodNames: readonly string[],
    registrationName: string,
): void {
    if (adapter.type !== expectedType) {
        throw new Error(
            `${registrationName} expects type '${expectedType}', got '${adapter.type}'`,
        );
    }
    const value = adapter as unknown as Record<string, unknown>;
    if (methodNames.some(methodName => typeof value[methodName] === 'function')) {
        return;
    }
    const contract = methodNames.map(methodName => `${methodName}()`).join(' or ');
    throw new Error(
        `${registrationName} expects a ${expectedType} adapter with ${contract}`,
    );
}

const MAX_ADAPTERS = 200;
const adapterRegistry = new Map<string, AdapterDefinition>();
const adaptersByType = new Map<AdapterType, Set<string>>();
const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.ADAPTER_REGISTRY);

/** Register extractor adapter (pulls data from REST, GraphQL, CSV, etc.) */
export function registerExtractor(adapter: RuntimeExtractor): void {
    if (!hasExtractorRuntime(adapter)) {
        throw new Error('registerExtractor expects an EXTRACTOR adapter with extract() or extractAll()');
    }
    validateBatchExtractorPreview(adapter);
    registerAdapter(adapter);
    logger.info(`Registered custom extractor: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register loader adapter (writes to Vendure entities) */
export function registerLoader(adapter: LoaderAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'LOADER', ['load'], 'registerLoader');
    registerAdapter(adapter);
    logger.info(`Registered custom loader: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register operator adapter (transforms or filters records) */
export function registerOperator(
    adapter: OperatorAdapter<unknown> | SingleRecordOperator<unknown>,
): void {
    assertRuntimeMethod(adapter, 'OPERATOR', ['apply', 'applyOne'], 'registerOperator');
    registerAdapter(adapter);
    logger.info(`Registered custom operator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
        pure: adapter.pure,
    });
}

/** Register exporter adapter (sends data to external systems) */
export function registerExporter(adapter: ExporterAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'EXPORTER', ['export'], 'registerExporter');
    registerAdapter(adapter);
    logger.info(`Registered custom exporter: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register feed adapter (generates product feeds for Google, Meta, etc.) */
export function registerFeed(adapter: FeedAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'FEED', ['generateFeed'], 'registerFeed');
    registerAdapter(adapter);
    logger.info(`Registered custom feed: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register sink adapter (indexes data to Elasticsearch, Algolia, etc.) */
export function registerSink(adapter: SinkAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'SINK', ['index'], 'registerSink');
    registerAdapter(adapter);
    logger.info(`Registered custom sink: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register validator adapter (checks data against rules/schemas) */
export function registerValidator(adapter: ValidatorAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'VALIDATOR', ['validate'], 'registerValidator');
    registerAdapter(adapter);
    logger.info(`Registered custom validator: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register enricher adapter (adds data from external APIs) */
export function registerEnricher(adapter: EnricherAdapter<unknown>): void {
    assertRuntimeMethod(adapter, 'ENRICHER', ['enrich'], 'registerEnricher');
    registerAdapter(adapter);
    logger.info(`Registered custom enricher: ${adapter.code}`, {
        adapterCode: adapter.code,
        name: adapter.name,
    });
}

/** Register adapter (throws if code already exists or registry is full) */
export function registerAdapter(adapter: AdapterDefinition): void {
    validateAdapterLifecycleMetadata(adapter, { requireVersion: true });
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
