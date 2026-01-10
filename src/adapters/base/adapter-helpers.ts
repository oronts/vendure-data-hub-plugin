/**
 * Adapter Helpers
 *
 * Common utility functions used by adapters.
 * Includes field access, filtering, type checking, and formatting.
 */

import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';

// FILTER CONDITION TYPE

/**
 * Filter condition for data filtering
 */
export interface FilterCondition {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'isNull' | 'isNotNull';
    value?: JsonValue;
}

// FIELD ACCESS

/**
 * Get a nested field value from an object using dot notation
 * Handles null/undefined gracefully at any level
 *
 * @example
 * getFieldValue({ a: { b: { c: 1 } } }, 'a.b.c') // Returns: 1
 * getFieldValue({ a: null }, 'a.b.c') // Returns: undefined
 */
export function getFieldValue(obj: RecordObject, path: string): JsonValue | undefined {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current: JsonValue | undefined = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== 'object' || Array.isArray(current)) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Set a nested field value in an object using dot notation
 * Creates intermediate objects as needed
 *
 * @example
 * const obj = {};
 * setFieldValue(obj, 'a.b.c', 1) // obj becomes { a: { b: { c: 1 } } }
 */
export function setFieldValue(obj: RecordObject, path: string, value: JsonValue): void {
    const parts = path.split('.');
    let current: RecordObject = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part] as RecordObject;
    }
    current[parts[parts.length - 1]] = value;
}

// CONDITION EVALUATION

/**
 * Evaluate a filter condition against a record
 * Returns true if the record matches the condition
 */
export function evaluateFilterCondition(record: RecordObject, condition: FilterCondition): boolean {
    const value = getFieldValue(record, condition.field);
    const condValue = condition.value;

    switch (condition.operator) {
        case 'eq': return value === condValue;
        case 'ne': return value !== condValue;
        case 'gt': return (value ?? 0) > (condValue ?? 0);
        case 'lt': return (value ?? 0) < (condValue ?? 0);
        case 'gte': return (value ?? 0) >= (condValue ?? 0);
        case 'lte': return (value ?? 0) <= (condValue ?? 0);
        case 'contains': return String(value ?? '').includes(String(condValue ?? ''));
        case 'startsWith': return String(value ?? '').startsWith(String(condValue ?? ''));
        case 'endsWith': return String(value ?? '').endsWith(String(condValue ?? ''));
        case 'in': return Array.isArray(condValue) && condValue.includes(value as JsonValue);
        case 'notIn': return Array.isArray(condValue) && !condValue.includes(value as JsonValue);
        case 'isNull': return value === null || value === undefined;
        case 'isNotNull': return value !== null && value !== undefined;
        default: return true;
    }
}

// TYPE CHECKING

/**
 * Check if types are compatible
 * Used for schema validation
 */
export function isCompatibleType(actual: string, expected: string): boolean {
    if (expected === 'any') return true;
    if (expected === actual) return true;
    if (expected === 'number' && (actual === 'number' || actual === 'bigint')) return true;
    if (expected === 'text' && actual === 'string') return true;
    return false;
}

// STRING UTILITIES

/**
 * Slugify a text string
 * Converts to lowercase, removes diacritics, replaces non-word chars with hyphens
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Escape a value for CSV output
 * Handles quoting and escaping of special characters
 */
export function escapeCSV(value: JsonValue | undefined, delimiter: string, quoteAll: boolean): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const needsQuotes = quoteAll || str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
    if (needsQuotes) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// ARRAY UTILITIES

/**
 * Chunk an array into smaller arrays of specified size
 * Useful for batch processing
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Remove duplicate records based on key fields
 */
export function deduplicateRecords(
    records: RecordObject[],
    keyFields: string[],
    keepFirst: boolean = true,
): RecordObject[] {
    const seen = new Map<string, RecordObject>();
    const result: RecordObject[] = [];
    const list = keepFirst ? records : [...records].reverse();

    for (const record of list) {
        const key = keyFields.map(f => String(getFieldValue(record, f) ?? '')).join('|');
        if (!seen.has(key)) {
            seen.set(key, record);
            result.push(record);
        }
    }

    return keepFirst ? result : result.reverse();
}

// VALIDATION UTILITIES

/**
 * Check if a value is empty (null, undefined, or empty string)
 */
export function isEmpty(value: JsonValue | undefined): boolean {
    return value === null || value === undefined || value === '';
}

/**
 * Validate required fields in a record
 * Returns array of missing field names
 */
export function validateRequiredFields(record: RecordObject, requiredFields: string[]): string[] {
    const missing: string[] = [];
    for (const field of requiredFields) {
        const value = getFieldValue(record, field);
        if (isEmpty(value)) {
            missing.push(field);
        }
    }
    return missing;
}
