import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone } from '../helpers';
import { ValidationError } from './types';
import { VALIDATION_RULE } from '../constants';
import { isEmpty } from '../../utils/value-checks.utils';

// Re-export isEmpty for consumers of this module
export { isEmpty };

export function validateRequired(
    record: JsonObject,
    fields: string[],
): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of fields) {
        const value = getNestedValue(record, field);
        if (isEmpty(value)) {
            errors.push({
                field,
                message: `Field '${field}' is required`,
                rule: VALIDATION_RULE.REQUIRED,
            });
        }
    }

    return errors;
}

export function validateFormat(
    record: JsonObject,
    field: string,
    pattern: string,
    errorMessage?: string,
): ValidationError | null {
    const value = getNestedValue(record, field);

    // Skip validation if field is empty (use validateRequired for that)
    if (isEmpty(value)) {
        return null;
    }

    if (typeof value !== 'string') {
        return {
            field,
            message: errorMessage || `Field '${field}' must be a string for format validation`,
            rule: VALIDATION_RULE.FORMAT,
        };
    }

    try {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
            return {
                field,
                message: errorMessage || `Field '${field}' does not match required format`,
                rule: VALIDATION_RULE.FORMAT,
            };
        }
    } catch {
        return {
            field,
            message: `Invalid regex pattern for field '${field}'`,
            rule: VALIDATION_RULE.FORMAT,
        };
    }

    return null;
}

export function applyValidationErrors(
    record: JsonObject,
    errors: ValidationError[],
    errorField: string,
): JsonObject {
    const result = deepClone(record);

    if (errors.length > 0) {
        const existingErrors = getNestedValue(result, errorField);
        // Convert errors to plain objects for JSON compatibility
        const errorObjects = errors.map(e => ({
            field: e.field,
            message: e.message,
            rule: e.rule,
        }));
        const allErrors = Array.isArray(existingErrors)
            ? [...existingErrors, ...errorObjects]
            : errorObjects;
        setNestedValue(result, errorField, allErrors as JsonValue);
    }

    return result;
}
