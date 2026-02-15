import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import {
    ParseJsonOperatorConfig,
    StringifyJsonOperatorConfig,
    PickOperatorConfig,
    OmitOperatorConfig,
} from './types';
import {
    applyParseJson,
    applyStringifyJson,
    applyPick,
    applyOmit,
} from './helpers';

export const PARSE_JSON_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'parseJson',
    description: 'Parse a JSON string field into an object.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
        ],
    },
};

export const STRINGIFY_JSON_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'stringifyJson',
    description: 'Stringify an object field to a JSON string.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
            { key: 'pretty', label: 'Pretty print', type: 'boolean' },
        ],
    },
};

export const PICK_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'pick',
    description: 'Pick specific fields from a record, discarding others.',
    pure: true,
    schema: {
        fields: [
            { key: 'fields', label: 'Fields to keep (JSON array)', type: 'json', required: true, description: 'Array of field paths to keep' },
        ],
    },
};

export const OMIT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'omit',
    description: 'Omit specific fields from a record.',
    pure: true,
    schema: {
        fields: [
            { key: 'fields', label: 'Fields to remove (JSON array)', type: 'json', required: true, description: 'Array of field paths to remove' },
        ],
    },
};

export function parseJsonOperator(
    records: readonly JsonObject[],
    config: ParseJsonOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyParseJson(record, config.source, config.target),
    );
    return { records: results };
}

export function stringifyJsonOperator(
    records: readonly JsonObject[],
    config: StringifyJsonOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyStringifyJson(record, config.source, config.target, config.pretty),
    );
    return { records: results };
}

export function pickOperator(
    records: readonly JsonObject[],
    config: PickOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.fields || !Array.isArray(config.fields)) {
        return { records: [...records] };
    }

    const results = records.map(record => applyPick(record, config.fields));
    return { records: results };
}

export function omitOperator(
    records: readonly JsonObject[],
    config: OmitOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.fields || !Array.isArray(config.fields)) {
        return { records: [...records] };
    }

    const results = records.map(record => applyOmit(record, config.fields));
    return { records: results };
}
