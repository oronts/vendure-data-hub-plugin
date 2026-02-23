import { AdapterDefinition, JsonObject } from '../types';
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
import { createRecordOperator } from '../operator-factory';

export const PARSE_JSON_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'parseJson',
    description: 'Parse a JSON string field into an object.',
    category: 'JSON',
    categoryLabel: 'JSON',
    categoryOrder: 4,
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
    category: 'JSON',
    categoryLabel: 'JSON',
    categoryOrder: 4,
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
    category: 'JSON',
    categoryLabel: 'JSON',
    categoryOrder: 4,
    pure: true,
    summaryTemplate: 'Keep selected fields',
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
    category: 'JSON',
    categoryLabel: 'JSON',
    categoryOrder: 4,
    pure: true,
    schema: {
        fields: [
            { key: 'fields', label: 'Fields to remove (JSON array)', type: 'json', required: true, description: 'Array of field paths to remove' },
        ],
    },
};

export function applyParseJsonOperator(record: JsonObject, config: ParseJsonOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyParseJson(record, config.source, config.target);
}

export const parseJsonOperator = createRecordOperator(applyParseJsonOperator);

export function applyStringifyJsonOperator(record: JsonObject, config: StringifyJsonOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyStringifyJson(record, config.source, config.target, config.pretty);
}

export const stringifyJsonOperator = createRecordOperator(applyStringifyJsonOperator);

export function applyPickOperator(record: JsonObject, config: PickOperatorConfig): JsonObject {
    if (!config.fields || !Array.isArray(config.fields)) {
        return record;
    }
    return applyPick(record, config.fields);
}

export const pickOperator = createRecordOperator(applyPickOperator);

export function applyOmitOperator(record: JsonObject, config: OmitOperatorConfig): JsonObject {
    if (!config.fields || !Array.isArray(config.fields)) {
        return record;
    }
    return applyOmit(record, config.fields);
}

export const omitOperator = createRecordOperator(applyOmitOperator);
