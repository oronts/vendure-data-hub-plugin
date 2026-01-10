/**
 * Array Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { RecordObject } from '../../../runtime/executor-types';
import { TransformConfig } from '../../types/transform-config.types';

/**
 * Apply map transform using value dictionary
 */
export function applyMapTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['map']>,
): JsonValue {
    const strValue = String(value);
    const key = config.caseSensitive === false ? strValue.toLowerCase() : strValue;

    // Check for direct match
    if (key in config.values) {
        return config.values[key];
    }

    // Check for case-insensitive match
    if (config.caseSensitive === false) {
        for (const [k, v] of Object.entries(config.values)) {
            if (k.toLowerCase() === key) {
                return v;
            }
        }
    }

    return config.default ?? value;
}

/**
 * Apply lookup transform using lookup tables
 */
export function applyLookupTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['lookup']>,
    lookupTables: Map<string, { data: RecordObject[]; keyField: string }>,
): JsonValue {
    const table = lookupTables.get(config.table);
    if (!table) {
        return config.default ?? value;
    }

    const found = table.data.find(row => row[config.fromField] === value);
    if (found) {
        return found[config.toField];
    }

    return config.default ?? value;
}

/**
 * Apply default value transform
 */
export function applyDefaultTransform(
    value: JsonValue | undefined,
    config: NonNullable<TransformConfig['default']>,
    isEmpty: (value: JsonValue | undefined) => boolean,
): JsonValue {
    if (config.onlyIfEmpty !== false && isEmpty(value)) {
        return config.value;
    }
    return value ?? null;
}

/**
 * Get first element of array
 */
export function getFirst<T>(arr: T[]): T | undefined {
    return arr[0];
}

/**
 * Get last element of array
 */
export function getLast<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
}

/**
 * Get nth element of array
 */
export function getNth<T>(arr: T[], index: number): T | undefined {
    return arr[index];
}

/**
 * Flatten nested arrays
 */
export function flattenArray<T>(arr: T[][]): T[] {
    return arr.flat();
}

/**
 * Filter array by predicate
 */
export function filterArray<T>(arr: T[], predicate: (item: T) => boolean): T[] {
    return arr.filter(predicate);
}

/**
 * Map array elements
 */
export function mapArray<T, U>(arr: T[], mapper: (item: T) => U): U[] {
    return arr.map(mapper);
}

/**
 * Check if array contains unique items
 */
export function hasUniqueItems<T>(arr: T[]): boolean {
    return new Set(arr).size === arr.length;
}

/**
 * Remove duplicates from array
 */
export function uniqueArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
}
