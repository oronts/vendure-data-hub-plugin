import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import { SetOperatorConfig } from './types';
import { applySet } from './helpers';

export const SET_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'set',
    description: 'Set a static value at a specified path.',
    pure: true,
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

export function setOperator(
    records: readonly JsonObject[],
    config: SetOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record => applySetOperator(record, config));
    return { records: results };
}
