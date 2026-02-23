import { JsonObject } from '../types';
import { getNestedValue, setNestedValue, deepClone } from '../helpers';
import { MathOperation, RoundingMode, UnitType } from './types';
import {
    WEIGHT_UNITS,
    LENGTH_UNITS,
    VOLUME_UNITS,
    convertUnit,
} from '../../constants/units';
import { TRANSFORM_LIMITS } from '../../constants/index';

/** Clamp decimal places to a safe range to prevent Math.pow(10, n) overflow. */
function clampDecimals(decimals: number): number {
    return Math.min(Math.max(0, Math.floor(decimals)), TRANSFORM_LIMITS.MAX_DECIMAL_PLACES);
}

function applyRoundingMode(value: number, mode: string): number {
    switch (mode) {
        case 'floor': return Math.floor(value);
        case 'ceil': return Math.ceil(value);
        default: return Math.round(value);
    }
}

const UNIT_CATEGORIES: Record<string, UnitType[]> = {
    weight: Object.values(WEIGHT_UNITS) as UnitType[],
    length: Object.values(LENGTH_UNITS) as UnitType[],
    volume: Object.values(VOLUME_UNITS) as UnitType[],
};

function parseOperand(record: JsonObject, operand: string | undefined): number | null {
    if (operand === undefined || operand === '') {
        return null;
    }

    if (operand.startsWith('$')) {
        const path = operand.slice(1);
        const value = getNestedValue(record, path);
        return typeof value === 'number' ? value : null;
    }

    const num = parseFloat(operand);
    return isNaN(num) ? null : num;
}

export function applyMath(
    record: JsonObject,
    operation: MathOperation,
    source: string,
    operand: string | undefined,
    target: string,
    decimals?: number,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);

    if (typeof sourceValue !== 'number') {
        return result;
    }

    const operandValue = parseOperand(record, operand);
    let computedValue: number;

    switch (operation) {
        case 'add':
            computedValue = operandValue !== null ? sourceValue + operandValue : sourceValue;
            break;
        case 'subtract':
            computedValue = operandValue !== null ? sourceValue - operandValue : sourceValue;
            break;
        case 'multiply':
            computedValue = operandValue !== null ? sourceValue * operandValue : sourceValue;
            break;
        case 'divide':
            computedValue = operandValue !== null && operandValue !== 0 ? sourceValue / operandValue : sourceValue;
            break;
        case 'modulo':
            computedValue = operandValue !== null && operandValue !== 0 ? sourceValue % operandValue : sourceValue;
            break;
        case 'power': {
            const powered = operandValue !== null ? Math.pow(sourceValue, operandValue) : sourceValue;
            computedValue = isFinite(powered) ? powered : sourceValue;
            break;
        }
        case 'round':
        case 'floor':
        case 'ceil': {
            if (decimals !== undefined && decimals >= 0) {
                const safeDecimals = clampDecimals(decimals);
                const factor = Math.pow(10, safeDecimals);
                computedValue = applyRoundingMode(sourceValue * factor, operation) / factor;
            } else {
                computedValue = applyRoundingMode(sourceValue, operation);
            }
            break;
        }
        case 'abs':
            computedValue = Math.abs(sourceValue);
            break;
        default:
            computedValue = sourceValue;
    }

    // Apply decimal rounding if specified (for non-rounding operations)
    if (decimals !== undefined && decimals >= 0 && operation !== 'round' && operation !== 'floor' && operation !== 'ceil') {
        const safeDecimals = clampDecimals(decimals);
        const factor = Math.pow(10, safeDecimals);
        computedValue = Math.round(computedValue * factor) / factor;
    }

    setNestedValue(result, target, computedValue);
    return result;
}

export function applyCurrency(
    record: JsonObject,
    source: string,
    target: string,
    decimals: number,
    round: RoundingMode = 'round',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value !== 'number') {
        return result;
    }

    const safeDecimals = clampDecimals(decimals);
    const factor = Math.pow(10, safeDecimals);
    const minorUnits = applyRoundingMode(value * factor, round);

    setNestedValue(result, target, minorUnits);
    return result;
}

function getUnitCategory(unit: UnitType): string | null {
    for (const [category, units] of Object.entries(UNIT_CATEGORIES)) {
        if (units.includes(unit)) {
            return category;
        }
    }
    return null;
}

export function applyUnit(
    record: JsonObject,
    source: string,
    target: string,
    from: UnitType,
    to: UnitType,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value !== 'number') {
        return result;
    }

    // Validate units are in same category
    const fromCategory = getUnitCategory(from);
    const toCategory = getUnitCategory(to);

    if (!fromCategory || !toCategory || fromCategory !== toCategory) {
        // Incompatible units - return unchanged
        return result;
    }

    // Use the central convertUnit function from constants
    const convertedValue = convertUnit(value, from, to);

    if (convertedValue !== null) {
        setNestedValue(result, target, convertedValue);
    }

    return result;
}

export function applyToNumber(
    record: JsonObject,
    source: string,
    target: string | undefined,
    defaultValue?: number,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);
    const targetPath = target || source;

    let parsedNumber: number | null = null;

    if (typeof value === 'number') {
        parsedNumber = value;
    } else if (typeof value === 'string') {
        const parsed = parseFloat(value);
        parsedNumber = isNaN(parsed) ? null : parsed;
    } else if (typeof value === 'boolean') {
        parsedNumber = value ? 1 : 0;
    }

    if (parsedNumber === null && defaultValue !== undefined) {
        parsedNumber = defaultValue;
    }

    setNestedValue(result, targetPath, parsedNumber);
    return result;
}

export function applyToString(
    record: JsonObject,
    source: string,
    target: string | undefined,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);
    const targetPath = target || source;

    const stringValue = value !== null && value !== undefined ? String(value) : '';
    setNestedValue(result, targetPath, stringValue);
    return result;
}

/**
 * Parse a string to a number with locale-aware handling.
 * Supports different decimal and thousand separators based on locale.
 */
export function applyParseNumber(
    record: JsonObject,
    source: string,
    target: string | undefined,
    locale?: string,
    defaultValue?: number,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);
    const targetPath = target || source;

    let parsedNumber: number | null = null;

    if (typeof value === 'number') {
        parsedNumber = value;
    } else if (typeof value === 'string') {
        let cleanedValue = value.trim();

        if (locale) {
            // Get locale-specific separators
            const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
            const groupSep = parts.find(p => p.type === 'group')?.value || ',';
            const decimalSep = parts.find(p => p.type === 'decimal')?.value || '.';

            // Remove grouping separators and normalize decimal separator
            cleanedValue = cleanedValue.split(groupSep).join('');
            if (decimalSep !== '.') {
                cleanedValue = cleanedValue.split(decimalSep).join('.');
            }
        } else {
            // Default: remove commas (common thousand separator)
            cleanedValue = cleanedValue.replace(/,/g, '');
        }

        const parsed = parseFloat(cleanedValue);
        parsedNumber = isNaN(parsed) ? null : parsed;
    }

    if (parsedNumber === null && defaultValue !== undefined) {
        parsedNumber = defaultValue;
    }

    setNestedValue(result, targetPath, parsedNumber);
    return result;
}

/**
 * Format a number as a string with locale and optional currency formatting.
 */
export function applyFormatNumber(
    record: JsonObject,
    source: string,
    target: string,
    locale?: string,
    decimals?: number,
    currency?: string,
    style?: 'decimal' | 'currency' | 'percent',
    useGrouping?: boolean,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value !== 'number') {
        return result;
    }

    try {
        const options: Intl.NumberFormatOptions = {
            useGrouping: useGrouping ?? true,
        };

        if (style === 'currency' && currency) {
            options.style = 'currency';
            options.currency = currency;
        } else if (style === 'percent') {
            options.style = 'percent';
        } else {
            options.style = 'decimal';
        }

        if (decimals !== undefined) {
            options.minimumFractionDigits = decimals;
            options.maximumFractionDigits = decimals;
        }

        const formatted = new Intl.NumberFormat(locale || 'en-US', options).format(value);
        setNestedValue(result, target, formatted);
    } catch {
        // Invalid locale or currency - set raw string value
        setNestedValue(result, target, String(value));
    }

    return result;
}

/**
 * Convert a decimal amount to cents (minor currency units).
 * Multiplies by 100 and rounds to avoid floating point issues.
 */
export function applyToCents(
    record: JsonObject,
    source: string,
    target: string,
    round: RoundingMode = 'round',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value !== 'number') {
        return result;
    }

    const roundedCents = applyRoundingMode(value * 100, round);

    setNestedValue(result, target, roundedCents);
    return result;
}

/**
 * Round a number to a specified number of decimal places.
 */
export function applyRound(
    record: JsonObject,
    source: string,
    target: string | undefined,
    decimals = 0,
    mode: RoundingMode = 'round',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);
    const targetPath = target || source;

    if (typeof value !== 'number') {
        return result;
    }

    const safeDecimals = clampDecimals(decimals);
    const factor = Math.pow(10, safeDecimals);
    const rounded = applyRoundingMode(value * factor, mode) / factor;

    setNestedValue(result, targetPath, rounded);
    return result;
}
