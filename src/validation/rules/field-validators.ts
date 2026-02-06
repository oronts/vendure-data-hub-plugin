/**
 * Field-Level Validators
 *
 * Validation functions for individual field values.
 * Uses constants from ../constants for patterns and limits.
 */

import {
    VALIDATION_PATTERNS,
    FIELD_LIMITS,
    matchesPattern,
    ERROR_MESSAGES,
} from '../../constants/validation';
import {
    LoaderErrorCode,
} from '../../constants/error-codes';
import {
    FieldValidationResult,
    FieldValidationOptions,
} from './types';

export type { FieldValidationResult, FieldValidationOptions };

// CORE VALIDATORS

/**
 * Validates that a value is present (not null, undefined, or empty string)
 */
export function validateRequired(value: unknown): FieldValidationResult {
    if (value === null || value === undefined || value === '') {
        return {
            valid: false,
            error: ERROR_MESSAGES.REQUIRED,
            errorCode: LoaderErrorCode.MISSING_REQUIRED_FIELD,
        };
    }
    return { valid: true, value };
}

/**
 * Validates string length constraints
 */
export function validateStringLength(
    value: string,
    minLength: number = FIELD_LIMITS.CODE_MIN,
    maxLength: number = FIELD_LIMITS.NAME_MAX,
): FieldValidationResult {
    if (typeof value !== 'string') {
        return {
            valid: false,
            error: ERROR_MESSAGES.INVALID_STRING,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (value.length < minLength) {
        return {
            valid: false,
            error: ERROR_MESSAGES.TOO_SHORT(minLength),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    if (value.length > maxLength) {
        return {
            valid: false,
            error: ERROR_MESSAGES.TOO_LONG(maxLength),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
}

/**
 * Validates numeric range constraints
 */
export function validateNumericRange(
    value: number,
    min: number = FIELD_LIMITS.PRICE_MIN,
    max: number = FIELD_LIMITS.PRICE_MAX,
): FieldValidationResult {
    if (typeof value !== 'number' || isNaN(value)) {
        return {
            valid: false,
            error: ERROR_MESSAGES.INVALID_NUMBER,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (value < min) {
        return {
            valid: false,
            error: ERROR_MESSAGES.TOO_SMALL(min),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    if (value > max) {
        return {
            valid: false,
            error: ERROR_MESSAGES.TOO_LARGE(max),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
}

/**
 * Validates a value against a regex pattern
 */
export function validatePattern(
    value: string,
    pattern: RegExp,
    patternName: string = 'pattern',
): FieldValidationResult {
    if (typeof value !== 'string') {
        return {
            valid: false,
            error: ERROR_MESSAGES.INVALID_STRING,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (!matchesPattern(value, pattern)) {
        return {
            valid: false,
            error: ERROR_MESSAGES.PATTERN_MISMATCH(patternName),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
}

// SPECIFIC FIELD VALIDATORS

/**
 * Validates an email address
 */
export function validateEmail(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.EMAIL, 'email');
}

/**
 * Validates a URL
 */
export function validateUrl(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.URL, 'URL');
}

/**
 * Validates a UUID
 */
export function validateUuid(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.UUID, 'UUID');
}

/**
 * Validates a slug (URL-friendly identifier)
 */
export function validateSlug(
    value: string,
    maxLength: number = FIELD_LIMITS.SLUG_MAX,
): FieldValidationResult {
    const patternResult = validatePattern(value, VALIDATION_PATTERNS.SLUG, 'slug');
    if (!patternResult.valid) {
        return patternResult;
    }

    return validateStringLength(value, 1, maxLength);
}

// GENERIC FIELD VALIDATOR

/**
 * Validates a field with the provided options
 */
export function validateField(
    value: unknown,
    options: FieldValidationOptions = {},
): FieldValidationResult {
    const {
        required = false,
        minLength,
        maxLength,
        min,
        max,
        pattern,
        patternName,
        allowNull = false,
        trimWhitespace = true,
        coerce = false,
    } = options;

    // Handle null/undefined
    if (value === null || value === undefined) {
        if (required && !allowNull) {
            return validateRequired(value);
        }
        return { valid: true, value };
    }

    // Handle empty string
    if (value === '' && required) {
        return validateRequired(value);
    }

    // Process string values
    if (typeof value === 'string') {
        let processedValue = value;

        if (trimWhitespace) {
            processedValue = value.trim();
        }

        if (minLength !== undefined || maxLength !== undefined) {
            const lengthResult = validateStringLength(
                processedValue,
                minLength ?? 0,
                maxLength ?? Infinity,
            );
            if (!lengthResult.valid) {
                return lengthResult;
            }
        }

        if (pattern) {
            const patternResult = validatePattern(processedValue, pattern, patternName);
            if (!patternResult.valid) {
                return patternResult;
            }
        }

        return { valid: true, value: processedValue };
    }

    // Process numeric values
    if (typeof value === 'number') {
        if (min !== undefined || max !== undefined) {
            const rangeResult = validateNumericRange(
                value,
                min ?? -Infinity,
                max ?? Infinity,
            );
            if (!rangeResult.valid) {
                return rangeResult;
            }
        }

        return { valid: true, value };
    }

    // Handle coercion
    if (coerce && typeof value === 'string') {
        const parsedValue = parseFloat(value);
        if (!isNaN(parsedValue)) {
            return validateField(parsedValue, { ...options, coerce: false });
        }
    }

    return { valid: true, value };
}
