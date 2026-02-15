import { JsonValue, JsonObject } from '../types';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

    const parts = path.split('.');
    let current: JsonObject = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (DANGEROUS_KEYS.has(part)) {
            return;
        }
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            current[part] = {};
        }
        current = current[part] as JsonObject;
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
        result[key] = deepClone((value as JsonObject)[key]);
    }
    return result as T;
}

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

export function omitPaths(obj: JsonObject, paths: string[]): JsonObject {
    const clone = deepClone(obj);
    for (const path of paths) {
        removeNestedValue(clone, path);
    }
    return clone;
}

function getAllPaths(obj: JsonObject, prefix: string = '', maxDepth: number = 32): string[] {
    if (maxDepth <= 0) {
        return prefix ? [prefix] : [];
    }

    const paths: string[] = [];

    for (const key of Object.keys(obj)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        const currentPath = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            paths.push(...getAllPaths(value as JsonObject, currentPath, maxDepth - 1));
        } else {
            paths.push(currentPath);
        }
    }

    return paths;
}
