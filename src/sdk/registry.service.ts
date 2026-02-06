import { Injectable } from '@nestjs/common';
import { DataHubAdapter, AdapterDefinition, AdapterType } from './types';

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

    list(): AdapterDefinition[] {
        return Array.from(this.definitions.values());
    }

    find(type: AdapterType, code: string): AdapterDefinition | undefined {
        return this.definitions.get(`${type}:${code}`);
    }

    getRuntime(type: AdapterType, code: string): DataHubAdapter | undefined {
        return this.runtimeAdapters.get(`${type}:${code}`);
    }

    hasRuntime(type: AdapterType, code: string): boolean {
        return this.runtimeAdapters.has(`${type}:${code}`);
    }
}

