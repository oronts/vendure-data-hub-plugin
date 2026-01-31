import { Injectable } from '@nestjs/common';
import { DataHubAdapter, AdapterDefinition, AdapterType } from './types';

/**
 * Validate adapter code format
 * @param code Adapter code to validate
 * @throws Error if code is invalid
 */
function validateAdapterCode(code: string): void {
    if (!code || typeof code !== 'string') {
        throw new Error('Adapter code must be a non-empty string');
    }
    if (code.trim() !== code) {
        throw new Error('Adapter code must not have leading or trailing whitespace');
    }
    if (code.length > 100) {
        throw new Error('Adapter code must not exceed 100 characters');
    }
}

/**
 * Validate adapter type
 * @param type Adapter type to validate
 * @throws Error if type is invalid
 */
function validateAdapterType(type: string): void {
    const validTypes = ['extractor', 'operator', 'loader', 'validator', 'enricher', 'exporter', 'feed', 'sink'];
    if (!type || typeof type !== 'string') {
        throw new Error('Adapter type must be a non-empty string');
    }
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid adapter type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    }
}

/**
 * Registry for adapter definitions and runtime adapters.
 * - AdapterDefinition: Static metadata/schema for UI rendering
 * - DataHubAdapter: Runtime adapters with actual execution methods
 */
@Injectable()
export class DataHubRegistryService {
    private definitions = new Map<string, AdapterDefinition>();
    private runtimeAdapters = new Map<string, DataHubAdapter>();

    /**
     * Register an adapter definition (metadata only, for UI)
     * @param adapter Adapter definition to register
     * @throws Error if adapter is invalid or already registered
     */
    register(adapter: AdapterDefinition): void {
        if (!adapter) {
            throw new Error('Adapter definition is required');
        }
        validateAdapterType(adapter.type);
        validateAdapterCode(adapter.code);

        const key = `${adapter.type}:${adapter.code}`;
        if (this.definitions.has(key)) {
            throw new Error(`Adapter already registered: ${key}`);
        }
        this.definitions.set(key, adapter);
    }

    /**
     * Register a runtime adapter (with execution methods)
     * @param adapter Runtime adapter to register
     * @throws Error if adapter is invalid
     */
    registerRuntime(adapter: DataHubAdapter): void {
        if (!adapter) {
            throw new Error('Runtime adapter is required');
        }
        validateAdapterType(adapter.type);
        validateAdapterCode(adapter.code);

        const key = `${adapter.type}:${adapter.code}`;
        this.runtimeAdapters.set(key, adapter);
        // Also register the definition if not already present
        if (!this.definitions.has(key)) {
            this.definitions.set(key, adapter);
        }
    }

    /**
     * List all adapter definitions (for UI/API)
     */
    list(): AdapterDefinition[] {
        return Array.from(this.definitions.values());
    }

    /**
     * Find an adapter definition by type and code
     */
    find(type: AdapterType, code: string): AdapterDefinition | undefined {
        return this.definitions.get(`${type}:${code}`);
    }

    /**
     * Get a runtime adapter for execution
     */
    getRuntime(type: AdapterType, code: string): DataHubAdapter | undefined {
        return this.runtimeAdapters.get(`${type}:${code}`);
    }

    /**
     * Check if a runtime adapter exists
     */
    hasRuntime(type: AdapterType, code: string): boolean {
        return this.runtimeAdapters.has(`${type}:${code}`);
    }
}

