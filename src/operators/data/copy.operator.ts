import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { CopyOperatorConfig } from './types';
import { applyCopy } from './helpers';

export const COPY_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'copy',
    description: 'Copy a field value to another path.',
    pure: true,
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

export function copyOperator(
    records: readonly JsonObject[],
    config: CopyOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    const results = records.map(record => applyCopyOperator(record, config));
    return { records: results };
}
