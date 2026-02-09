import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import {
    WhenOperatorConfig,
    IfThenElseOperatorConfig,
    SwitchOperatorConfig,
    DeltaFilterOperatorConfig,
} from './types';
import {
    filterRecords,
    applyIfThenElse,
    applySwitch,
    calculateRecordHash,
} from './helpers';
import { getNestedValue } from '../helpers';

export const WHEN_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'when',
    description: 'Filter records by conditions. Action: keep or drop.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'conditions',
                label: 'Conditions (JSON array)',
                type: 'json',
                required: true,
                description: 'e.g. [{ field: "price", cmp: "gt", value: 0 }]',
            },
            {
                key: 'action',
                label: 'Action',
                type: 'select',
                required: true,
                options: [
                    { value: 'keep', label: 'Keep matches' },
                    { value: 'drop', label: 'Drop matches' },
                ],
            },
        ],
    },
};

export const IF_THEN_ELSE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'ifThenElse',
    description: 'Set a value based on a condition.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'condition',
                label: 'Condition (JSON)',
                type: 'json',
                required: true,
                description: 'e.g. { field: "type", cmp: "eq", value: "digital" }',
            },
            { key: 'thenValue', label: 'Then value (JSON)', type: 'json', required: true },
            { key: 'elseValue', label: 'Else value (JSON)', type: 'json' },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const SWITCH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'switch',
    description: 'Set a value based on multiple conditions (like a switch statement).',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            {
                key: 'cases',
                label: 'Cases (JSON)',
                type: 'json',
                required: true,
                description: 'Array of { value, result } objects',
            },
            { key: 'default', label: 'Default value (JSON)', type: 'json' },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
        ],
    },
};

export const DELTA_FILTER_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'deltaFilter',
    description: 'Filter out unchanged records using a stable hash stored in checkpoint. Keeps only changed/new based on idPath.',
    pure: true,
    schema: {
        fields: [
            { key: 'idPath', label: 'ID field path', type: 'string', required: true },
            {
                key: 'includePaths',
                label: 'Include paths (JSON array)',
                type: 'json',
                description: 'Subset of fields to hash; default is entire record',
            },
            {
                key: 'excludePaths',
                label: 'Exclude paths (JSON array)',
                type: 'json',
                description: 'Fields to ignore when hashing',
            },
        ],
    },
};

export function whenOperator(
    records: readonly JsonObject[],
    config: WhenOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.conditions || !Array.isArray(config.conditions)) {
        return { records: [...records] };
    }

    const filtered = filterRecords(records, config.conditions, config.action);
    return {
        records: filtered,
        dropped: records.length - filtered.length,
    };
}

export function ifThenElseOperator(
    records: readonly JsonObject[],
    config: IfThenElseOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.condition || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyIfThenElse(
            record,
            config.condition,
            config.thenValue,
            config.elseValue,
            config.target,
        ),
    );
    return { records: results };
}

export function switchOperator(
    records: readonly JsonObject[],
    config: SwitchOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.cases || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applySwitch(
            record,
            config.source,
            config.cases,
            config.default,
            config.target,
        ),
    );
    return { records: results };
}

export function deltaFilterOperator(
    records: readonly JsonObject[],
    config: DeltaFilterOperatorConfig,
    _helpers: OperatorHelpers,
    checkpoint?: Map<string, string>,
): OperatorResult {
    if (!config.idPath) {
        return { records: [...records] };
    }

    // If no checkpoint provided, pass all records
    if (!checkpoint) {
        return { records: [...records] };
    }

    const newCheckpoint = new Map<string, string>();
    const changedRecords: JsonObject[] = [];

    for (const record of records) {
        const id = getNestedValue(record, config.idPath);
        if (id === undefined || id === null) {
            // Records without ID always pass through
            changedRecords.push(record);
            continue;
        }

        const idStr = String(id);
        const currentHash = calculateRecordHash(
            record,
            config.includePaths,
            config.excludePaths,
        );

        const previousHash = checkpoint.get(idStr);
        newCheckpoint.set(idStr, currentHash);

        if (previousHash !== currentHash) {
            changedRecords.push(record);
        }
    }

    return {
        records: changedRecords,
        dropped: records.length - changedRecords.length,
        meta: { checkpoint: Object.fromEntries(newCheckpoint) },
    };
}

