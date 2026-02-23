import { AdapterDefinition, JsonObject } from '../types';
import {
    DateFormatOperatorConfig,
    DateParseOperatorConfig,
    DateAddOperatorConfig,
    DateDiffOperatorConfig,
    NowOperatorConfig,
} from './types';
import {
    applyDateFormat,
    applyDateParse,
    applyDateAdd,
    applyDateDiff,
    applyNow,
} from './helpers';
import { DATE_UNIT_OPTIONS, DATE_DIFF_UNIT_OPTIONS } from '../constants';
import { createRecordOperator } from '../operator-factory';

export const DATE_FORMAT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'dateFormat',
    description: 'Format a date field to a string.',
    category: 'DATE',
    categoryLabel: 'Date',
    categoryOrder: 5,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'format', label: 'Output format', type: 'string', required: true, description: 'e.g. YYYY-MM-DD, DD/MM/YYYY HH:mm' },
            { key: 'inputFormat', label: 'Input format', type: 'string', description: 'If source is string, specify its format' },
            { key: 'timezone', label: 'Timezone', type: 'string', description: 'e.g. UTC, Europe/London' },
        ],
    },
};

export const DATE_PARSE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'dateParse',
    description: 'Parse a string to a date.',
    category: 'DATE',
    categoryLabel: 'Date',
    categoryOrder: 5,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'format', label: 'Input format', type: 'string', required: true, description: 'Format of the source string' },
            { key: 'timezone', label: 'Timezone', type: 'string' },
        ],
    },
};

export const DATE_ADD_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'dateAdd',
    description: 'Add or subtract time from a date.',
    category: 'DATE',
    categoryLabel: 'Date',
    categoryOrder: 5,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'amount', label: 'Amount', type: 'number', required: true, description: 'Positive to add, negative to subtract' },
            {
                key: 'unit',
                label: 'Unit',
                type: 'select',
                required: true,
                options: [...DATE_UNIT_OPTIONS],
            },
        ],
    },
};

export function applyDateFormatOperator(record: JsonObject, config: DateFormatOperatorConfig): JsonObject {
    if (!config.source || !config.target || !config.format) {
        return record;
    }
    return applyDateFormat(record, config.source, config.target, config.format, config.inputFormat, config.timezone);
}

export const dateFormatOperator = createRecordOperator(applyDateFormatOperator);

export function applyDateParseOperator(record: JsonObject, config: DateParseOperatorConfig): JsonObject {
    if (!config.source || !config.target || !config.format) {
        return record;
    }
    return applyDateParse(record, config.source, config.target, config.format, config.timezone);
}

export const dateParseOperator = createRecordOperator(applyDateParseOperator);

export function applyDateAddOperator(record: JsonObject, config: DateAddOperatorConfig): JsonObject {
    if (!config.source || !config.target || config.amount === undefined || !config.unit) {
        return record;
    }
    return applyDateAdd(record, config.source, config.target, config.amount, config.unit);
}

export const dateAddOperator = createRecordOperator(applyDateAddOperator);

export const DATE_DIFF_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'dateDiff',
    description: 'Calculate the difference between two dates in a specified unit.',
    category: 'DATE',
    categoryLabel: 'Date',
    categoryOrder: 5,
    pure: true,
    schema: {
        fields: [
            { key: 'startDate', label: 'Start date field path', type: 'string', required: true },
            { key: 'endDate', label: 'End date field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            {
                key: 'unit',
                label: 'Result unit',
                type: 'select',
                required: true,
                options: [...DATE_DIFF_UNIT_OPTIONS],
            },
            { key: 'absolute', label: 'Absolute value', type: 'boolean', description: 'Return absolute value (no negative numbers)' },
        ],
    },
};

export function applyDateDiffOperator(record: JsonObject, config: DateDiffOperatorConfig): JsonObject {
    if (!config.startDate || !config.endDate || !config.target || !config.unit) {
        return record;
    }
    return applyDateDiff(record, config.startDate, config.endDate, config.target, config.unit, config.absolute);
}

export const dateDiffOperator = createRecordOperator(applyDateDiffOperator);

export const NOW_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'now',
    description: 'Set the current timestamp on a field. Useful for adding created/updated timestamps.',
    category: 'DATE',
    categoryLabel: 'Date',
    categoryOrder: 5,
    pure: false, // Returns different values on each call
    schema: {
        fields: [
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            {
                key: 'format',
                label: 'Output format',
                type: 'select',
                options: [
                    { value: 'ISO', label: 'ISO 8601 (2024-01-15T10:30:00.000Z)' },
                    { value: 'timestamp', label: 'Unix timestamp (milliseconds)' },
                    { value: 'date', label: 'Date only (YYYY-MM-DD)' },
                    { value: 'datetime', label: 'Date and time (YYYY-MM-DD HH:mm:ss)' },
                ],
                description: 'Or use a custom format like YYYY/MM/DD',
            },
            { key: 'timezone', label: 'Timezone', type: 'string', description: 'e.g., UTC, Europe/London' },
        ],
    },
};

export function applyNowOperator(record: JsonObject, config: NowOperatorConfig): JsonObject {
    if (!config.target) {
        return record;
    }
    return applyNow(record, config.target, config.format, config.timezone);
}

export const nowOperator = createRecordOperator(applyNowOperator);
