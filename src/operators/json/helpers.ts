import { JsonObject } from '../types';
import { getNestedValue, setNestedValue, removeNestedValue, deepClone } from '../helpers';

export function applyParseJson(
    record: JsonObject,
    source: string,
    target?: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            setNestedValue(result, target || source, parsed);
        } catch {
            // Keep original value if parse fails
        }
    }

    return result;
}

export function applyStringifyJson(
    record: JsonObject,
    source: string,
    target?: string,
    pretty = false,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (value !== undefined && value !== null) {
        try {
            const stringified = pretty
                ? JSON.stringify(value, null, 2)
                : JSON.stringify(value);
            setNestedValue(result, target || source, stringified);
        } catch {
            // Keep original value if stringify fails
        }
    }

    return result;
}

export function applyPick(
    record: JsonObject,
    fields: string[],
): JsonObject {
    const result: JsonObject = {};

    for (const field of fields) {
        const value = getNestedValue(record, field);
        if (value !== undefined) {
            setNestedValue(result, field, deepClone(value));
        }
    }

    return result;
}

export function applyOmit(
    record: JsonObject,
    fields: string[],
): JsonObject {
    const result = deepClone(record);

    for (const field of fields) {
        removeNestedValue(result, field);
    }

    return result;
}
