/**
 * Type Conversion Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { MapperTransformConfig } from '../../types/transform-config.types';
import { formatDate } from '../date/date-transformers';

import {
    applyToString as applyToStringCanonical,
    applyToNumber as applyToNumberCanonical,
    applyToBoolean as applyToBooleanCanonical,
    applyParseJson as applyParseJsonCanonical,
    applyToJson as applyToJsonCanonical,
} from '../../../transforms/field/type-coercion';

/**
 * Apply convert transform for type conversion
 */
export function applyConvertTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['convert']>,
): JsonValue {
    switch (config.to) {
        case 'string':
            if (value instanceof Date) {
                return config.format ? formatDate(value, config.format) : value.toISOString();
            }
            return applyToStringCanonical(value);

        case 'number':
            return applyToNumberCanonical(value) ?? 0;

        case 'boolean':
            return applyToBooleanCanonical(value);

        case 'date':
            if (typeof value === 'string' || typeof value === 'number') {
                const date = new Date(value);
                // Validate date is valid before converting
                if (isNaN(date.getTime())) {
                    return null;
                }
                return date.toISOString();
            }
            return value;

        case 'json':
            return applyParseJsonCanonical(value);

        default:
            return value;
    }
}

/**
 * Convert string to boolean
 */
export function toBoolean(value: JsonValue): boolean {
    const result = applyToBooleanCanonical(value);
    return typeof result === 'boolean' ? result : Boolean(result);
}

/**
 * Convert value to string
 */
export function toString(value: JsonValue): string {
    const result = applyToStringCanonical(value);
    return typeof result === 'string' ? result : '';
}

/**
 * Convert value to number
 */
export function toNumber(value: JsonValue): number {
    const result = applyToNumberCanonical(value);
    return typeof result === 'number' ? result : 0;
}

/**
 * Convert value to integer
 */
export function toInteger(value: JsonValue): number {
    return Math.floor(toNumber(value));
}

/**
 * Parse JSON string
 */
export function parseJson(value: string): JsonValue {
    return applyParseJsonCanonical(value);
}

/**
 * Stringify value to JSON
 */
export function stringifyJson(value: JsonValue, pretty: boolean = false): string {
    if (pretty) {
        return JSON.stringify(value, null, 2);
    }
    const result = applyToJsonCanonical(value);
    return typeof result === 'string' ? result : '';
}
