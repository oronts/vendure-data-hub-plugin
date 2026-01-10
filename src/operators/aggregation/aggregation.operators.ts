import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import {
    AggregateOperatorConfig,
    CountOperatorConfig,
    UniqueOperatorConfig,
    FlattenOperatorConfig,
    FirstLastOperatorConfig,
    ExpandOperatorConfig,
} from './types';
import {
    applyAggregate,
    applyCount,
    applyUnique,
    applyFlatten,
    applyFirst,
    applyLast,
    applyExpand,
} from './helpers';

export const AGGREGATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'aggregate',
    description: 'Compute a simple aggregate over records and set a field on each record.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'op',
                label: 'Operation',
                type: 'select',
                required: true,
                options: [
                    { value: 'count', label: 'count' },
                    { value: 'sum', label: 'sum' },
                    { value: 'avg', label: 'avg' },
                    { value: 'min', label: 'min' },
                    { value: 'max', label: 'max' },
                ],
            },
            { key: 'source', label: 'Source field path (for sum/min/max)', type: 'string' },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const COUNT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'count',
    description: 'Count elements in an array or characters in a string.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const UNIQUE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'unique',
    description: 'Remove duplicate values from an array field.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string' },
            { key: 'by', label: 'Unique by key (for objects)', type: 'string', description: 'Object key to use for uniqueness' },
        ],
    },
};

export const FLATTEN_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'flatten',
    description: 'Flatten a nested array into a single-level array.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source path if not set' },
            { key: 'depth', label: 'Depth', type: 'number', description: 'How deep to flatten (default: 1)' },
        ],
    },
};

export const FIRST_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'first',
    description: 'Get the first element of an array.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source array path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const LAST_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'last',
    description: 'Get the last element of an array.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source array path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const EXPAND_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'expand',
    description: 'Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance.',
    pure: false, // Creates multiple records from one, so not pure
    schema: {
        fields: [
            { key: 'path', label: 'Array field path', type: 'string', required: true, description: 'Path to the array to expand (e.g., "variants" or "lines")' },
            { key: 'mergeParent', label: 'Merge parent fields', type: 'boolean', description: 'Include all parent fields in expanded records' },
            { key: 'parentFields', label: 'Parent fields map', type: 'json', description: 'Map of target field names to source paths (e.g., {"productId": "id", "productName": "name"})' },
        ],
    },
};

export function aggregateOperator(
    records: readonly JsonObject[],
    config: AggregateOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.op || !config.target) {
        return { records: [...records] };
    }

    const results = applyAggregate(records, config.op, config.source, config.target);
    return { records: results };
}

export function countOperator(
    records: readonly JsonObject[],
    config: CountOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyCount(record, config.source, config.target),
    );
    return { records: results };
}

export function uniqueOperator(
    records: readonly JsonObject[],
    config: UniqueOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyUnique(record, config.source, config.target, config.by),
    );
    return { records: results };
}

export function flattenOperator(
    records: readonly JsonObject[],
    config: FlattenOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyFlatten(record, config.source, config.target, config.depth),
    );
    return { records: results };
}

export function firstOperator(
    records: readonly JsonObject[],
    config: FirstLastOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyFirst(record, config.source, config.target),
    );
    return { records: results };
}

export function lastOperator(
    records: readonly JsonObject[],
    config: FirstLastOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyLast(record, config.source, config.target),
    );
    return { records: results };
}

export function expandOperator(
    records: readonly JsonObject[],
    config: ExpandOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.path) {
        return { records: [...records] };
    }

    const results: JsonObject[] = [];
    for (const record of records) {
        const expanded = applyExpand(
            record,
            config.path,
            config.mergeParent ?? false,
            config.parentFields,
        );
        results.push(...expanded);
    }
    return { records: results };
}
