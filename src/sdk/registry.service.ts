import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
    AdapterDefinition,
    BatchExtractorAdapter,
    DataHubAdapter,
    ExtractorAdapter,
} from './types';
import { AdapterType } from '../constants/enums';
import {
    validateAdapterLifecycleMetadata,
    validateBatchExtractorPreview,
} from './adapter-metadata';
import { withBuiltInAdapterVersion } from './adapter-version';

const MAX_REGISTRY_SIZE = 1000;
const MAX_ADAPTER_CODE_LENGTH = 100;
const VALID_ADAPTER_TYPES = new Set(Object.values(AdapterType));

function validateAdapterCode(code: string): void {
    if (!code) {
        throw new Error('Adapter code must be a non-empty string');
    }
    if (code.trim() !== code) {
        throw new Error('Adapter code must not have leading or trailing whitespace');
    }
    if (code.length > MAX_ADAPTER_CODE_LENGTH) {
        throw new Error(
            `Adapter code must not exceed ${MAX_ADAPTER_CODE_LENGTH} characters`,
        );
    }
}

function validateAdapterType(type: string): void {
    if (!type) {
        throw new Error('Adapter type must be a non-empty string');
    }
    if (!VALID_ADAPTER_TYPES.has(type as AdapterType)) {
        throw new Error(
            `Invalid adapter type: ${type}. Must be one of: ${[...VALID_ADAPTER_TYPES].join(', ')}`,
        );
    }
}

function isBuiltInDefinition(adapter: AdapterDefinition): boolean {
    return adapter.builtIn === true;
}

const RUNTIME_METADATA_FIELDS = [
    'name',
    'description',
    'category',
    'schema',
    'pure',
    'async',
    'batchable',
    'requires',
    'icon',
    'color',
    'version',
    'apiVersion',
    'deprecated',
    'deprecatedMessage',
    'experimental',
    'experimentalMessage',
    'entityType',
    'formatType',
    'patchableFields',
    'editorType',
    'summaryTemplate',
    'categoryLabel',
    'categoryOrder',
    'fieldTransform',
] as const satisfies readonly (keyof AdapterDefinition)[];

function assertRuntimeMetadataMatches(
    key: string,
    definition: AdapterDefinition,
    runtime: DataHubAdapter,
    runtimeBuiltIn: boolean,
): void {
    const definitionBuiltIn = definition.builtIn === true;
    if (definitionBuiltIn !== runtimeBuiltIn) {
        throw new Error(
            `Runtime adapter origin does not match registered definition: ${key}`,
        );
    }
    for (const field of RUNTIME_METADATA_FIELDS) {
        if (!isDeepStrictEqual(definition[field], runtime[field])) {
            throw new Error(
                `Runtime adapter metadata does not match registered definition for ${key}: ${field}`,
            );
        }
    }
}

function isStreamingExtractorAdapter(
    adapter: DataHubAdapter,
): adapter is ExtractorAdapter<unknown> {
    return adapter.type === AdapterType.EXTRACTOR &&
        typeof (adapter as ExtractorAdapter<unknown>).extract === 'function';
}

function isBatchExtractorAdapter(
    adapter: DataHubAdapter,
): adapter is BatchExtractorAdapter<unknown> {
    return adapter.type === AdapterType.EXTRACTOR &&
        typeof (adapter as BatchExtractorAdapter<unknown>).extractAll === 'function';
}

const REQUIRED_RUNTIME_METHODS: Partial<Record<AdapterType, readonly string[]>> = {
    [AdapterType.EXTRACTOR]: ['extract', 'extractAll'],
    [AdapterType.OPERATOR]: ['apply', 'applyOne'],
    [AdapterType.LOADER]: ['load'],
    [AdapterType.VALIDATOR]: ['validate'],
    [AdapterType.ENRICHER]: ['enrich'],
    [AdapterType.EXPORTER]: ['export'],
    [AdapterType.FEED]: ['generateFeed'],
    [AdapterType.SINK]: ['index'],
};

function validateRuntimeContract(adapter: DataHubAdapter): void {
    const methodNames = REQUIRED_RUNTIME_METHODS[adapter.type as AdapterType];
    if (!methodNames) return;

    const value = adapter as unknown as Record<string, unknown>;
    if (methodNames.some(methodName => typeof value[methodName] === 'function')) return;

    const contract = methodNames.map(methodName => methodName + '()').join(' or ');
    throw new Error(
        'Runtime ' + adapter.type + ' adapter "' + String(value.code) +
        '" must implement ' + contract,
    );
}

@Injectable()
export class DataHubRegistryService {
    private definitions = new Map<string, AdapterDefinition>();
    private runtimeAdapters = new Map<string, DataHubAdapter>();

    register(adapter: AdapterDefinition, options?: { builtIn?: boolean }): void {
        if (!adapter) {
            throw new Error('Adapter definition is required');
        }
        validateAdapterType(adapter.type);
        validateAdapterCode(adapter.code);
        const builtIn = options?.builtIn === true;
        const prepared = builtIn ? withBuiltInAdapterVersion(adapter) : adapter;
        validateAdapterLifecycleMetadata(prepared, {
            requireVersion: options?.builtIn !== undefined,
        });

        const key = `${prepared.type}:${prepared.code}`;
        if (this.definitions.has(key)) {
            throw new Error(`Adapter already registered: ${key}`);
        }
        if (this.definitions.size >= MAX_REGISTRY_SIZE) {
            throw new Error(
                `Adapter registry is full (max ${MAX_REGISTRY_SIZE}). Unregister an adapter first.`,
            );
        }
        const stamped = options?.builtIn !== undefined
            ? { ...prepared, builtIn: options.builtIn }
            : prepared;
        this.definitions.set(key, stamped);
    }

    registerRuntime(adapter: DataHubAdapter, options?: { builtIn?: boolean }): void {
        if (!adapter) {
            throw new Error('Runtime adapter is required');
        }
        validateAdapterType(adapter.type);
        validateAdapterCode(adapter.code);
        validateRuntimeContract(adapter);
        if (adapter.type === AdapterType.EXTRACTOR) {
            validateBatchExtractorPreview(adapter);
        }
        const builtIn = options?.builtIn === true;
        const prepared = builtIn ? withBuiltInAdapterVersion(adapter) : adapter;
        validateAdapterLifecycleMetadata(prepared, { requireVersion: true });

        const key = `${adapter.type}:${adapter.code}`;
        const existingDefinition = this.definitions.get(key);
        if (this.runtimeAdapters.has(key)) {
            throw new Error(`Runtime adapter already registered: ${key}`);
        }
        if (
            existingDefinition &&
            isBuiltInDefinition(existingDefinition) &&
            options?.builtIn !== true
        ) {
            throw new Error(`Custom runtime cannot override built-in adapter: ${key}`);
        }
        if (existingDefinition) {
            assertRuntimeMetadataMatches(
                key,
                existingDefinition,
                prepared as DataHubAdapter,
                options?.builtIn === true,
            );
        }

        const isNewDefinition = existingDefinition === undefined;
        if (this.runtimeAdapters.size >= MAX_REGISTRY_SIZE) {
            throw new Error(
                `Runtime adapter registry is full (max ${MAX_REGISTRY_SIZE}). Unregister an adapter first.`,
            );
        }
        if (isNewDefinition && this.definitions.size >= MAX_REGISTRY_SIZE) {
            throw new Error(
                `Adapter definition registry is full (max ${MAX_REGISTRY_SIZE}). Unregister an adapter first.`,
            );
        }

        this.runtimeAdapters.set(key, adapter);
        if (isNewDefinition) {
            const stamped = options?.builtIn !== undefined
                ? { ...prepared, builtIn: options.builtIn }
                : prepared;
            this.definitions.set(key, stamped);
        }
    }

    list(): AdapterDefinition[] {
        return Array.from(this.definitions.values());
    }

    find(type: string, code: string): AdapterDefinition | undefined {
        return this.definitions.get(`${type}:${code}`);
    }

    getRuntime(type: string, code: string): DataHubAdapter | undefined {
        return this.runtimeAdapters.get(`${type}:${code}`);
    }

    getExtractorRuntime(
        code: string,
    ): ExtractorAdapter<unknown> | BatchExtractorAdapter<unknown> | undefined {
        const adapter = this.getRuntime(AdapterType.EXTRACTOR, code);
        if (
            adapter &&
            (isStreamingExtractorAdapter(adapter) || isBatchExtractorAdapter(adapter))
        ) {
            return adapter;
        }
        return undefined;
    }
}
