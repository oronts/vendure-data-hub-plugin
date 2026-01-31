/**
 * Object Path Utilities
 *
 * Unified object path manipulation utilities for the data-hub plugin.
 * Consolidates path navigation functions from operators/helpers, graphql/helpers,
 * and runtime/utils.
 *
 * This is the SINGLE SOURCE OF TRUTH for all object path operations.
 */

import { JsonValue, JsonObject } from '../types';

/**
 * Get a value from a nested object using dot notation path.
 *
 * @param obj - The object to navigate
 * @param path - Dot-notation path (e.g., 'user.address.city')
 * @returns The value at the path, or undefined if not found
 *
 * @example
 * getNestedValue({ user: { name: 'John' } }, 'user.name') // 'John'
 * getNestedValue({ a: { b: 1 } }, 'a.c') // undefined
 */
export function getNestedValue(obj: JsonObject | unknown, path: string): JsonValue | undefined {
    if (!obj || !path) {
        return undefined;
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object' || Array.isArray(current)) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current as JsonValue | undefined;
}

/**
 * Set a value in a nested object using dot notation path.
 * Creates intermediate objects as needed.
 *
 * @param obj - The object to modify
 * @param path - Dot-notation path (e.g., 'user.address.city')
 * @param value - The value to set
 *
 * @example
 * const obj = {};
 * setNestedValue(obj, 'user.name', 'John');
 * // obj is now { user: { name: 'John' } }
 */
export function setNestedValue(obj: JsonObject, path: string, value: JsonValue): void {
    if (!path) {
        return;
    }

    const parts = path.split('.');
    let current: JsonObject = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            current[part] = {};
        }
        current = current[part] as JsonObject;
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
}

/**
 * Remove a value from a nested object using dot notation path.
 *
 * @param obj - The object to modify
 * @param path - Dot-notation path (e.g., 'user.address.city')
 *
 * @example
 * const obj = { user: { name: 'John', age: 30 } };
 * removeNestedValue(obj, 'user.age');
 * // obj is now { user: { name: 'John' } }
 */
export function removeNestedValue(obj: JsonObject, path: string): void {
    if (!path) {
        return;
    }

    const parts = path.split('.');
    let current: JsonObject = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            return; // Path doesn't exist
        }
        current = current[part] as JsonObject;
    }

    const lastPart = parts[parts.length - 1];
    delete current[lastPart];
}

/**
 * Check if a value exists at a nested path.
 *
 * @param obj - The object to check
 * @param path - Dot-notation path (e.g., 'user.address.city')
 * @returns true if the path exists (value can be null/undefined)
 *
 * @example
 * hasNestedValue({ user: { name: 'John' } }, 'user.name') // true
 * hasNestedValue({ user: { name: 'John' } }, 'user.age') // false
 */
export function hasNestedValue(obj: JsonObject, path: string): boolean {
    if (!path) {
        return false;
    }

    const parts = path.split('.');
    let current: JsonValue = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return false;
        }
        if (typeof current !== 'object' || Array.isArray(current)) {
            return false;
        }
        if (!(part in (current as JsonObject))) {
            return false;
        }
        current = (current as JsonObject)[part];
    }

    return true;
}

/**
 * Deep clone a JSON value.
 *
 * @param value - The value to clone
 * @returns A deep copy of the value
 */
export function deepClone<T extends JsonValue>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => deepClone(item)) as T;
    }

    const result: JsonObject = {};
    for (const key of Object.keys(value)) {
        result[key] = deepClone((value as JsonObject)[key]);
    }
    return result as T;
}

/**
 * Pick specific paths from an object.
 *
 * @param obj - Source object
 * @param paths - Array of dot-notation paths to include
 * @returns New object with only the specified paths
 */
export function pickPaths(obj: JsonObject, paths: string[]): JsonObject {
    const result: JsonObject = {};
    for (const path of paths) {
        const value = getNestedValue(obj, path);
        if (value !== undefined) {
            setNestedValue(result, path, value);
        }
    }
    return result;
}

/**
 * Omit specific paths from an object (returns a new object).
 *
 * @param obj - Source object
 * @param paths - Array of dot-notation paths to exclude
 * @returns New object without the specified paths
 */
export function omitPaths(obj: JsonObject, paths: string[]): JsonObject {
    const clone = deepClone(obj);
    for (const path of paths) {
        removeNestedValue(clone, path);
    }
    return clone;
}

/**
 * Get all leaf paths in an object.
 *
 * @param obj - The object to traverse
 * @param prefix - Current path prefix (for recursion)
 * @returns Array of all leaf paths
 *
 * @example
 * getAllPaths({ a: { b: 1, c: 2 }, d: 3 })
 * // ['a.b', 'a.c', 'd']
 */
export function getAllPaths(obj: JsonObject, prefix: string = ''): string[] {
    const paths: string[] = [];

    for (const key of Object.keys(obj)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            paths.push(...getAllPaths(value as JsonObject, currentPath));
        } else {
            paths.push(currentPath);
        }
    }

    return paths;
}
