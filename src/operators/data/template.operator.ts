import { AdapterDefinition, JsonObject } from '../types';
import { TemplateOperatorConfig } from './types';
import { applyTemplate } from './helpers';
import { createRecordOperator } from '../operator-factory';

export const TEMPLATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'template',
    description: 'Render a string template and set it at target path.',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
    pure: true,
    editorType: 'template',
    schema: {
        fields: [
            {
                key: 'template',
                label: 'Template',
                type: 'string',
                required: true,
                description: 'Use ${path.to.field} to substitute values',
            },
            {
                key: 'target',
                label: 'Target field path',
                type: 'string',
                required: true,
                description: 'Where to store the result',
            },
            {
                key: 'missingAsEmpty',
                label: 'Missing as empty',
                type: 'boolean',
                description: 'Treat missing fields as empty strings',
            },
        ],
    },
};

export function applyTemplateOperator(
    record: JsonObject,
    config: TemplateOperatorConfig,
): JsonObject {
    if (!config.template || !config.target) {
        return record;
    }
    return applyTemplate(record, config);
}

export const templateOperator = createRecordOperator(applyTemplateOperator);
