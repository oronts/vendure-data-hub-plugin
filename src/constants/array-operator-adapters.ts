/**
 * Array operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const ARRAY_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'flatten',
        description: 'Flatten a nested array into a single-level array.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source path if not set' },
                { key: 'depth', label: 'Depth', type: 'number', description: 'How deep to flatten (default: 1)' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'unique',
        description: 'Remove duplicate values from an array field.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string' },
                { key: 'by', label: 'Unique by key (for objects)', type: 'string', description: 'Object key to use for uniqueness' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'first',
        description: 'Get the first element of an array.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source array path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'last',
        description: 'Get the last element of an array.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source array path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'count',
        description: 'Count elements in an array or characters in a string.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'expand',
        description: 'Expand an array field into multiple records. Each element becomes a separate record with optional parent field inheritance.',
        pure: false,
        schema: {
            fields: [
                { key: 'path', label: 'Array field path', type: 'string', required: true, description: 'Path to the array to expand (e.g., "variants" or "lines")' },
                { key: 'mergeParent', label: 'Merge parent fields', type: 'boolean', description: 'Include all parent fields in expanded records' },
                { key: 'parentFields', label: 'Parent fields map', type: 'json', description: 'Map of target field names to source paths (e.g., {"productId": "id"})' },
            ],
        },
    },
];
