/**
 * Numeric operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const NUMERIC_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'math',
        description: 'Perform math operations on numeric fields.',
        pure: true,
        schema: {
            fields: [
                { key: 'operation', label: 'Operation', type: 'select', required: true, options: [
                    { value: 'add', label: 'Add' },
                    { value: 'subtract', label: 'Subtract' },
                    { value: 'multiply', label: 'Multiply' },
                    { value: 'divide', label: 'Divide' },
                    { value: 'modulo', label: 'Modulo' },
                    { value: 'power', label: 'Power' },
                    { value: 'round', label: 'Round' },
                    { value: 'floor', label: 'Floor' },
                    { value: 'ceil', label: 'Ceil' },
                    { value: 'abs', label: 'Absolute' },
                ] },
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'operand', label: 'Operand (value or path)', type: 'string', description: 'Number or path starting with $' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'decimals', label: 'Decimal places', type: 'number' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'toNumber',
        description: 'Convert a string field to a number.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string' },
                { key: 'default', label: 'Default value', type: 'number', description: 'Value if conversion fails' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'toString',
        description: 'Convert a value to a string.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'parseNumber',
        description: 'Parse a string to a number with locale-aware decimal/thousand separator handling.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source path' },
                { key: 'locale', label: 'Locale', type: 'string', description: 'e.g., "en-US", "de-DE", "fr-FR"' },
                { key: 'default', label: 'Default value', type: 'number', description: 'Value if parsing fails' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'formatNumber',
        description: 'Format a number as a localized string with optional currency or percent formatting.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'locale', label: 'Locale', type: 'string', description: 'e.g., "en-US", "de-DE". Default: "en-US"' },
                { key: 'decimals', label: 'Decimal places', type: 'number' },
                { key: 'style', label: 'Format style', type: 'select', options: [
                    { value: 'decimal', label: 'Decimal' },
                    { value: 'currency', label: 'Currency' },
                    { value: 'percent', label: 'Percent' },
                ] },
                { key: 'currency', label: 'Currency code', type: 'string', description: 'e.g., "USD", "EUR" (required for currency style)' },
                { key: 'useGrouping', label: 'Use thousand separators', type: 'boolean' },
            ],
        },
    },
];
