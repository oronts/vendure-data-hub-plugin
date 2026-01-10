/**
 * Record Transforms
 *
 * Record-level transform operations.
 * Handles conditional transforms, coalesce, default values,
 * and array operations that depend on record context.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue, JsonObject } from '../../types/index';
import { getNestedValue, evaluateCondition, evaluateExpression } from '../helpers/expression-eval';

// CONDITIONAL TRANSFORMS

/**
 * Apply if-else transform
 * Returns thenValue if condition is true, elseValue otherwise
 */
export function applyIfElse(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (config.condition) {
        const conditionResult = evaluateCondition(config.condition, value, record);
        return conditionResult ? (config.thenValue ?? null) : (config.elseValue ?? null);
    }
    return value;
}

/**
 * Apply coalesce transform (return first non-null value)
 * Checks current value, then fallback fields, then default
 */
export function applyCoalesce(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (value !== null && value !== undefined && value !== '') return value;
    if (config.fields && record) {
        for (const field of config.fields) {
            const fieldValue = getNestedValue(record, field);
            if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
                return fieldValue;
            }
        }
    }
    return config.defaultValue ?? null;
}

/**
 * Apply default transform
 * Returns default value if current value is null/undefined/empty
 */
export function applyDefault(value: JsonValue, config: TransformConfig): JsonValue {
    if (value === null || value === undefined || value === '') {
        return config.defaultValue ?? null;
    }
    return value;
}

// ARRAY TRANSFORMS WITH RECORD CONTEXT

/**
 * Apply filter transform (filter array by condition)
 * Evaluates condition for each element using record context
 */
export function applyFilter(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (Array.isArray(value) && config.expression) {
        return value.filter(item => evaluateCondition(config.expression!, item, record));
    }
    return value;
}

/**
 * Apply map array transform (transform each element)
 * Evaluates expression for each element using record context
 */
export function applyMapArray(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (Array.isArray(value) && config.expression) {
        return value.map(item => evaluateExpression(config.expression!, item, record));
    }
    return value;
}
