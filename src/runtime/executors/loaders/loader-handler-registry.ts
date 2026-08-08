import type { Type } from '@vendure/core';
import type { AdapterDefinition } from '../../../sdk/types';
import type { LoaderHandler } from './types';
import {
    LOADER_ADAPTERS,
    LOADER_DEFINITION_REGISTRY,
} from './registry/loader-adapter-definitions';
import { LOADER_HANDLER_MAP } from './registry/loader-handler-map';

interface LoaderRegistryEntry {
    handler: Type<LoaderHandler>;
    definition: AdapterDefinition;
}

function createLoaderRegistry(): Map<string, LoaderRegistryEntry> {
    const registry = new Map<string, LoaderRegistryEntry>();
    for (const [code, definitionEntry] of LOADER_DEFINITION_REGISTRY) {
        const handler = LOADER_HANDLER_MAP.get(code);
        if (!handler) {
            throw new Error(`Loader definition "${code}" has no handler`);
        }
        registry.set(code, {
            handler,
            definition: definitionEntry.definition,
        });
    }
    if (registry.size !== LOADER_HANDLER_MAP.size) {
        const definitions = new Set(registry.keys());
        const orphanedHandler = [...LOADER_HANDLER_MAP.keys()].find(code => !definitions.has(code));
        throw new Error(`Loader handler "${orphanedHandler}" has no definition`);
    }
    return registry;
}

export const LOADER_HANDLER_REGISTRY = createLoaderRegistry();

export { LOADER_ADAPTERS };

export const LOADER_HANDLER_PROVIDERS: Type<LoaderHandler>[] = [...new Set(
    Array.from(LOADER_HANDLER_REGISTRY.values()).map(entry => entry.handler),
)];

export const LOADER_CODE = Object.fromEntries(
    Array.from(LOADER_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;
