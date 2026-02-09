import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import { RenameOperatorConfig } from './types';
import { applyRename } from './helpers';

export const RENAME_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'rename',
    description: 'Rename a field from one path to another.',
    pure: true,
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

export function renameOperator(
    records: readonly JsonObject[],
    config: RenameOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record => applyRenameOperator(record, config));
    return { records: results };
}
