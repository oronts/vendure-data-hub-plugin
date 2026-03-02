/**
 * Validation Builder Utility
 *
 * Fluent API for building validation results with enhanced error context.
 * Consolidates the duplicate validation pattern across all loaders and
 * provides rich error messages with record identifiers and line numbers.
 *
 * @example
 * ```typescript
 * // Basic validation with context
 * const result = new ValidationBuilder()
 *   .withIdentifier(`email="${record.emailAddress}"`)
 *   .withLineNumber(record._lineNumber)
 *   .requireEmail('emailAddress', record.emailAddress)
 *   .requireString('firstName', record.firstName)
 *   .build();
 *
 * // If validation fails, result.errorMessage will be:
 * // Validation failed (email="max@example.com", line: 42)
 * //   Failures:
 * //     - emailAddress: Invalid email format (received: "not-an-email")
 * //     - firstName: Missing required field
 *
 * // Advanced validation with custom format errors
 * const result = new ValidationBuilder()
 *   .withIdentifier(`sku="${record.sku}"`)
 *   .requireString('name', record.name)
 *   .addFormatError('phoneNumber', '+XX-XXX-XXX-XXXX', record.phoneNumber)
 *   .validateArrayItems('addresses', record.addresses, (addr, i) => {
 *     const errors = [];
 *     if (!addr.streetLine1) {
 *       errors.push({ field: 'streetLine1', message: 'Required', code: 'REQUIRED' });
 *     }
 *     return errors;
 *   })
 *   .build();
 *
 * // If validation fails, result.errorMessage will be:
 * // Validation failed (sku="WIDGET-001")
 * //   Failures:
 * //     - phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")
 * //     - addresses[0].streetLine1: Required
 * ```
 *
 * @module loaders/base
 */

import { EntityValidationResult } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { TARGET_OPERATION } from '../../constants/enums';
import { VALIDATION_ERROR_CODE } from '../../../shared/types';
import { isValidEmail } from '../../utils/input-validation.utils';

/**
 * Loader-specific validation error structure.
 *
 * This is a simplified version of the shared ValidationError type,
 * optimized for entity loader validation use cases where field and
 * message are always required but rule/severity/context are not needed.
 *
 * @see shared/types/validation.types.ts ValidationError
 */
export interface LoaderValidationError {
    field: string;
    message: string;
    code?: string;
}

/**
 * Loader-specific validation warning structure.
 */
export interface LoaderValidationWarning {
    field: string;
    message: string;
}

/**
 * Fluent builder for constructing validation results.
 *
 * @example
 * ```typescript
 * const validation = new ValidationBuilder()
 *   .withIdentifier('email="max@example.com"')
 *   .withLineNumber(42)
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
    private recordIdentifier?: string;
    private recordLineNumber?: number;

    /**
     * Extract the source line/row number from a record's metadata fields.
     *
     * Records produced by file extractors (CSV, Excel, etc.) carry `_lineNumber`
     * or `_rowIndex` metadata. This helper reads those fields in a type-safe way,
     * eliminating the `(record as any)._lineNumber || (record as any)._rowIndex`
     * pattern that was duplicated across loaders.
     *
     * @param record - The input record (typed as a generic object)
     * @returns The line number if present, otherwise undefined
     */
    static getLineNumber(record: Record<string, unknown>): number | undefined {
        return (typeof record._lineNumber === 'number' ? record._lineNumber : undefined)
            ?? (typeof record._rowIndex === 'number' ? record._rowIndex : undefined);
    }

    /**
     * Set a human-readable identifier for the record being validated.
     * This will be included in error messages for better context.
     *
     * @param identifier - A descriptive identifier (e.g., 'email="max@example.com"', 'sku="WIDGET-001"')
     * @returns this builder for chaining
     *
     * @example
     * ```typescript
     * new ValidationBuilder()
     *   .withIdentifier(`email="${record.emailAddress}"`)
     *   .requireEmail('emailAddress', record.emailAddress);
     * ```
     */
    withIdentifier(identifier: string): this {
        this.recordIdentifier = identifier;
        return this;
    }

    /**
     * Set the line number in the source data (e.g., CSV row number).
     * This will be included in error messages for better context.
     *
     * @param lineNo - The line number in the source file (1-based)
     * @returns this builder for chaining
     *
     * @example
     * ```typescript
     * new ValidationBuilder()
     *   .withLineNumber(ValidationBuilder.getLineNumber(record))
     *   .requireString('name', record.name);
     * ```
     */
    withLineNumber(lineNo: number | undefined): this {
        if (lineNo !== undefined) {
            this.recordLineNumber = lineNo;
        }
        return this;
    }

    /**
     * Add an error
     */
    addError(field: string, message: string, code?: string): this {
        this.errors.push({ field, message, code });
        return this;
    }

    /**
     * Add a format validation error with expected format and received value.
     * This provides rich context for format mismatches.
     *
     * @param field - Field name
     * @param expectedFormat - Description of the expected format
     * @param receivedValue - The actual value that was received
     * @param code - Optional error code
     *
     * @example
     * ```typescript
     * builder.addFormatError(
     *   'phoneNumber',
     *   '+XX-XXX-XXX-XXXX',
     *   record.phoneNumber,
     *   'INVALID_FORMAT'
     * );
     * // Results in: "phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")"
     * ```
     */
    addFormatError(field: string, expectedFormat: string, receivedValue: unknown, code?: string): this {
        const received = typeof receivedValue === 'string' ? `"${receivedValue}"` : String(receivedValue);
        const message = `Invalid format (expected: ${expectedFormat}, received: ${received})`;
        this.addError(field, message, code || VALIDATION_ERROR_CODE.INVALID_FORMAT);
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
            this.addError(field, message || `${field} is required`, VALIDATION_ERROR_CODE.REQUIRED);
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
            this.addError(field, message || 'Email address is required', VALIDATION_ERROR_CODE.REQUIRED);
            return this;
        }
        if (!isValidEmail(value)) {
            const received = typeof value === 'string' ? `"${value}"` : String(value);
            this.addError(
                field,
                `Invalid email format (received: ${received})`,
                VALIDATION_ERROR_CODE.INVALID_FORMAT
            );
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
            this.addError(field, message || `${field} must not be empty`, VALIDATION_ERROR_CODE.REQUIRED);
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
            this.addError(field, message || `${field} is required`, VALIDATION_ERROR_CODE.REQUIRED);
            return this;
        }
        const num = Number(value);
        if (Number.isNaN(num) || num < 0) {
            const received = typeof value === 'string' ? `"${value}"` : String(value);
            const defaultMsg = `${field} must be a positive number (expected: number >= 0, received: ${received})`;
            this.addError(field, message || defaultMsg, VALIDATION_ERROR_CODE.INVALID_VALUE);
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
            this.addError(`${prefix}.streetLine1`, 'Street line 1 is required', VALIDATION_ERROR_CODE.REQUIRED);
        }
        if (!address.city) {
            this.addError(`${prefix}.city`, 'City is required', VALIDATION_ERROR_CODE.REQUIRED);
        }
        if (!address.postalCode) {
            this.addError(`${prefix}.postalCode`, 'Postal code is required', VALIDATION_ERROR_CODE.REQUIRED);
        }
        if (!address.countryCode) {
            this.addError(`${prefix}.countryCode`, 'Country code is required', VALIDATION_ERROR_CODE.REQUIRED);
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
     * Build the final validation result with formatted error message.
     *
     * If there are validation errors, this creates a comprehensive error message
     * that includes record context (identifier, line number) and all failure details.
     *
     * @returns EntityValidationResult with formatted error message
     *
     * @example
     * ```typescript
     * // Result with errors:
     * {
     *   valid: false,
     *   errors: [...],
     *   warnings: [...],
     *   errorMessage: `Customer validation failed (email="max@example.com", line: 42)
     *     Failures:
     *       - firstName: Missing required field
     *       - phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")
     *       - addresses[0].streetLine1: Missing required field`
     * }
     * ```
     */
    build(): EntityValidationResult {
        if (this.errors.length === 0) {
            return {
                valid: true,
                errors: [],
                warnings: this.warnings,
            };
        }

        // Build context parts for the error message header
        const contextParts: string[] = [];
        if (this.recordIdentifier) {
            contextParts.push(this.recordIdentifier);
        }
        if (this.recordLineNumber !== undefined) {
            contextParts.push(`line: ${this.recordLineNumber}`);
        }

        // Format the comprehensive error message
        const parts: string[] = ['Validation failed'];

        // Add context if available
        if (contextParts.length > 0) {
            parts.push(`(${contextParts.join(', ')})`);
        }

        // Add failures section
        parts.push('\n  Failures:');

        // Add each error with proper indentation
        for (const error of this.errors) {
            parts.push(`\n    - ${error.field}: ${error.message}`);
        }

        const errorMessage = parts.join('');

        return {
            valid: false,
            errors: this.errors,
            warnings: this.warnings,
            errorMessage,
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
