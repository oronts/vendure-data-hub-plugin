/**
 * String operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const STRING_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'split',
        description: 'Split a string field into an array by delimiter.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'delimiter', label: 'Delimiter', type: 'string', required: true, description: 'Character(s) to split by' },
                { key: 'trim', label: 'Trim items', type: 'boolean', description: 'Trim whitespace from each item' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'join',
        description: 'Join an array field into a string.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'delimiter', label: 'Delimiter', type: 'string', required: true, description: 'Character(s) to join with' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'trim',
        description: 'Trim whitespace from a string field.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
                { key: 'mode', label: 'Mode', type: 'select', options: [
                    { value: 'both', label: 'Both ends' },
                    { value: 'start', label: 'Start only' },
                    { value: 'end', label: 'End only' },
                ] },
            ],
        },
    },
    {
        type: 'operator',
        code: 'lowercase',
        description: 'Convert a string field to lowercase.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'uppercase',
        description: 'Convert a string field to uppercase.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'slugify',
        description: 'Generate a URL-friendly slug from a string field.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'separator', label: 'Separator', type: 'string', description: 'Default: hyphen (-)' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'concat',
        description: 'Concatenate multiple string fields into one.',
        pure: true,
        schema: {
            fields: [
                { key: 'sources', label: 'Source field paths (JSON array)', type: 'json', required: true, description: 'Array of field paths to concatenate' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'separator', label: 'Separator', type: 'string', description: 'Optional separator between values' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'replace',
        description: 'Replace text in a string field.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
                { key: 'search', label: 'Search text', type: 'string', required: true },
                { key: 'replacement', label: 'Replacement', type: 'string', required: true },
                { key: 'all', label: 'Replace all occurrences', type: 'boolean' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'extractRegex',
        description: 'Extract a value from a string field using a regular expression pattern with capture groups.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'pattern', label: 'Regex pattern', type: 'string', required: true, description: 'Regular expression pattern (without delimiters)' },
                { key: 'group', label: 'Capture group', type: 'number', description: 'Group index to extract (0=full match, 1+=capture groups). Default: 1' },
                { key: 'flags', label: 'Regex flags', type: 'string', description: 'e.g., "i" for case-insensitive' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'replaceRegex',
        description: 'Replace values in a string field using a regular expression pattern.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
                { key: 'pattern', label: 'Regex pattern', type: 'string', required: true, description: 'Regular expression pattern (without delimiters)' },
                { key: 'replacement', label: 'Replacement', type: 'string', required: true, description: 'Replacement string (use $1, $2 for capture groups)' },
                { key: 'flags', label: 'Regex flags', type: 'string', description: 'e.g., "gi" for global case-insensitive. Default: "g"' },
            ],
        },
    },
];
