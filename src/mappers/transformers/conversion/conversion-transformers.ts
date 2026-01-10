/**
 * Type Conversion Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { TransformConfig } from '../../services/field-mapper.service';
import { formatDate } from '../date/date-transformers';

/**
 * Apply convert transform for type conversion
 */
export function applyConvertTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['convert']>,
): JsonValue {
    switch (config.to) {
        case 'string':
            if (value instanceof Date) {
                return config.format ? formatDate(value, config.format) : value.toISOString();
            }
            return String(value);

        case 'number':
            if (typeof value === 'string') {
                // Handle currency strings
                const cleaned = value.replace(/[^0-9.-]/g, '');
                const num = parseFloat(cleaned);
                return isNaN(num) ? 0 : num;
            }
            return Number(value);

        case 'boolean':
            if (typeof value === 'string') {
                const lower = value.toLowerCase().trim();
                return ['true', '1', 'yes', 'on', 'enabled'].includes(lower);
            }
            return Boolean(value);

        case 'date':
            if (typeof value === 'string' || typeof value === 'number') {
                return new Date(value).toISOString();
            }
            return value;

        case 'json':
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            return value;

        default:
            return value;
    }
}

/**
 * Convert string to boolean
 */
export function toBoolean(value: JsonValue): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return ['true', '1', 'yes', 'on', 'enabled', 'active'].includes(lower);
    }
    return Boolean(value);
}

/**
 * Convert value to string
 */
export function toString(value: JsonValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Convert value to number
 */
export function toNumber(value: JsonValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    return Number(value) || 0;
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
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/**
 * Stringify value to JSON
 */
export function stringifyJson(value: JsonValue, pretty: boolean = false): string {
    return JSON.stringify(value, null, pretty ? 2 : undefined);
}
