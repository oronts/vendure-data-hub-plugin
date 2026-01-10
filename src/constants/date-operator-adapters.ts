/**
 * Date operator adapter definitions
 */
import { AdapterDefinition } from '../sdk/types';

export const DATE_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'dateFormat',
        description: 'Format a date field to a string.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'format', label: 'Output format', type: 'string', required: true, description: 'e.g. YYYY-MM-DD, DD/MM/YYYY HH:mm' },
                { key: 'inputFormat', label: 'Input format', type: 'string', description: 'If source is string, specify its format' },
                { key: 'timezone', label: 'Timezone', type: 'string', description: 'e.g. UTC, Europe/London' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'dateParse',
        description: 'Parse a string to a date.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'format', label: 'Input format', type: 'string', required: true, description: 'Format of the source string' },
                { key: 'timezone', label: 'Timezone', type: 'string' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'dateAdd',
        description: 'Add or subtract time from a date.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'amount', label: 'Amount', type: 'number', required: true, description: 'Positive to add, negative to subtract' },
                { key: 'unit', label: 'Unit', type: 'select', required: true, options: [
                    { value: 'seconds', label: 'Seconds' },
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months' },
                    { value: 'years', label: 'Years' },
                ] },
            ],
        },
    },
    {
        type: 'operator',
        code: 'dateDiff',
        description: 'Calculate the difference between two dates in a specified unit.',
        pure: true,
        schema: {
            fields: [
                { key: 'startDate', label: 'Start date field path', type: 'string', required: true },
                { key: 'endDate', label: 'End date field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'unit', label: 'Result unit', type: 'select', required: true, options: [
                    { value: 'seconds', label: 'Seconds' },
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months (approximate)' },
                    { value: 'years', label: 'Years (approximate)' },
                ] },
                { key: 'absolute', label: 'Absolute value', type: 'boolean', description: 'Return absolute value (no negative numbers)' },
            ],
        },
    },
];
