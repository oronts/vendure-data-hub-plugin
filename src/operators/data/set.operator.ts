import { AdapterDefinition, JsonObject } from '../types';
import { SetOperatorConfig } from './types';
import { applySet } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const SET_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'set',
    description: 'Set a static value at a specified path.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    summaryTemplate: 'Set field values',
    schema: {
        fields: [
            {
                key: 'path',
                label: 'Path',
                type: 'string',
                required: true,
                description: 'Dot notation path where to set the value',
            },
            {
                key: 'value',
                label: 'Value (JSON)',
                type: 'json',
                required: true,
                description: 'The value to set (any valid JSON)',
            },
        ],
    },
};

export function applySetOperator(
    record: JsonObject,
    config: SetOperatorConfig,
): JsonObject {
    if (!config.path) {
        return record;
    }
    return applySet(record, config.path, config.value);
}

/**
 * Operator that sets a static value at a specified path on each record.
 * Uses the createRecordOperator factory to reduce boilerplate.
 */
export const setOperator = createRecordOperator(applySetOperator);
