import { AdapterDefinition, JsonObject } from '../types';
import { CopyOperatorConfig } from './types';
import { applyCopy } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const COPY_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'copy',
    description: 'Copy a field value to another path.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    summaryTemplate: '${from} \u2192 ${to}',
    schema: {
        fields: [
            {
                key: 'source',
                label: 'Source field path',
                type: 'string',
                required: true,
                description: 'Source field path',
            },
            {
                key: 'target',
                label: 'Target field path',
                type: 'string',
                required: true,
                description: 'Target field path',
            },
        ],
    },
};

export function applyCopyOperator(
    record: JsonObject,
    config: CopyOperatorConfig,
): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyCopy(record, config.source, config.target);
}

export const copyOperator = createRecordOperator(applyCopyOperator);
