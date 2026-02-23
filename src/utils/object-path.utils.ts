import { JsonValue, JsonObject } from '../types';

export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getNestedValue(obj: JsonObject | unknown, path: string): JsonValue | undefined {
    if (!obj || !path) {
        return undefined;
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (DANGEROUS_KEYS.has(part)) {
            return undefined;
        }
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

export function setNestedValue(obj: JsonObject, path: string, value: JsonValue): void {
    if (!path) {
        return;
    }
    if (value === undefined) {
        return; // Don't set undefined values
    }

    // Normalize bracket notation (e.g., "items[0].name" -> "items.0.name")
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    let current: JsonObject = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (DANGEROUS_KEYS.has(part)) {
            return;
        }
        const nextPart = parts[i + 1];
        const isNextArray = /^\d+$/.test(nextPart);

        if (!(part in current)) {
            current[part] = isNextArray ? [] : {};
        }
        const next = current[part];
        if (Array.isArray(next)) {
            // The next segment must be a numeric array index
            if (!isNextArray) {
                return;
            }
            const idx = Number(nextPart);
            // Check if the numeric index is the LAST segment (direct array element assignment)
            if (i + 1 === parts.length - 1) {
                // Final segment is the array index - assign value directly
                next[idx] = value;
                return;
            }
            // Intermediate array traversal: ensure slot exists for further nesting
            if (next[idx] === undefined || next[idx] === null) {
                const afterNext = parts[i + 2];
                next[idx] = (afterNext !== undefined && /^\d+$/.test(afterNext)) ? [] : {};
            }
            const slot = next[idx];
            if (typeof slot !== 'object' || slot === null) {
                return;
            }
            current = slot as JsonObject;
            i++; // skip the numeric index segment
        } else if (typeof next === 'object' && next !== null) {
            current = next as JsonObject;
        } else {
            return;
        }
    }

    const lastPart = parts[parts.length - 1];
    if (DANGEROUS_KEYS.has(lastPart)) {
        return;
    }
    current[lastPart] = value;
}

export function removeNestedValue(obj: JsonObject, path: string): void {
    if (!path) {
        return;
    }

    const parts = path.split('.');
    let current: JsonObject = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (DANGEROUS_KEYS.has(part)) {
            return;
        }
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            return; // Path doesn't exist
        }
        current = current[part] as JsonObject;
    }

    const lastPart = parts[parts.length - 1];
    if (DANGEROUS_KEYS.has(lastPart)) {
        return;
    }
    delete current[lastPart];
}

export function hasNestedValue(obj: JsonObject, path: string): boolean {
    if (!path) {
        return false;
    }

    const parts = path.split('.');
    let current: JsonValue = obj;

    for (const part of parts) {
        if (DANGEROUS_KEYS.has(part)) {
            return false;
        }
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

export function deepClone<T extends JsonValue>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => deepClone(item)) as T;
    }

    const result: JsonObject = {};
    for (const key of Object.keys(value)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        result[key] = deepClone((value as JsonObject)[key]);
    }
    return result as T;
}

