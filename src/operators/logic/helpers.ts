import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone, compare, simpleHash } from '../helpers';
import { OperatorCondition } from '../types';
import { SwitchCase } from './types';

export function evaluateCondition(
    record: JsonObject,
    condition: OperatorCondition,
): boolean {
    const fieldValue = getNestedValue(record, condition.field);
    return compare(fieldValue ?? null, condition.cmp, condition.value ?? null);
}

export function evaluateConditions(
    record: JsonObject,
    conditions: OperatorCondition[],
): boolean {
    for (const condition of conditions) {
        if (!evaluateCondition(record, condition)) {
            return false;
        }
    }
    return true;
}

export function evaluateSwitch(
    sourceValue: JsonValue,
    cases: SwitchCase[],
    defaultValue?: JsonValue,
): JsonValue {
    for (const switchCase of cases) {
        if (sourceValue === switchCase.value) {
            return switchCase.result;
        }
    }
    return defaultValue ?? null;
}

export function filterRecords(
    records: readonly JsonObject[],
    conditions: OperatorCondition[],
    action: 'keep' | 'drop',
): JsonObject[] {
    return records.filter(record => {
        const matches = evaluateConditions(record, conditions);
        return action === 'keep' ? matches : !matches;
    });
}

export function applyIfThenElse(
    record: JsonObject,
    condition: OperatorCondition,
    thenValue: JsonValue,
    elseValue: JsonValue | undefined,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const matches = evaluateCondition(record, condition);
    const value = matches ? thenValue : (elseValue ?? null);
    setNestedValue(result, target, value);
    return result;
}

export function applySwitch(
    record: JsonObject,
    source: string,
    cases: SwitchCase[],
    defaultValue: JsonValue | undefined,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);
    const value = evaluateSwitch(sourceValue ?? null, cases, defaultValue);
    setNestedValue(result, target, value);
    return result;
}

export function calculateRecordHash(
    record: JsonObject,
    includePaths?: string[],
    excludePaths?: string[],
): string {
    let dataToHash: JsonValue;

    if (includePaths && includePaths.length > 0) {
        // Only include specified paths
        const subset: JsonObject = {};
        for (const path of includePaths) {
            const value = getNestedValue(record, path);
            if (value !== undefined) {
                setNestedValue(subset, path, value);
            }
        }
        dataToHash = subset;
    } else if (excludePaths && excludePaths.length > 0) {
        // Exclude specified paths
        const cloned = deepClone(record);
        for (const path of excludePaths) {
            const parts = path.split('.');
            let current: JsonObject = cloned;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (typeof current[part] !== 'object' || current[part] === null) {
                    break;
                }
                current = current[part] as JsonObject;
            }
            delete current[parts[parts.length - 1]];
        }
        dataToHash = cloned;
    } else {
        dataToHash = record;
    }

    return simpleHash(dataToHash);
}

/**
 * Apply coalesce operation - returns first non-null value from multiple fields.
 */
export function applyCoalesce(
    record: JsonObject,
    sources: string[],
    target: string,
    defaultValue?: JsonValue,
): JsonObject {
    const result = deepClone(record);

    for (const source of sources) {
        const value = getNestedValue(record, source);
        if (value !== null && value !== undefined) {
            setNestedValue(result, target, value);
            return result;
        }
    }

    // All sources were null/undefined - use default value
    setNestedValue(result, target, defaultValue ?? null);
    return result;
}

/**
 * Apply lookup operation - maps a value using a static lookup table.
 */
export function applyLookup(
    record: JsonObject,
    source: string,
    target: string,
    mappings: Array<{ key: JsonValue; value: JsonValue }>,
    defaultValue?: JsonValue,
    caseInsensitive = false,
): JsonObject {
    const result = deepClone(record);
    const sourceValue = getNestedValue(record, source);

    // Find matching mapping
    for (const mapping of mappings) {
        let matches = false;

        if (caseInsensitive &&
            typeof sourceValue === 'string' &&
            typeof mapping.key === 'string') {
            matches = sourceValue.toLowerCase() === mapping.key.toLowerCase();
        } else {
            matches = sourceValue === mapping.key;
        }

        if (matches) {
            setNestedValue(result, target, mapping.value);
            return result;
        }
    }

    // No match found - use default value
    setNestedValue(result, target, defaultValue ?? null);
    return result;
}
