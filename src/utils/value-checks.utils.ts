import { JsonValue } from '../types';

/** Checks for null, undefined, empty/whitespace strings, and empty arrays. */
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

export function isNullOrUndefined(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function isPresent<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}
