import { JsonObject } from '../types';
import { getNestedValue, setNestedValue, deepClone, flattenArray, uniqueArray } from '../helpers';
import { AggregationOp } from './types';

export function computeAggregate(values: number[], op: AggregationOp): number | null {
    if (values.length === 0) {
        return op === 'count' ? 0 : null;
    }

    switch (op) {
        case 'count':
            return values.length;
        case 'sum':
            return values.reduce((a, b) => a + b, 0);
        case 'avg':
            return values.reduce((a, b) => a + b, 0) / values.length;
        case 'min':
            return values.reduce((a, b) => Math.min(a, b), Infinity);
        case 'max':
            return values.reduce((a, b) => Math.max(a, b), -Infinity);
        case 'first':
            return values[0];
        case 'last':
            return values[values.length - 1];
        default:
            return null;
    }
}

export function applyAggregate(
    records: readonly JsonObject[],
    op: AggregationOp,
    source: string | undefined,
    target: string,
): JsonObject[] {
    // Collect values
    const values: number[] = [];
    for (const record of records) {
        if (op === 'count') {
            values.push(1);
        } else if (source) {
            const val = getNestedValue(record, source);
            if (typeof val === 'number') {
                values.push(val);
            }
        }
    }

    const aggregateResult = computeAggregate(values, op);

    // Set result on each record
    return records.map(record => {
        const result = deepClone(record);
        setNestedValue(result, target, aggregateResult);
        return result;
    });
}

export function applyCount(
    record: JsonObject,
    source: string,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    let count: number;
    if (Array.isArray(value)) {
        count = value.length;
    } else if (typeof value === 'string') {
        count = value.length;
    } else {
        count = 0;
    }

    setNestedValue(result, target, count);
    return result;
}

export function applyUnique(
    record: JsonObject,
    source: string,
    target: string | undefined,
    byKey?: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (Array.isArray(value)) {
        const unique = uniqueArray(value, byKey);
        setNestedValue(result, target || source, unique);
    }

    return result;
}

export function applyFlatten(
    record: JsonObject,
    source: string,
    target: string | undefined,
    depth = 1,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (Array.isArray(value)) {
        const flattened = flattenArray(value, depth);
        setNestedValue(result, target || source, flattened);
    }

    return result;
}

export function applyFirst(
    record: JsonObject,
    source: string,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (Array.isArray(value) && value.length > 0) {
        setNestedValue(result, target, value[0]);
    } else {
        setNestedValue(result, target, null);
    }

    return result;
}

export function applyLast(
    record: JsonObject,
    source: string,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (Array.isArray(value) && value.length > 0) {
        setNestedValue(result, target, value[value.length - 1]);
    } else {
        setNestedValue(result, target, null);
    }

    return result;
}

/**
 * Expand an array field into multiple records.
 * Each array element becomes a separate record.
 * Parent fields can be merged or selectively included.
 */
export function applyExpand(
    record: JsonObject,
    path: string,
    mergeParent: boolean,
    parentFields?: Record<string, string>,
): JsonObject[] {
    const arrayValue = getNestedValue(record, path);

    if (!Array.isArray(arrayValue) || arrayValue.length === 0) {
        // Return empty array or single record based on mergeParent
        return mergeParent ? [deepClone(record)] : [];
    }

    const results: JsonObject[] = [];

    for (const element of arrayValue) {
        let newRecord: JsonObject;

        if (mergeParent) {
            newRecord = deepClone(record);
            try {
                const parts = path.split('.');
                let cur: unknown = newRecord;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (cur == null || typeof cur !== 'object') break;
                    cur = (cur as Record<string, unknown>)[parts[i]];
                }
                if (cur != null && typeof cur === 'object') {
                    delete (cur as Record<string, unknown>)[parts[parts.length - 1]];
                }
            } catch {
                // Ignore deletion errors
            }

            if (element && typeof element === 'object' && !Array.isArray(element)) {
                Object.assign(newRecord, element);
            } else {
                setNestedValue(newRecord, '_item', element);
            }
        } else if (parentFields) {
            if (element && typeof element === 'object' && !Array.isArray(element)) {
                newRecord = deepClone(element) as JsonObject;
            } else {
                newRecord = { _item: element };
            }

            // Add selected parent fields
            for (const [targetField, sourceField] of Object.entries(parentFields)) {
                const value = getNestedValue(record, sourceField);
                if (value !== undefined) {
                    setNestedValue(newRecord, targetField, deepClone(value));
                }
            }
        } else {
            // Just the element itself
            if (element && typeof element === 'object' && !Array.isArray(element)) {
                newRecord = deepClone(element) as JsonObject;
            } else {
                newRecord = { _item: element };
            }
        }

        results.push(newRecord);
    }

    return results;
}
