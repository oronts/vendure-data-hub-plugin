import { AdapterDefinition, JsonObject } from '../types';
import {
    MathOperatorConfig,
    CurrencyOperatorConfig,
    UnitOperatorConfig,
    ToNumberOperatorConfig,
    ToStringOperatorConfig,
    ParseNumberOperatorConfig,
    FormatNumberOperatorConfig,
    ToCentsOperatorConfig,
    RoundOperatorConfig,
} from './types';
import {
    applyMath,
    applyCurrency,
    applyUnit,
    applyToNumber,
    applyToString,
    applyParseNumber,
    applyFormatNumber,
    applyToCents,
    applyRound,
} from './helpers';
import { ROUNDING_MODES, UNIT_OPTIONS } from '../constants';
import { createRecordOperator } from '../operator-factory';

export const MATH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'math',
    description: 'Perform math operations on numeric fields.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            {
                key: 'operation',
                label: 'Operation',
                type: 'select',
                required: true,
                options: [
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
                ],
            },
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'operand', label: 'Operand (value or path)', type: 'string', description: 'Number or path starting with $' },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'decimals', label: 'Decimal places', type: 'number' },
        ],
    },
};

export const CURRENCY_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'currency',
    description: 'Convert floats to minor units or re-map currency fields.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'decimals', label: 'Decimals (e.g. 2)', type: 'number', required: true },
            {
                key: 'round',
                label: 'Rounding',
                type: 'select',
                options: [...ROUNDING_MODES],
            },
        ],
    },
};

export const UNIT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'unit',
    description: 'Convert units (e.g. g<->kg, cm<->m)',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            {
                key: 'from',
                label: 'From unit',
                type: 'select',
                required: true,
                options: [...UNIT_OPTIONS],
            },
            {
                key: 'to',
                label: 'To unit',
                type: 'select',
                required: true,
                options: [...UNIT_OPTIONS],
            },
        ],
    },
};

export const TO_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'toNumber',
    description: 'Convert a string field to a number.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string' },
            { key: 'default', label: 'Default value', type: 'number', description: 'Value if conversion fails' },
        ],
    },
};

export const TO_STRING_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'toString',
    description: 'Convert a value to a string.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string' },
        ],
    },
};

export function applyMathOperator(record: JsonObject, config: MathOperatorConfig): JsonObject {
    if (!config.operation || !config.source || !config.target) {
        return record;
    }
    return applyMath(record, config.operation, config.source, config.operand, config.target, config.decimals);
}

export const mathOperator = createRecordOperator(applyMathOperator);

export function applyCurrencyOperator(record: JsonObject, config: CurrencyOperatorConfig): JsonObject {
    if (!config.source || !config.target || config.decimals === undefined) {
        return record;
    }
    return applyCurrency(record, config.source, config.target, config.decimals, config.round);
}

export const currencyOperator = createRecordOperator(applyCurrencyOperator);

export function applyUnitOperator(record: JsonObject, config: UnitOperatorConfig): JsonObject {
    if (!config.source || !config.target || !config.from || !config.to) {
        return record;
    }
    return applyUnit(record, config.source, config.target, config.from, config.to);
}

export const unitOperator = createRecordOperator(applyUnitOperator);

export function applyToNumberOperator(record: JsonObject, config: ToNumberOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyToNumber(record, config.source, config.target, config.default);
}

export const toNumberOperator = createRecordOperator(applyToNumberOperator);

export function applyToStringOperator(record: JsonObject, config: ToStringOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyToString(record, config.source, config.target);
}

export const toStringOperator = createRecordOperator(applyToStringOperator);

export const PARSE_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'parseNumber',
    description: 'Parse a string to a number with locale-aware decimal/thousand separator handling.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source path' },
            { key: 'locale', label: 'Locale', type: 'string', description: 'e.g., "en-US", "de-DE", "fr-FR"' },
            { key: 'default', label: 'Default value', type: 'number', description: 'Value if parsing fails' },
        ],
    },
};

export const FORMAT_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'formatNumber',
    name: 'Number Format',
    description: 'Format a number as a localized string with optional currency or percent formatting.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'locale', label: 'Locale', type: 'string', description: 'e.g., "en-US", "de-DE". Default: "en-US"' },
            { key: 'decimals', label: 'Decimal places', type: 'number' },
            {
                key: 'style',
                label: 'Format style',
                type: 'select',
                options: [
                    { value: 'decimal', label: 'Decimal' },
                    { value: 'currency', label: 'Currency' },
                    { value: 'percent', label: 'Percent' },
                ],
            },
            { key: 'currency', label: 'Currency code', type: 'string', description: 'e.g., "USD", "EUR" (required for currency style)' },
            { key: 'useGrouping', label: 'Use thousand separators', type: 'boolean' },
        ],
    },
};

export function applyParseNumberOperator(record: JsonObject, config: ParseNumberOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyParseNumber(record, config.source, config.target, config.locale, config.default);
}

export const parseNumberOperator = createRecordOperator(applyParseNumberOperator);

export function applyFormatNumberOperator(record: JsonObject, config: FormatNumberOperatorConfig): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyFormatNumber(record, config.source, config.target, config.locale, config.decimals, config.currency, config.style, config.useGrouping);
}

export const formatNumberOperator = createRecordOperator(applyFormatNumberOperator);

export const TO_CENTS_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'toCents',
    description: 'Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true, description: 'Field containing decimal amount (e.g., 19.99)' },
            { key: 'target', label: 'Target field path', type: 'string', required: true, description: 'Field for cents amount (e.g., 1999)' },
            {
                key: 'round',
                label: 'Rounding',
                type: 'select',
                options: [...ROUNDING_MODES],
            },
        ],
    },
};

export const ROUND_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'round',
    description: 'Round a number to a specified number of decimal places.',
    category: 'NUMERIC',
    categoryLabel: 'Numeric',
    categoryOrder: 2,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
            { key: 'decimals', label: 'Decimal places', type: 'number', description: 'Default: 0 (round to integer)' },
            {
                key: 'mode',
                label: 'Rounding mode',
                type: 'select',
                options: [...ROUNDING_MODES],
            },
        ],
    },
};

export function applyToCentsOperator(record: JsonObject, config: ToCentsOperatorConfig): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyToCents(record, config.source, config.target, config.round);
}

export const toCentsOperator = createRecordOperator(applyToCentsOperator);

export function applyRoundOperator(record: JsonObject, config: RoundOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyRound(record, config.source, config.target, config.decimals, config.mode);
}

export const roundOperator = createRecordOperator(applyRoundOperator);
