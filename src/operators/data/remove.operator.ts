import { AdapterDefinition, JsonObject } from '../types';
import { RemoveOperatorConfig } from './types';
import { applyRemove } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const REMOVE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'remove',
    description: 'Remove a field at a specified path.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    summaryTemplate: 'Remove fields',
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

export const removeOperator = createRecordOperator(applyRemoveOperator);
