/**
 * Type Coercion Transforms
 *
 * Transform operations for converting between types.
 * Provides safe type conversion with proper null handling.
 */

import { JsonValue } from '../../types/index';

// TYPE CONVERSION TRANSFORMS

/**
 * Apply to string transform
 * Handles null/undefined gracefully, converts objects to JSON
 */
export function applyToString(value: JsonValue): JsonValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Apply to number transform
 * Parses strings, converts booleans to 0/1
 */
export function applyToNumber(value: JsonValue): JsonValue {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    return null;
}

/**
 * Apply to boolean transform
 * Treats non-empty strings (except 'false' and '0') as true
 */
export function applyToBoolean(value: JsonValue): JsonValue {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0 && value !== 'false' && value !== '0';
    return Boolean(value);
}

/**
 * Apply to array transform
 * Wraps non-array values in an array
 */
export function applyToArray(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
}

/**
 * Apply to JSON transform (serialize)
 * Safely converts value to JSON string
 */
export function applyToJson(value: JsonValue): JsonValue {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

/**
 * Apply parse JSON transform (deserialize)
 * Safely parses JSON string to value
 */
export function applyParseJson(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
    return value;
}
