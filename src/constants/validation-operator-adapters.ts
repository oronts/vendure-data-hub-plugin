/**
 * Validation operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const VALIDATION_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'validateRequired',
        description: 'Mark records as invalid if required fields are missing.',
        pure: true,
        schema: {
            fields: [
                { key: 'fields', label: 'Required fields (JSON array)', type: 'json', required: true },
                { key: 'errorField', label: 'Error output field', type: 'string', description: 'Field to store validation errors' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'validateFormat',
        description: 'Validate field format using regex.',
        pure: true,
        schema: {
            fields: [
                { key: 'field', label: 'Field path', type: 'string', required: true },
                { key: 'pattern', label: 'Regex pattern', type: 'string', required: true },
                { key: 'errorField', label: 'Error output field', type: 'string' },
                { key: 'errorMessage', label: 'Error message', type: 'string' },
            ],
        },
    },
];
