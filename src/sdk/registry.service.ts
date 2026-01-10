import { Injectable } from '@nestjs/common';
import { DataHubAdapter, AdapterDefinition, AdapterType } from './types';

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
     */
    register(adapter: AdapterDefinition): void {
        const key = `${adapter.type}:${adapter.code}`;
        if (this.definitions.has(key)) {
            throw new Error(`Adapter already registered: ${key}`);
        }
        this.definitions.set(key, adapter);
    }

    /**
     * Register a runtime adapter (with execution methods)
     */
    registerRuntime(adapter: DataHubAdapter): void {
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

