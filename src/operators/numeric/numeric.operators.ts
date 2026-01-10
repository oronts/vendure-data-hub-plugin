import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
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

export const MATH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'math',
    description: 'Perform math operations on numeric fields.',
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
    type: 'operator',
    code: 'currency',
    description: 'Convert floats to minor units or re-map currency fields.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'decimals', label: 'Decimals (e.g. 2)', type: 'number', required: true },
            {
                key: 'round',
                label: 'Rounding',
                type: 'select',
                options: [
                    { value: 'round', label: 'round' },
                    { value: 'floor', label: 'floor' },
                    { value: 'ceil', label: 'ceil' },
                ],
            },
        ],
    },
};

export const UNIT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'unit',
    description: 'Convert units (e.g. g<->kg, cm<->m)',
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
                options: [
                    { value: 'g', label: 'g (grams)' },
                    { value: 'kg', label: 'kg (kilograms)' },
                    { value: 'lb', label: 'lb (pounds)' },
                    { value: 'oz', label: 'oz (ounces)' },
                    { value: 'cm', label: 'cm (centimeters)' },
                    { value: 'm', label: 'm (meters)' },
                    { value: 'mm', label: 'mm (millimeters)' },
                    { value: 'in', label: 'in (inches)' },
                    { value: 'ft', label: 'ft (feet)' },
                    { value: 'ml', label: 'ml (milliliters)' },
                    { value: 'l', label: 'l (liters)' },
                    { value: 'gal', label: 'gal (gallons)' },
                ],
            },
            {
                key: 'to',
                label: 'To unit',
                type: 'select',
                required: true,
                options: [
                    { value: 'g', label: 'g (grams)' },
                    { value: 'kg', label: 'kg (kilograms)' },
                    { value: 'lb', label: 'lb (pounds)' },
                    { value: 'oz', label: 'oz (ounces)' },
                    { value: 'cm', label: 'cm (centimeters)' },
                    { value: 'm', label: 'm (meters)' },
                    { value: 'mm', label: 'mm (millimeters)' },
                    { value: 'in', label: 'in (inches)' },
                    { value: 'ft', label: 'ft (feet)' },
                    { value: 'ml', label: 'ml (milliliters)' },
                    { value: 'l', label: 'l (liters)' },
                    { value: 'gal', label: 'gal (gallons)' },
                ],
            },
        ],
    },
};

export const TO_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
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
};

export const TO_STRING_OPERATOR_DEFINITION: AdapterDefinition = {
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
};

export function mathOperator(
    records: readonly JsonObject[],
    config: MathOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.operation || !config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyMath(record, config.operation, config.source, config.operand, config.target, config.decimals),
    );
    return { records: results };
}

export function currencyOperator(
    records: readonly JsonObject[],
    config: CurrencyOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || config.decimals === undefined) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyCurrency(record, config.source, config.target, config.decimals, config.round),
    );
    return { records: results };
}

export function unitOperator(
    records: readonly JsonObject[],
    config: UnitOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || !config.from || !config.to) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyUnit(record, config.source, config.target, config.from, config.to),
    );
    return { records: results };
}

export function toNumberOperator(
    records: readonly JsonObject[],
    config: ToNumberOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyToNumber(record, config.source, config.target, config.default),
    );
    return { records: results };
}

export function toStringOperator(
    records: readonly JsonObject[],
    config: ToStringOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyToString(record, config.source, config.target),
    );
    return { records: results };
}

/**
 * Operator definition for parsing numbers with locale support.
 */
export const PARSE_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
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
};

/**
 * Operator definition for formatting numbers with locale/currency support.
 */
export const FORMAT_NUMBER_OPERATOR_DEFINITION: AdapterDefinition = {
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

/**
 * Parse a string to a number with locale-aware handling.
 */
export function parseNumberOperator(
    records: readonly JsonObject[],
    config: ParseNumberOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyParseNumber(
            record,
            config.source,
            config.target,
            config.locale,
            config.default,
        ),
    );
    return { records: results };
}

/**
 * Format a number as a localized string.
 */
export function formatNumberOperator(
    records: readonly JsonObject[],
    config: FormatNumberOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyFormatNumber(
            record,
            config.source,
            config.target,
            config.locale,
            config.decimals,
            config.currency,
            config.style,
            config.useGrouping,
        ),
    );
    return { records: results };
}

export const TO_CENTS_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'toCents',
    description: 'Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true, description: 'Field containing decimal amount (e.g., 19.99)' },
            { key: 'target', label: 'Target field path', type: 'string', required: true, description: 'Field for cents amount (e.g., 1999)' },
            {
                key: 'round',
                label: 'Rounding',
                type: 'select',
                options: [
                    { value: 'round', label: 'Round (nearest)' },
                    { value: 'floor', label: 'Floor (down)' },
                    { value: 'ceil', label: 'Ceil (up)' },
                ],
            },
        ],
    },
};

export const ROUND_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'round',
    description: 'Round a number to a specified number of decimal places.',
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
                options: [
                    { value: 'round', label: 'Round (nearest)' },
                    { value: 'floor', label: 'Floor (down)' },
                    { value: 'ceil', label: 'Ceil (up)' },
                ],
            },
        ],
    },
};

export function toCentsOperator(
    records: readonly JsonObject[],
    config: ToCentsOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyToCents(record, config.source, config.target, config.round),
    );
    return { records: results };
}

export function roundOperator(
    records: readonly JsonObject[],
    config: RoundOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyRound(record, config.source, config.target, config.decimals, config.mode),
    );
    return { records: results };
}
