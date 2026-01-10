/**
 * JSON operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const JSON_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'parseJson',
        description: 'Parse a JSON string field into an object.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'stringifyJson',
        description: 'Stringify an object field to a JSON string.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
                { key: 'pretty', label: 'Pretty print', type: 'boolean' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'pick',
        description: 'Pick specific fields from a record, discarding others.',
        pure: true,
        schema: {
            fields: [
                { key: 'fields', label: 'Fields to keep (JSON array)', type: 'json', required: true, description: 'Array of field paths to keep' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'omit',
        description: 'Omit specific fields from a record.',
        pure: true,
        schema: {
            fields: [
                { key: 'fields', label: 'Fields to remove (JSON array)', type: 'json', required: true, description: 'Array of field paths to remove' },
            ],
        },
    },
];
