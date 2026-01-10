/**
 * Validators Utility
 * Common validation functions for data validation
 */

// =============================================================================
// BASIC VALIDATORS
// =============================================================================

/**
 * Check if a value is empty (null, undefined, empty string, or empty array)
 */
export function isEmpty(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Check if a value is not empty
 */
export function isNotEmpty(value: any): boolean {
    return !isEmpty(value);
}

/**
 * Check if a value is a valid number
 */
export function isNumber(value: any): boolean {
    if (typeof value === 'number') return !isNaN(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return false;
        return !isNaN(Number(trimmed));
    }
    return false;
}

/**
 * Check if a value is a valid integer
 */
export function isInteger(value: any): boolean {
    if (!isNumber(value)) return false;
    const num = Number(value);
    return Number.isInteger(num);
}

/**
 * Check if a value is a valid boolean
 */
export function isBoolean(value: any): boolean {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return ['true', 'false', '1', '0', 'yes', 'no'].includes(lower);
    }
    return value === 1 || value === 0;
}

// =============================================================================
// STRING VALIDATORS
// =============================================================================

/**
 * Check if a value is a valid email address
 */
export function isEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}

/**
 * Check if a value is a valid URL
 */
export function isURL(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a value matches a pattern
 */
export function matchesPattern(value: string, pattern: RegExp | string): boolean {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return regex.test(value);
}

/**
 * Check if a string has a minimum length
 */
export function hasMinLength(value: string, minLength: number): boolean {
    return value.length >= minLength;
}

/**
 * Check if a string has a maximum length
 */
export function hasMaxLength(value: string, maxLength: number): boolean {
    return value.length <= maxLength;
}

// =============================================================================
// NUMBER VALIDATORS
// =============================================================================

/**
 * Check if a number is within a range
 */
export function isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
}

/**
 * Check if a number is greater than a value
 */
export function isGreaterThan(value: number, min: number): boolean {
    return value > min;
}

/**
 * Check if a number is less than a value
 */
export function isLessThan(value: number, max: number): boolean {
    return value < max;
}

/**
 * Check if a number is positive
 */
export function isPositive(value: number): boolean {
    return value > 0;
}

/**
 * Check if a number is negative
 */
export function isNegative(value: number): boolean {
    return value < 0;
}

// =============================================================================
// DATE VALIDATORS
// =============================================================================

/**
 * Check if a value is a valid date
 */
export function isDate(value: any): boolean {
    if (value instanceof Date) return !isNaN(value.getTime());
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
    return false;
}

/**
 * Check if a date is in the past
 */
export function isPastDate(value: Date | string | number): boolean {
    const date = value instanceof Date ? value : new Date(value);
    return date.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(value: Date | string | number): boolean {
    const date = value instanceof Date ? value : new Date(value);
    return date.getTime() > Date.now();
}

// =============================================================================
// ARRAY VALIDATORS
// =============================================================================

/**
 * Check if a value is in a list of allowed values
 */
export function isOneOf<T>(value: T, allowedValues: T[]): boolean {
    return allowedValues.includes(value);
}

/**
 * Check if all values in an array are unique
 */
export function areUnique(values: any[]): boolean {
    return new Set(values).size === values.length;
}

/**
 * Check if an array has a minimum number of items
 */
export function hasMinItems(arr: any[], minItems: number): boolean {
    return arr.length >= minItems;
}

/**
 * Check if an array has a maximum number of items
 */
export function hasMaxItems(arr: any[], maxItems: number): boolean {
    return arr.length <= maxItems;
}

// =============================================================================
// RECORD VALIDATION
// =============================================================================

export interface ValidationRule {
    field: string;
    rule: 'required' | 'email' | 'url' | 'number' | 'integer' | 'boolean' | 'date' | 'pattern' | 'minLength' | 'maxLength' | 'min' | 'max' | 'oneOf';
    value?: any;
    message?: string;
}

export interface ValidationError {
    field: string;
    rule: string;
    message: string;
}

/**
 * Validate a record against a set of rules
 */
export function validateRecord(record: Record<string, any>, rules: ValidationRule[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
        const value = record[rule.field];
        let isValid = true;

        switch (rule.rule) {
            case 'required':
                isValid = isNotEmpty(value);
                break;
            case 'email':
                isValid = isEmpty(value) || isEmail(String(value));
                break;
            case 'url':
                isValid = isEmpty(value) || isURL(String(value));
                break;
            case 'number':
                isValid = isEmpty(value) || isNumber(value);
                break;
            case 'integer':
                isValid = isEmpty(value) || isInteger(value);
                break;
            case 'boolean':
                isValid = isEmpty(value) || isBoolean(value);
                break;
            case 'date':
                isValid = isEmpty(value) || isDate(value);
                break;
            case 'pattern':
                isValid = isEmpty(value) || matchesPattern(String(value), rule.value);
                break;
            case 'minLength':
                isValid = isEmpty(value) || hasMinLength(String(value), rule.value);
                break;
            case 'maxLength':
                isValid = isEmpty(value) || hasMaxLength(String(value), rule.value);
                break;
            case 'min':
                isValid = isEmpty(value) || Number(value) >= rule.value;
                break;
            case 'max':
                isValid = isEmpty(value) || Number(value) <= rule.value;
                break;
            case 'oneOf':
                isValid = isEmpty(value) || isOneOf(value, rule.value);
                break;
        }

        if (!isValid) {
            errors.push({
                field: rule.field,
                rule: rule.rule,
                message: rule.message || getDefaultErrorMessage(rule),
            });
        }
    }

    return errors;
}

function getDefaultErrorMessage(rule: ValidationRule): string {
    switch (rule.rule) {
        case 'required':
            return `${rule.field} is required`;
        case 'email':
            return `${rule.field} must be a valid email address`;
        case 'url':
            return `${rule.field} must be a valid URL`;
        case 'number':
            return `${rule.field} must be a number`;
        case 'integer':
            return `${rule.field} must be an integer`;
        case 'boolean':
            return `${rule.field} must be a boolean`;
        case 'date':
            return `${rule.field} must be a valid date`;
        case 'pattern':
            return `${rule.field} has an invalid format`;
        case 'minLength':
            return `${rule.field} must be at least ${rule.value} characters`;
        case 'maxLength':
            return `${rule.field} must be at most ${rule.value} characters`;
        case 'min':
            return `${rule.field} must be at least ${rule.value}`;
        case 'max':
            return `${rule.field} must be at most ${rule.value}`;
        case 'oneOf':
            return `${rule.field} must be one of: ${rule.value.join(', ')}`;
        default:
            return `${rule.field} is invalid`;
    }
}

/**
 * Validate multiple records and return all errors
 */
export function validateRecords(records: Record<string, any>[], rules: ValidationRule[]): { rowIndex: number; errors: ValidationError[] }[] {
    const allErrors: { rowIndex: number; errors: ValidationError[] }[] = [];

    records.forEach((record, index) => {
        const errors = validateRecord(record, rules);
        if (errors.length > 0) {
            allErrors.push({ rowIndex: index, errors });
        }
    });

    return allErrors;
}
