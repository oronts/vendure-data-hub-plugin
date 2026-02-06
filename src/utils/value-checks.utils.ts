/**
 * Value Checks Utilities
 *
 * Common value validation and checking functions used across the data-hub plugin.
 * These utilities provide consistent empty/null checking behavior.
 */

import { JsonValue } from '../types';

/**
 * Check if a value is considered empty.
 *
 * A value is empty if:
 * - It is null or undefined
 * - It is a string that is empty or contains only whitespace
 * - It is an empty array
 *
 * @param value - The value to check
 * @returns True if the value is empty
 *
 * @example
 * isEmpty(null)       // true
 * isEmpty(undefined)  // true
 * isEmpty('')         // true
 * isEmpty('   ')      // true (whitespace-only)
 * isEmpty([])         // true
 * isEmpty('hello')    // false
 * isEmpty([1, 2])     // false
 * isEmpty(0)          // false
 * isEmpty(false)      // false
 */
export function isEmpty(value: JsonValue | undefined): boolean {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === 'string' && value.trim() === '') {
        return true;
    }
    if (Array.isArray(value) && value.length === 0) {
        return true;
    }
    return false;
}

/**
 * Check if a value is null or undefined.
 *
 * @param value - The value to check
 * @returns True if the value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

/**
 * Check if a value is present (not null and not undefined).
 *
 * @param value - The value to check
 * @returns True if the value is present
 */
export function isPresent<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}
