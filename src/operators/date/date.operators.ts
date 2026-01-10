import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
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

export const DATE_FORMAT_OPERATOR_DEFINITION: AdapterDefinition = {
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
};

export const DATE_PARSE_OPERATOR_DEFINITION: AdapterDefinition = {
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
};

export const DATE_ADD_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'dateAdd',
    description: 'Add or subtract time from a date.',
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
                options: [
                    { value: 'seconds', label: 'Seconds' },
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months' },
                    { value: 'years', label: 'Years' },
                ],
            },
        ],
    },
};

export function dateFormatOperator(
    records: readonly JsonObject[],
    config: DateFormatOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || !config.format) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDateFormat(
            record,
            config.source,
            config.target,
            config.format,
            config.inputFormat,
            config.timezone,
        ),
    );
    return { records: results };
}

export function dateParseOperator(
    records: readonly JsonObject[],
    config: DateParseOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || !config.format) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDateParse(
            record,
            config.source,
            config.target,
            config.format,
            config.timezone,
        ),
    );
    return { records: results };
}

export function dateAddOperator(
    records: readonly JsonObject[],
    config: DateAddOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || config.amount === undefined || !config.unit) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDateAdd(
            record,
            config.source,
            config.target,
            config.amount,
            config.unit,
        ),
    );
    return { records: results };
}

/**
 * Operator definition for calculating the difference between two dates.
 */
export const DATE_DIFF_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'dateDiff',
    description: 'Calculate the difference between two dates in a specified unit.',
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
                options: [
                    { value: 'seconds', label: 'Seconds' },
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months (approximate)' },
                    { value: 'years', label: 'Years (approximate)' },
                ],
            },
            { key: 'absolute', label: 'Absolute value', type: 'boolean', description: 'Return absolute value (no negative numbers)' },
        ],
    },
};

/**
 * Calculate the difference between two dates.
 */
export function dateDiffOperator(
    records: readonly JsonObject[],
    config: DateDiffOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.startDate || !config.endDate || !config.target || !config.unit) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDateDiff(
            record,
            config.startDate,
            config.endDate,
            config.target,
            config.unit,
            config.absolute,
        ),
    );
    return { records: results };
}

export const NOW_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'now',
    description: 'Set the current timestamp on a field. Useful for adding created/updated timestamps.',
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

export function nowOperator(
    records: readonly JsonObject[],
    config: NowOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyNow(record, config.target, config.format, config.timezone),
    );
    return { records: results };
}

// Alias for dateFormat - some pipelines use 'formatDate' instead of 'dateFormat'
export const FORMAT_DATE_OPERATOR_DEFINITION: AdapterDefinition = {
    ...DATE_FORMAT_OPERATOR_DEFINITION,
    code: 'formatDate',
};

export const formatDateOperator = dateFormatOperator;
