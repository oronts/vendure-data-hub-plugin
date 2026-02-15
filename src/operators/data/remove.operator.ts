import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { RemoveOperatorConfig } from './types';
import { applyRemove } from './helpers';

export const REMOVE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'remove',
    description: 'Remove a field at a specified path.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'path',
                label: 'Path',
                type: 'string',
                required: true,
                description: 'Dot notation path of the field to remove',
            },
        ],
    },
};

export function applyRemoveOperator(
    record: JsonObject,
    config: RemoveOperatorConfig,
): JsonObject {
    if (!config.path) {
        return record;
    }
    return applyRemove(record, config.path);
}

export function removeOperator(
    records: readonly JsonObject[],
    config: RemoveOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    const results = records.map(record => applyRemoveOperator(record, config));
    return { records: results };
}
