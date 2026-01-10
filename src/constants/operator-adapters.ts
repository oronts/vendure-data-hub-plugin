/**
 * Operator adapter definitions - Data transformation operators
 */
import { AdapterDefinition } from '../sdk/types';

export const OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'deltaFilter',
        description: 'Filter out unchanged records using a stable hash stored in checkpoint. Keeps only changed/new based on idPath.',
        pure: true,
        schema: {
            fields: [
                { key: 'idPath', label: 'ID field path', type: 'string', required: true },
                { key: 'includePaths', label: 'Include paths (JSON array)', type: 'json', description: 'Subset of fields to hash; default is entire record' },
                { key: 'excludePaths', label: 'Exclude paths (JSON array)', type: 'json', description: 'Fields to ignore when hashing' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'map',
        description: 'Transform records via field mapping. Provide a JSON object of dst→src dot-paths.',
        pure: true,
        schema: {
            fields: [
                { key: 'mapping', label: 'Field mapping', type: 'json', required: true, description: 'JSON object defining field mapping' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'enrich',
        description: 'Enrich or default fields on records. "set" overwrites, "defaults" only applies to missing fields.',
        pure: true,
        schema: {
            fields: [
                { key: 'set', label: 'Set fields (JSON)', type: 'json', description: 'JSON object of fields to set (dot paths allowed)' },
                { key: 'defaults', label: 'Default fields (JSON)', type: 'json', description: 'JSON object of fields to set if currently missing (dot paths allowed)' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'when',
        description: 'Filter records by conditions. Action keep or drop.',
        pure: true,
        schema: {
            fields: [
                { key: 'conditions', label: 'Conditions (JSON array)', type: 'json', required: true, description: 'e.g. [{ field: "price", cmp: "gt", value: 0 }]' },
                { key: 'action', label: 'Action', type: 'select', required: true, options: [
                    { value: 'keep', label: 'Keep matches' },
                    { value: 'drop', label: 'Drop matches' },
                ] },
            ],
        },
    },
    {
        type: 'operator',
        code: 'template',
        description: 'Render a string template and set it at target path.',
        pure: true,
        schema: {
            fields: [
                { key: 'template', label: 'Template', type: 'string', required: true, description: 'Use ${path.to.field} to substitute' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'missingAsEmpty', label: 'Missing as empty', type: 'boolean' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'set',
        description: 'Set a static value at path.',
        pure: true,
        schema: { fields: [
            { key: 'path', label: 'Path', type: 'string', required: true },
            { key: 'value', label: 'Value (JSON)', type: 'json', required: true },
        ] },
    },
    {
        type: 'operator',
        code: 'remove',
        description: 'Remove a field at path.',
        pure: true,
        schema: { fields: [
            { key: 'path', label: 'Path', type: 'string', required: true },
        ] },
    },
    {
        type: 'operator',
        code: 'rename',
        description: 'Rename a field from → to.',
        pure: true,
        schema: { fields: [
            { key: 'from', label: 'From', type: 'string', required: true },
            { key: 'to', label: 'To', type: 'string', required: true },
        ] },
    },
    {
        type: 'operator',
        code: 'lookup',
        description: 'Lookup value from a map and set to target field.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'map', label: 'Map (JSON object)', type: 'json', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'default', label: 'Default value', type: 'string' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'currency',
        description: 'Convert floats to minor units or re-map currency fields.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'decimals', label: 'Decimals (e.g. 2)', type: 'number', required: true },
                { key: 'round', label: 'Rounding', type: 'select', options: [
                    { value: 'round', label: 'round' },
                    { value: 'floor', label: 'floor' },
                    { value: 'ceil', label: 'ceil' },
                ] },
            ],
        },
    },
    {
        type: 'operator',
        code: 'unit',
        description: 'Convert units (e.g. g<->kg, cm<->m)',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'from', label: 'From unit', type: 'select', required: true, options: [
                    { value: 'g', label: 'g' },
                    { value: 'kg', label: 'kg' },
                    { value: 'cm', label: 'cm' },
                    { value: 'm', label: 'm' },
                ] },
                { key: 'to', label: 'To unit', type: 'select', required: true, options: [
                    { value: 'g', label: 'g' },
                    { value: 'kg', label: 'kg' },
                    { value: 'cm', label: 'cm' },
                    { value: 'm', label: 'm' },
                ] },
            ],
        },
    },
    {
        type: 'operator',
        code: 'aggregate',
        description: 'Compute a simple aggregate over records and set a field on each record.',
        pure: true,
        schema: {
            fields: [
                { key: 'op', label: 'Operation', type: 'select', required: true, options: [
                    { value: 'count', label: 'count' },
                    { value: 'sum', label: 'sum' },
                ] },
                { key: 'source', label: 'Source field path (for sum)', type: 'string' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
];
