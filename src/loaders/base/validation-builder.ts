/**
 * Validation Builder Utility
 *
 * Fluent API for building validation results,
 * consolidating the duplicate validation pattern across all loaders.
 *
 * @module loaders/base
 */

import { EntityValidationResult } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { TARGET_OPERATION } from '../../constants/enums';
import { VALIDATION_ERROR_CODE } from '../../../shared/types/validation.types';
import { isValidEmail } from '../../utils/input-validation.utils';

// Alias for backward compatibility with enum-style usage
const ValidationErrorCode = VALIDATION_ERROR_CODE;

/**
 * Loader-specific validation error structure.
 *
 * This is a simplified version of the shared ValidationError type,
 * optimized for entity loader validation use cases where field and
 * message are always required but rule/severity/context are not needed.
 *
 * @see shared/types/validation.types.ts for the canonical ValidationError type
 */
export interface LoaderValidationError {
    field: string;
    message: string;
    code?: string;
}

/**
 * @deprecated Use LoaderValidationError instead. This alias is provided for backward compatibility.
 */
export type ValidationError = LoaderValidationError;

/**
 * Loader-specific validation warning structure.
 */
export interface LoaderValidationWarning {
    field: string;
    message: string;
}

/**
 * @deprecated Use LoaderValidationWarning instead. This alias is provided for backward compatibility.
 */
export type ValidationWarning = LoaderValidationWarning;

/**
 * Fluent builder for constructing validation results.
 *
 * @example
 * ```typescript
 * const validation = new ValidationBuilder()
 *   .requireString('name', record.name, 'Product name is required')
 *   .requireEmail('email', record.email)
 *   .requireArrayNotEmpty('lines', record.lines, 'At least one line is required')
 *   .addWarningIf(someCondition, 'field', 'This is a warning')
 *   .build();
 * ```
 */
export class ValidationBuilder {
    private errors: LoaderValidationError[] = [];
    private warnings: LoaderValidationWarning[] = [];

    /**
     * Add an error
     */
    addError(field: string, message: string, code?: string): this {
        this.errors.push({ field, message, code });
        return this;
    }

    /**
     * Add a warning
     */
    addWarning(field: string, message: string): this {
        this.warnings.push({ field, message });
        return this;
    }

    /**
     * Add error if condition is true
     */
    addErrorIf(condition: boolean, field: string, message: string, code?: string): this {
        if (condition) {
            this.addError(field, message, code);
        }
        return this;
    }

    /**
     * Add warning if condition is true
     */
    addWarningIf(condition: boolean, field: string, message: string): this {
        if (condition) {
            this.addWarning(field, message);
        }
        return this;
    }

    /**
     * Require a non-empty string field
     */
    requireString(field: string, value: unknown, message?: string): this {
        if (!value || typeof value !== 'string' || value.trim() === '') {
            this.addError(field, message || `${field} is required`, ValidationErrorCode.REQUIRED);
        }
        return this;
    }

    /**
     * Require string only for CREATE or UPSERT operations
     */
    requireStringForCreate(
        field: string,
        value: unknown,
        operation: TargetOperation,
        message?: string,
    ): this {
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            return this.requireString(field, value, message);
        }
        return this;
    }

    /**
     * Require a valid email address
     */
    requireEmail(field: string, value: unknown, message?: string): this {
        if (!value || typeof value !== 'string' || value.trim() === '') {
            this.addError(field, message || 'Email address is required', ValidationErrorCode.REQUIRED);
            return this;
        }
        if (!isValidEmail(value)) {
            this.addError(field, 'Invalid email format', ValidationErrorCode.INVALID_FORMAT);
        }
        return this;
    }

    /**
     * Require email only for CREATE or UPSERT operations
     */
    requireEmailForCreate(
        field: string,
        value: unknown,
        operation: TargetOperation,
        message?: string,
    ): this {
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            return this.requireEmail(field, value, message);
        }
        return this;
    }

    /**
     * Require a non-empty array
     */
    requireArrayNotEmpty(field: string, value: unknown, message?: string): this {
        if (!value || !Array.isArray(value) || value.length === 0) {
            this.addError(field, message || `${field} must not be empty`, ValidationErrorCode.REQUIRED);
        }
        return this;
    }

    /**
     * Require array only for CREATE or UPSERT operations
     */
    requireArrayForCreate(
        field: string,
        value: unknown,
        operation: TargetOperation,
        message?: string,
    ): this {
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            return this.requireArrayNotEmpty(field, value, message);
        }
        return this;
    }

    /**
     * Require a positive number
     */
    requirePositiveNumber(field: string, value: unknown, message?: string): this {
        if (value === undefined || value === null) {
            this.addError(field, message || `${field} is required`, ValidationErrorCode.REQUIRED);
            return this;
        }
        const num = Number(value);
        if (Number.isNaN(num) || num < 0) {
            this.addError(field, message || `${field} must be a positive number`, ValidationErrorCode.INVALID_VALUE);
        }
        return this;
    }

    /**
     * Validate array items with a custom validator
     */
    validateArrayItems<T>(
        field: string,
        items: T[] | undefined,
        validator: (item: T, index: number) => LoaderValidationError[],
    ): this {
        if (!items || !Array.isArray(items)) {
            return this;
        }
        for (let i = 0; i < items.length; i++) {
            const itemErrors = validator(items[i], i);
            for (const error of itemErrors) {
                this.addError(`${field}[${i}].${error.field}`, error.message, error.code);
            }
        }
        return this;
    }

    /**
     * Validate an address structure (common pattern in orders/customers)
     */
    validateAddress(address: AddressInput | undefined, prefix: string): this {
        if (!address) {
            return this;
        }
        if (!address.streetLine1) {
            this.addError(`${prefix}.streetLine1`, 'Street line 1 is required', ValidationErrorCode.REQUIRED);
        }
        if (!address.city) {
            this.addError(`${prefix}.city`, 'City is required', ValidationErrorCode.REQUIRED);
        }
        if (!address.postalCode) {
            this.addError(`${prefix}.postalCode`, 'Postal code is required', ValidationErrorCode.REQUIRED);
        }
        if (!address.countryCode) {
            this.addError(`${prefix}.countryCode`, 'Country code is required', ValidationErrorCode.REQUIRED);
        }
        return this;
    }

    /**
     * Merge errors from another source
     */
    mergeErrors(errors: LoaderValidationError[]): this {
        this.errors.push(...errors);
        return this;
    }

    /**
     * Merge warnings from another source
     */
    mergeWarnings(warnings: LoaderValidationWarning[]): this {
        this.warnings.push(...warnings);
        return this;
    }

    /**
     * Get current errors (useful for conditional logic)
     */
    getErrors(): LoaderValidationError[] {
        return [...this.errors];
    }

    /**
     * Check if validation has errors
     */
    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    /**
     * Build the final validation result
     */
    build(): EntityValidationResult {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
        };
    }
}

/**
 * Address input interface for validation
 */
interface AddressInput {
    streetLine1?: string;
    streetLine2?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    countryCode?: string;
    phoneNumber?: string;
}

export { isValidEmail };

/**
 * Factory function to create a validation result directly
 */
export function createValidationResult(
    errors: LoaderValidationError[] = [],
    warnings: LoaderValidationWarning[] = [],
): EntityValidationResult {
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
