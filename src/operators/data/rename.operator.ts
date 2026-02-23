import { AdapterDefinition, JsonObject } from '../types';
import { RenameOperatorConfig } from './types';
import { applyRename } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const RENAME_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'rename',
    description: 'Rename a field from one path to another.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    summaryTemplate: '${from} \u2192 ${to}',
    schema: {
        fields: [
            {
                key: 'from',
                label: 'From',
                type: 'string',
                required: true,
                description: 'Source field path',
            },
            {
                key: 'to',
                label: 'To',
                type: 'string',
                required: true,
                description: 'Target field path',
            },
        ],
    },
};

export function applyRenameOperator(
    record: JsonObject,
    config: RenameOperatorConfig,
): JsonObject {
    if (!config.from || !config.to) {
        return record;
    }
    return applyRename(record, config.from, config.to);
}

export const renameOperator = createRecordOperator(applyRenameOperator);
