import { TransformConfig } from '../../types/index';
import { JsonValue, JsonObject } from '../../types/index';
import { getNestedValue, evaluateCondition, evaluateExpression } from '../helpers/expression-eval';

// CONDITIONAL TRANSFORMS

export function applyIfElse(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (config.condition != null) {
        const conditionResult = evaluateCondition(config.condition, value, record);
        return conditionResult ? (config.thenValue ?? null) : (config.elseValue ?? null);
    }
    return value;
}

/** Lightweight nil-or-empty-string check for coalesce logic (intentionally narrower than shared isEmpty). */
function isNilOrEmptyString(value: JsonValue): boolean {
    return value === null || value === undefined || value === '';
}

export function applyCoalesce(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    // Return current value if not empty
    if (!isNilOrEmptyString(value)) {
        return value;
    }

    // Check fallback fields from record
    if (config.fields != null && record != null) {
        for (const field of config.fields) {
            const fieldValue = getNestedValue(record, field) ?? null;
            if (!isNilOrEmptyString(fieldValue)) {
                return fieldValue;
            }
        }
    }

    return config.defaultValue ?? null;
}

export function applyDefault(value: JsonValue, config: TransformConfig): JsonValue {
    if (isNilOrEmptyString(value)) {
        return config.defaultValue ?? null;
    }
    return value;
}

// ARRAY TRANSFORMS WITH RECORD CONTEXT

export function applyFilter(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (!Array.isArray(value) || config.expression == null) {
        return value;
    }

    const expression = config.expression;
    return value.filter(item => evaluateCondition(expression, item, record));
}

export function applyMapArray(value: JsonValue, config: TransformConfig, record?: JsonObject): JsonValue {
    if (!Array.isArray(value) || config.expression == null) {
        return value;
    }

    const expression = config.expression;
    return value.map(item => evaluateExpression(expression, item, record));
}
