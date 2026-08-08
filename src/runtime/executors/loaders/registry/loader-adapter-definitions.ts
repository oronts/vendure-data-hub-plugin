import type { AdapterDefinition } from '../../../../sdk/types';
import { CORE_LOADER_DEFINITIONS } from './core-loader-definitions';
import { INTEGRATION_LOADER_DEFINITIONS } from './integration-loader-definitions';
import { MERCHANDISING_LOADER_DEFINITIONS } from './merchandising-loader-definitions';
import { OPERATIONS_LOADER_DEFINITIONS } from './operations-loader-definitions';
import type { LoaderDefinitionRegistryEntry } from './loader-registry.shared';

export const LOADER_DEFINITION_ENTRIES = [
    ...CORE_LOADER_DEFINITIONS,
    ...MERCHANDISING_LOADER_DEFINITIONS,
    ...INTEGRATION_LOADER_DEFINITIONS,
    ...OPERATIONS_LOADER_DEFINITIONS,
];

export const LOADER_DEFINITION_REGISTRY = new Map<string, LoaderDefinitionRegistryEntry>(
    LOADER_DEFINITION_ENTRIES,
);

if (LOADER_DEFINITION_REGISTRY.size !== LOADER_DEFINITION_ENTRIES.length) {
    throw new Error('Loader definition codes must be unique');
}

export const LOADER_ADAPTERS: AdapterDefinition[] = LOADER_DEFINITION_ENTRIES.map(
    ([, entry]) => entry.definition,
);
