import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone, compare, simpleHash } from '../helpers';
import { OperatorCondition } from '../types';
import { SwitchCase } from './types';

/**
 * Filter action type for operator use (lowercase to match operator schema options).
 * Note: Different from FilterAction enum which uses SCREAMING_SNAKE_CASE for GraphQL.
 */
type FilterActionType = 'keep' | 'drop';

export function evaluateCondition(
    record: JsonObject,
    condition: OperatorCondition,
): boolean {
    const fieldValue = getNestedValue(record, condition.field);
    const operator = condition.operator ?? 'eq';
    return compare(fieldValue ?? null, operator, condition.value ?? null);
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
        if (looseEquals(sourceValue, switchCase.value)) {
            return switchCase.result;
        }
    }
    return defaultValue ?? null;
}

function looseEquals(a: JsonValue, b: JsonValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a === typeof b) return a === b;
    const leftString = String(a);
    const rightString = String(b);
    return leftString === rightString;
}

export function filterRecords(
    records: readonly JsonObject[],
    conditions: OperatorCondition[],
    action: FilterActionType,
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
        const subset: JsonObject = {};
        for (const path of includePaths) {
            const value = getNestedValue(record, path);
            if (value !== undefined) {
                setNestedValue(subset, path, value);
            }
        }
        dataToHash = subset;
    } else if (excludePaths && excludePaths.length > 0) {
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
