/**
 * Number Field Transforms
 *
 * Numeric manipulation transform operations.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue } from '../../types/index';
import { TRANSFORM_LIMITS } from '../../constants/defaults';
import { MathOperation } from '../../constants/enums';

// Regex patterns as constants for performance and maintainability
const NUMERIC_CHARS_PATTERN = /[^\d.-]/g;
const INTEGER_CHARS_PATTERN = /[^\d-]/g;

/**
 * Apply parse number/parse float transform
 */
export function applyParseNumber(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        const cleaned = value.replace(NUMERIC_CHARS_PATTERN, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }
    return typeof value === 'number' ? value : null;
}

/**
 * Apply parse int transform
 */
export function applyParseInt(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        const cleaned = value.replace(INTEGER_CHARS_PATTERN, '');
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? null : num;
    }
    return typeof value === 'number' ? Math.floor(value) : null;
}

/**
 * Apply round transform
 */
export function applyRound(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'number') {
        const precision = Math.min(Math.max(0, Math.floor(config.precision ?? 0)), TRANSFORM_LIMITS.MAX_DECIMAL_PLACES);
        const factor = Math.pow(10, precision);
        return isFinite(factor) ? Math.round(value * factor) / factor : value;
    }
    return value;
}

/**
 * Apply floor transform
 */
export function applyFloor(value: JsonValue): JsonValue {
    return typeof value === 'number' ? Math.floor(value) : value;
}

/**
 * Apply ceil transform
 */
export function applyCeil(value: JsonValue): JsonValue {
    return typeof value === 'number' ? Math.ceil(value) : value;
}

/**
 * Apply abs transform
 */
export function applyAbs(value: JsonValue): JsonValue {
    return typeof value === 'number' ? Math.abs(value) : value;
}

/**
 * Apply to cents transform (convert currency to minor units)
 */
export function applyToCents(value: JsonValue): JsonValue {
    if (typeof value === 'number') {
        return Math.round(value * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
    }
    if (typeof value === 'string') {
        const num = parseFloat(value.replace(NUMERIC_CHARS_PATTERN, ''));
        return isNaN(num) ? null : Math.round(num * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER);
    }
    return value;
}

/**
 * Apply from cents transform (convert minor units to currency)
 */
export function applyFromCents(value: JsonValue): JsonValue {
    if (typeof value === 'number') {
        return value / TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER;
    }
    return value;
}

/**
 * Apply math operation transform
 */
export function applyMath(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'number' && config.operation && config.operand !== undefined) {
        switch (config.operation) {
            case MathOperation.ADD:
                return value + config.operand;
            case MathOperation.SUBTRACT:
                return value - config.operand;
            case MathOperation.MULTIPLY:
                return value * config.operand;
            case MathOperation.DIVIDE:
                return config.operand !== 0 ? value / config.operand : null;
            case MathOperation.MODULO:
                return config.operand !== 0 ? value % config.operand : null;
            case MathOperation.POWER: {
                const powered = Math.pow(value, config.operand);
                return isFinite(powered) ? powered : value;
            }
        }
    }
    return value;
}
