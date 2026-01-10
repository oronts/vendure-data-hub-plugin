/**
 * Conditional operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const CONDITIONAL_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'ifThenElse',
        description: 'Set a value based on a condition.',
        pure: true,
        schema: {
            fields: [
                { key: 'condition', label: 'Condition (JSON)', type: 'json', required: true, description: 'e.g. { field: "type", cmp: "eq", value: "digital" }' },
                { key: 'thenValue', label: 'Then value (JSON)', type: 'json', required: true },
                { key: 'elseValue', label: 'Else value (JSON)', type: 'json' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'switch',
        description: 'Set a value based on multiple conditions (like a switch statement).',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'cases', label: 'Cases (JSON)', type: 'json', required: true, description: 'Array of { value, result } objects' },
                { key: 'default', label: 'Default value (JSON)', type: 'json' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
];
