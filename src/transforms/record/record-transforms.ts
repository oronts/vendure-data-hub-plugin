/**
 * Record Transforms
 *
 * Record-level transform operations for conditional transforms,
 * coalesce, default values, and array operations that depend on record context.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue, JsonObject } from '../../types/index';
import { getNestedValue, evaluateCondition, evaluateExpression } from '../helpers/expression-eval';

// CONDITIONAL TRANSFORMS

/**
 * Apply if-else transform
 * Returns thenValue if condition is true, elseValue otherwise
 *
 * @param value - The current value to evaluate
 * @param config - Transform configuration with condition, thenValue, and elseValue
 * @param record - Optional record context for field access in conditions
 * @returns thenValue, elseValue, or original value if no condition
 */
export function applyIfElse(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (config.condition != null) {
        const conditionResult = evaluateCondition(config.condition, value, record);
        return conditionResult ? (config.thenValue ?? null) : (config.elseValue ?? null);
    }
    return value;
}

/**
 * Check if a value is considered empty (null, undefined, or empty string)
 *
 * @param value - The value to check
 * @returns True if the value is empty
 */
function isEmpty(value: JsonValue): boolean {
    return value === null || value === undefined || value === '';
}

/**
 * Apply coalesce transform (return first non-null value)
 * Checks current value, then fallback fields, then default
 *
 * @param value - The current value to check
 * @param config - Transform configuration with fields array and defaultValue
 * @param record - Optional record context for field access
 * @returns First non-empty value found, or defaultValue, or null
 */
export function applyCoalesce(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    // Return current value if not empty
    if (!isEmpty(value)) {
        return value;
    }

    // Check fallback fields from record
    if (config.fields != null && record != null) {
        for (const field of config.fields) {
            const fieldValue = getNestedValue(record, field) ?? null;
            if (!isEmpty(fieldValue)) {
                return fieldValue;
            }
        }
    }

    return config.defaultValue ?? null;
}

/**
 * Apply default transform
 * Returns default value if current value is null/undefined/empty
 *
 * @param value - The current value to check
 * @param config - Transform configuration with defaultValue
 * @returns Original value or defaultValue if empty
 */
export function applyDefault(value: JsonValue, config: TransformConfig): JsonValue {
    if (isEmpty(value)) {
        return config.defaultValue ?? null;
    }
    return value;
}

// ARRAY TRANSFORMS WITH RECORD CONTEXT

/**
 * Apply filter transform (filter array by condition)
 * Evaluates condition for each element using record context
 *
 * @param value - The array to filter
 * @param config - Transform configuration with expression for filtering
 * @param record - Optional record context for field access in conditions
 * @returns Filtered array or original value if not an array
 */
export function applyFilter(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (!Array.isArray(value) || config.expression == null) {
        return value;
    }

    const expression = config.expression;
    return value.filter(item => evaluateCondition(expression, item, record));
}

/**
 * Apply map array transform (transform each element)
 * Evaluates expression for each element using record context
 *
 * @param value - The array to transform
 * @param config - Transform configuration with expression for mapping
 * @param record - Optional record context for field access in expressions
 * @returns Transformed array or original value if not an array
 */
export function applyMapArray(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (!Array.isArray(value) || config.expression == null) {
        return value;
    }

    const expression = config.expression;
    return value.map(item => evaluateExpression(expression, item, record));
}
