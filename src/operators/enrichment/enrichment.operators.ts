import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import {
    LookupOperatorConfig,
    EnrichOperatorConfig,
    CoalesceOperatorConfig,
    DefaultOperatorConfig,
} from './types';
import {
    applyLookup,
    applyEnrich,
    applyCoalesce,
    applyDefault,
} from './helpers';

export const LOOKUP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'lookup',
    description: 'Lookup value from a map and set to target field.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'map', label: 'Map (JSON object)', type: 'json', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'default', label: 'Default value', type: 'string' },
        ],
    },
};

export const ENRICH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'enrich',
    description: 'Enrich or default fields on records. "set" overwrites, "defaults" only applies to missing fields.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'set',
                label: 'Set fields (JSON)',
                type: 'json',
                description: 'JSON object of fields to set (dot paths allowed)',
            },
            {
                key: 'defaults',
                label: 'Default fields (JSON)',
                type: 'json',
                description: 'JSON object of fields to set if currently missing (dot paths allowed)',
            },
        ],
    },
};

export const COALESCE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'coalesce',
    description: 'Return the first non-null value from a list of field paths.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'paths',
                label: 'Field paths (JSON array)',
                type: 'json',
                required: true,
                description: 'Array of paths to check in order',
            },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'default', label: 'Default value', type: 'json', description: 'Value if all paths are null' },
        ],
    },
};

export const DEFAULT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'default',
    description: 'Set a default value if field is null or undefined.',
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            { key: 'value', label: 'Default value (JSON)', type: 'json', required: true },
        ],
    },
};

export function lookupOperator(
    records: readonly JsonObject[],
    config: LookupOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.map || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyLookup(record, config.source, config.map, config.target, config.default),
    );
    return { records: results };
}

export function enrichOperator(
    records: readonly JsonObject[],
    config: EnrichOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyEnrich(record, config.set, config.defaults),
    );
    return { records: results };
}

export function coalesceOperator(
    records: readonly JsonObject[],
    config: CoalesceOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.paths || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyCoalesce(record, config.paths, config.target, config.default),
    );
    return { records: results };
}

export function defaultOperator(
    records: readonly JsonObject[],
    config: DefaultOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.path) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDefault(record, config.path, config.value),
    );
    return { records: results };
}
