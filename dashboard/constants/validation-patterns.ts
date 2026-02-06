/**
 * Dashboard Validation Patterns
 *
 * Re-exports shared validation utilities and adds dashboard-specific
 * error messages for form validation.
 */

import {
    EMAIL_PATTERN,
    URL_PATTERN as SHARED_URL_PATTERN,
    UUID_PATTERN as SHARED_UUID_PATTERN,
    SLUG_PATTERN as SHARED_SLUG_PATTERN,
    isValidEmail as sharedIsValidEmail,
    isValidUrl as sharedIsValidUrl,
    isValidUuid as sharedIsValidUuid,
    isValidSlug as sharedIsValidSlug,
} from '../../shared/utils/validation';

import {
    VALIDATION_ERROR_CODE as SHARED_VALIDATION_ERROR_CODE,
    ERROR_MESSAGES as SHARED_ERROR_MESSAGES,
    type ValidationErrorCode as SharedValidationErrorCode,
} from '../../shared/types/validation.types';

// Re-export patterns from shared
export const EMAIL_REGEX = EMAIL_PATTERN;
export const URL_PATTERN = SHARED_URL_PATTERN;
export const UUID_PATTERN = SHARED_UUID_PATTERN;
export const SLUG_PATTERN = SHARED_SLUG_PATTERN;
export const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

// Re-export validation error codes from shared
export const VALIDATION_ERROR_CODE = SHARED_VALIDATION_ERROR_CODE;
export type ValidationErrorCode = SharedValidationErrorCode;

/**
 * Dashboard-specific error messages.
 * Extends shared ERROR_MESSAGES with dashboard-only messages.
 */
export const ERROR_MESSAGES = {
    // Include all shared messages
    ...SHARED_ERROR_MESSAGES,
    // Dashboard-specific additions
    INVALID_MAPPING_JSON: 'Invalid mapping JSON',
    NAME_REQUIRED: 'Name is required',
    CODE_REQUIRED: 'Code is required',
    CODE_PATTERN: 'Must start with a letter and contain only letters, numbers, hyphens, and underscores',
    CONNECTION_TYPE_REQUIRED: 'Connection type is required',
    PROVIDER_REQUIRED: 'Provider is required',
    ENV_VAR_NAME_REQUIRED: 'Environment variable name is required',
    SECRET_VALUE_REQUIRED: 'Secret value is required when creating a new secret',
    ENV_VAR_FORMAT: 'Environment variable names should be uppercase with underscores (e.g., MY_API_KEY)',
    MIN_LENGTH_2: 'Must be at least 2 characters',
    BRANCH_NAME_EMPTY: 'Branch name cannot be empty',
    DUPLICATE_BRANCH_NAMES: 'Branch names must be unique',
} as const;

export const isValidEmail = sharedIsValidEmail;
export const isValidUrl = sharedIsValidUrl;
export const isValidUuid = sharedIsValidUuid;
export const isValidSlug = sharedIsValidSlug;

export function isValidIsoDate(date: string): boolean {
    if (!DATE_ISO_PATTERN.test(date)) {
        return false;
    }
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
}
