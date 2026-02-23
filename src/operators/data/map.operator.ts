import { AdapterDefinition, JsonObject } from '../types';
import { MapOperatorConfig } from './types';
import { applyMapping } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const MAP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'map',
    description: 'Transform records via field mapping. Provide a JSON object of dst -> src dot-paths.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    editorType: 'map',
    schema: {
        fields: [
            {
                key: 'mapping',
                label: 'Field mapping',
                type: 'json',
                required: true,
                description: 'JSON object defining field mapping (target: source)',
            },
            {
                key: 'passthrough',
                label: 'Include unmapped fields',
                type: 'boolean',
                description: 'If true, include fields not in mapping',
            },
        ],
    },
};

export function applyMapOperator(
    record: JsonObject,
    config: MapOperatorConfig,
): JsonObject {
    if (!config.mapping || typeof config.mapping !== 'object') {
        return record;
    }
    return applyMapping(record, config.mapping, config.passthrough);
}

export const mapOperator = createRecordOperator(applyMapOperator);
