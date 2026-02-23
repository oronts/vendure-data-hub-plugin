/**
 * Keys that must never be traversed to prevent prototype pollution.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Read a value from a nested object using a dot-notation path.
 * Example: getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 *
 * This is a lightweight, shared implementation usable by both
 * backend (src/) and frontend (dashboard/) code.
 * Includes prototype pollution guards matching src/utils/object-path.utils.ts.
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!obj || !path) {
        return undefined;
    }
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (DANGEROUS_KEYS.has(part)) return undefined;
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}
