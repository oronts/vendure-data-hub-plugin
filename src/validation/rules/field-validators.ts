/**
 * Field-Level Validators
 *
 * Provides validation functions for individual field values.
 * Uses constants from ../constants for patterns and limits.
 */

import {
    VALIDATION_PATTERNS,
    FIELD_LIMITS,
    VALIDATION_MESSAGES,
    matchesPattern,
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
            error: VALIDATION_MESSAGES.REQUIRED,
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
            error: 'Value must be a string',
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (value.length < minLength) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.TOO_SHORT(minLength),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    if (value.length > maxLength) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.TOO_LONG(maxLength),
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
            error: VALIDATION_MESSAGES.INVALID_NUMBER,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (value < min) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.TOO_SMALL(min),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    if (value > max) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.TOO_LARGE(max),
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
            error: 'Value must be a string',
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (!matchesPattern(value, pattern)) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.PATTERN_MISMATCH(patternName),
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

/**
 * Validates a SKU
 */
export function validateSku(value: string): FieldValidationResult {
    const patternResult = validatePattern(value, VALIDATION_PATTERNS.SKU, 'SKU');
    if (!patternResult.valid) {
        return patternResult;
    }

    return validateStringLength(value, FIELD_LIMITS.SKU_MIN, FIELD_LIMITS.SKU_MAX);
}

/**
 * Validates an ISO date string
 */
export function validateIsoDate(value: string): FieldValidationResult {
    if (typeof value !== 'string') {
        return {
            valid: false,
            error: 'Value must be a string',
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    const isDateFormat = VALIDATION_PATTERNS.ISO_DATE.test(value);
    const isDateTimeFormat = VALIDATION_PATTERNS.ISO_DATETIME.test(value);

    if (!isDateFormat && !isDateTimeFormat) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.INVALID_DATE,
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.INVALID_DATE,
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
}

/**
 * Validates a currency code (ISO 4217)
 */
export function validateCurrencyCode(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.CURRENCY_CODE, 'currency code');
}

/**
 * Validates a country code (ISO 3166-1 alpha-2)
 */
export function validateCountryCode(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.COUNTRY_CODE, 'country code');
}

/**
 * Validates a language code (ISO 639-1)
 */
export function validateLanguageCode(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.LANGUAGE_CODE, 'language code');
}

/**
 * Validates a phone number
 */
export function validatePhone(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.PHONE, 'phone number');
}

/**
 * Validates a postal/ZIP code
 */
export function validatePostalCode(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.POSTAL_CODE, 'postal code');
}

/**
 * Validates a barcode (EAN/UPC)
 */
export function validateBarcode(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.BARCODE, 'barcode');
}

/**
 * Validates a JSON path expression
 */
export function validateJsonPath(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.JSON_PATH, 'JSON path');
}

/**
 * Validates an SQL identifier
 */
export function validateSqlIdentifier(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.SQL_IDENTIFIER, 'SQL identifier');
}

/**
 * Validates a secret reference
 */
export function validateSecretRef(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.SECRET_REF, 'secret reference');
}

/**
 * Validates an environment variable reference
 */
export function validateEnvVarRef(value: string): FieldValidationResult {
    return validatePattern(value, VALIDATION_PATTERNS.ENV_VAR_REF, 'environment variable');
}

// COMPOSITE VALIDATORS

/**
 * Validates a price value (non-negative integer for minor units)
 */
export function validatePrice(value: number): FieldValidationResult {
    if (!Number.isInteger(value)) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.INVALID_INTEGER,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    return validateNumericRange(value, FIELD_LIMITS.PRICE_MIN, FIELD_LIMITS.PRICE_MAX);
}

/**
 * Validates a quantity value (non-negative integer)
 */
export function validateQuantity(value: number): FieldValidationResult {
    if (!Number.isInteger(value)) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.INVALID_INTEGER,
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    return validateNumericRange(value, FIELD_LIMITS.QUANTITY_MIN, FIELD_LIMITS.QUANTITY_MAX);
}

/**
 * Validates a percentage value (0-100)
 */
export function validatePercentage(value: number): FieldValidationResult {
    return validateNumericRange(value, FIELD_LIMITS.PERCENTAGE_MIN, FIELD_LIMITS.PERCENTAGE_MAX);
}

/**
 * Validates an array does not exceed maximum length
 */
export function validateArrayLength(
    value: unknown[],
    maxLength: number,
): FieldValidationResult {
    if (!Array.isArray(value)) {
        return {
            valid: false,
            error: 'Value must be an array',
            errorCode: LoaderErrorCode.INVALID_FIELD_TYPE,
        };
    }

    if (value.length > maxLength) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.TOO_LARGE(maxLength),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
}

/**
 * Validates that a value is one of the allowed enum values
 */
export function validateEnum(
    value: string,
    allowedValues: readonly string[],
): FieldValidationResult {
    if (!allowedValues.includes(value)) {
        return {
            valid: false,
            error: VALIDATION_MESSAGES.NOT_IN_ENUM([...allowedValues]),
            errorCode: LoaderErrorCode.VALIDATION_FAILED,
        };
    }

    return { valid: true, value };
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
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            return validateField(numValue, { ...options, coerce: false });
        }
    }

    return { valid: true, value };
}
