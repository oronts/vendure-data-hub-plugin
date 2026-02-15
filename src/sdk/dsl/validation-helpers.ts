/**
 * Shared validation helpers for DSL builders.
 */

export function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

export function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(`${fieldName} must be a non-empty array`);
    }
}
