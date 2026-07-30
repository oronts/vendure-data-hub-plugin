import type { JsonObject, JsonValue } from '../types';
import {
    deepClone,
    getNestedValue,
    hasNestedValue,
    setNestedValue,
} from '../helpers';

export function applyLookup(
    record: JsonObject,
    source: string,
    map: Record<string, JsonValue>,
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);
    const lookupResult = sourceValue == null
        ? defaultValue ?? null
        : map[String(sourceValue)] ?? defaultValue ?? null;
    setNestedValue(result, target, lookupResult);
    return result;
}

export function applyEnrich(
    record: JsonObject,
    setFields?: Record<string, JsonValue>,
    defaultFields?: Record<string, JsonValue>,
): JsonObject {
    const result = deepClone(record);
    for (const [path, value] of Object.entries(defaultFields ?? {})) {
        const current = getNestedValue(result, path);
        if (!hasNestedValue(result, path) || current == null) {
            setNestedValue(result, path, value);
        }
    }
    for (const [path, value] of Object.entries(setFields ?? {})) {
        setNestedValue(result, path, value);
    }
    return result;
}

export function applyCoalesce(
    record: JsonObject,
    paths: string[],
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const value = paths
        .map(path => getNestedValue(record, path))
        .find(candidate => candidate != null && candidate !== '');
    setNestedValue(result, target, value ?? defaultValue ?? null);
    return result;
}

export function applyDefault(
    record: JsonObject,
    path: string,
    defaultValue: JsonValue,
): JsonObject {
    const result = deepClone(record);
    if (getNestedValue(record, path) == null) {
        setNestedValue(result, path, defaultValue);
    }
    return result;
}
