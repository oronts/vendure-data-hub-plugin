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

function assertSafePath(path: string): string[] {
    const parts = path.split('.');
    if (!path || parts.some(part => !part || DANGEROUS_KEYS.has(part))) {
        throw new Error(`Invalid object path "${path}"`);
    }
    return parts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Return a copy with a dot-notation path updated without mutating the input.
 * Only objects along the changed path are cloned.
 */
export function setNestedValue<T extends Record<string, unknown>>(
    obj: T,
    path: string,
    value: unknown,
): T {
    const parts = assertSafePath(path);
    const root: Record<string, unknown> = { ...obj };
    let source: Record<string, unknown> = obj;
    let target = root;

    for (const part of parts.slice(0, -1)) {
        const sourceChild = source[part];
        const child = isRecord(sourceChild) ? { ...sourceChild } : {};
        target[part] = child;
        source = isRecord(sourceChild) ? sourceChild : {};
        target = child;
    }

    target[parts[parts.length - 1]] = value;
    return root as T;
}
