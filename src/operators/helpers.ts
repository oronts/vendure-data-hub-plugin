import { JsonValue, JsonObject } from '../types';
import { TRANSFORM_LIMITS } from '../constants/index';

export function getNestedValue(obj: JsonObject, path: string): JsonValue | undefined {
    if (!path) return undefined;

    const parts = path.split('.');
    let current: JsonValue = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object' || Array.isArray(current)) {
            return undefined;
        }
        current = (current as JsonObject)[part];
    }

    return current;
}

export function setNestedValue(obj: JsonObject, path: string, value: JsonValue): void {
    if (!path) return;

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

export function removeNestedValue(obj: JsonObject, path: string): void {
    if (!path) return;

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

export function hasNestedValue(obj: JsonObject, path: string): boolean {
    if (!path) return false;

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

export function compare(
    left: JsonValue,
    operator: string,
    right: JsonValue,
): boolean {
    switch (operator) {
        case 'eq':
            return left === right;
        case 'ne':
            return left !== right;
        case 'gt':
            return typeof left === 'number' && typeof right === 'number' && left > right;
        case 'lt':
            return typeof left === 'number' && typeof right === 'number' && left < right;
        case 'gte':
            return typeof left === 'number' && typeof right === 'number' && left >= right;
        case 'lte':
            return typeof left === 'number' && typeof right === 'number' && left <= right;
        case 'in':
            return Array.isArray(right) && right.includes(left);
        case 'notIn':
            return Array.isArray(right) && !right.includes(left);
        case 'contains':
            return typeof left === 'string' && typeof right === 'string' && left.includes(right);
        case 'notContains':
            return typeof left === 'string' && typeof right === 'string' && !left.includes(right);
        case 'startsWith':
            return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
        case 'endsWith':
            return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);
        case 'regex':
            if (typeof left === 'string' && typeof right === 'string') {
                try {
                    return new RegExp(right).test(left);
                } catch {
                    return false;
                }
            }
            return false;
        case 'exists':
            return left !== undefined && left !== null;
        case 'isNull':
            return left === null || left === undefined;
        default:
            return false;
    }
}

export function evaluateConditions(
    record: JsonObject,
    conditions: Array<{ field: string; cmp: string; value?: JsonValue }>,
): boolean {
    for (const condition of conditions) {
        const fieldValue = getNestedValue(record, condition.field);
        if (!compare(fieldValue ?? null, condition.cmp, condition.value ?? null)) {
            return false;
        }
    }
    return true;
}

export function slugify(text: string, separator = '-'): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, separator)
        .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '')
        .substring(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

export function interpolateTemplate(
    template: string,
    record: JsonObject,
    currentValue?: JsonValue,
): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        if (path === 'value') {
            return String(currentValue ?? '');
        }
        const value = getNestedValue(record, path);
        return String(value ?? '');
    });
}

export function simpleHash(value: JsonValue): string {
    const str = JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

export function flattenArray(arr: JsonValue[], depth = 1): JsonValue[] {
    if (depth < 1) return [...arr];

    return arr.reduce<JsonValue[]>((acc, item) => {
        if (Array.isArray(item)) {
            acc.push(...flattenArray(item, depth - 1));
        } else {
            acc.push(item);
        }
        return acc;
    }, []);
}

export function uniqueArray(arr: JsonValue[], byKey?: string): JsonValue[] {
    if (!byKey) {
        const seen = new Set<string>();
        return arr.filter(item => {
            const key = JSON.stringify(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const seen = new Set<JsonValue>();
    return arr.filter(item => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return true;
        }
        const keyValue = getNestedValue(item as JsonObject, byKey);
        if (seen.has(keyValue ?? null)) return false;
        seen.add(keyValue ?? null);
        return true;
    });
}
