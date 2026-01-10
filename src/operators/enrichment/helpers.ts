import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, hasNestedValue, deepClone } from '../helpers';

export function applyLookup(
    record: JsonObject,
    source: string,
    map: Record<string, JsonValue>,
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);

    let lookupResult: JsonValue;
    if (sourceValue !== undefined && sourceValue !== null) {
        const key = String(sourceValue);
        lookupResult = map[key] ?? defaultValue ?? null;
    } else {
        lookupResult = defaultValue ?? null;
    }

    setNestedValue(result, target, lookupResult);
    return result;
}

export function applyEnrich(
    record: JsonObject,
    setFields?: Record<string, JsonValue>,
    defaultFields?: Record<string, JsonValue>,
): JsonObject {
    const result = deepClone(record);

    // Apply defaults first (only if field doesn't exist or is null)
    if (defaultFields) {
        for (const [path, value] of Object.entries(defaultFields)) {
            if (!hasNestedValue(result, path)) {
                setNestedValue(result, path, value);
            } else {
                const current = getNestedValue(result, path);
                if (current === null || current === undefined) {
                    setNestedValue(result, path, value);
                }
            }
        }
    }

    // Apply set fields (always overwrite)
    if (setFields) {
        for (const [path, value] of Object.entries(setFields)) {
            setNestedValue(result, path, value);
        }
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

    let foundValue: JsonValue = null;
    for (const path of paths) {
        const value = getNestedValue(record, path);
        if (value !== null && value !== undefined && value !== '') {
            foundValue = value;
            break;
        }
    }

    if (foundValue === null && defaultValue !== undefined) {
        foundValue = defaultValue;
    }

    setNestedValue(result, target, foundValue);
    return result;
}

export function applyDefault(
    record: JsonObject,
    path: string,
    defaultValue: JsonValue,
): JsonObject {
    const result = deepClone(record);
    const currentValue = getNestedValue(record, path);

    if (currentValue === null || currentValue === undefined) {
        setNestedValue(result, path, defaultValue);
    }

    return result;
}
