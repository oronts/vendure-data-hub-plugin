import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
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
import { createRecordOperator } from '../operator-factory';

export const AGGREGATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'aggregate',
    description: 'Compute a simple aggregate over records and set a field on each record.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
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
    type: 'OPERATOR',
    code: 'count',
    description: 'Count elements in an array or characters in a string.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const UNIQUE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'unique',
    description: 'Remove duplicate values from an array field.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
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
    type: 'OPERATOR',
    code: 'flatten',
    description: 'Flatten a nested array into a single-level array.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
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
    type: 'OPERATOR',
    code: 'first',
    description: 'Get the first element of an array.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source array path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const LAST_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'last',
    description: 'Get the last element of an array.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source array path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const EXPAND_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'expand',
    description: 'Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
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
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.op || !config.target) {
        return { records: [...records] };
    }

    const results = applyAggregate(records, config.op, config.source, config.target);
    return { records: results };
}

export function applyCountOperator(record: JsonObject, config: CountOperatorConfig): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyCount(record, config.source, config.target);
}

export const countOperator = createRecordOperator(applyCountOperator);

export function applyUniqueOperator(record: JsonObject, config: UniqueOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyUnique(record, config.source, config.target, config.by);
}

export const uniqueOperator = createRecordOperator(applyUniqueOperator);

export function applyFlattenOperator(record: JsonObject, config: FlattenOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyFlatten(record, config.source, config.target, config.depth);
}

export const flattenOperator = createRecordOperator(applyFlattenOperator);

export function applyFirstOperator(record: JsonObject, config: FirstLastOperatorConfig): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyFirst(record, config.source, config.target);
}

export const firstOperator = createRecordOperator(applyFirstOperator);

export function applyLastOperator(record: JsonObject, config: FirstLastOperatorConfig): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyLast(record, config.source, config.target);
}

export const lastOperator = createRecordOperator(applyLastOperator);

export function expandOperator(
    records: readonly JsonObject[],
    config: ExpandOperatorConfig,
    _helpers: AdapterOperatorHelpers,
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
