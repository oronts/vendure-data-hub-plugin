import {
    EMAIL_PATTERN,
    URL_PATTERN as SHARED_URL_PATTERN,
    UUID_PATTERN as SHARED_UUID_PATTERN,
    SLUG_PATTERN as SHARED_SLUG_PATTERN,
} from '../../shared/utils/validation';

export const EMAIL_REGEX = EMAIL_PATTERN;
export const URL_PATTERN = SHARED_URL_PATTERN;
export const UUID_PATTERN = SHARED_UUID_PATTERN;
export const SLUG_PATTERN = SHARED_SLUG_PATTERN;
export const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

export const VALIDATION_ERROR_CODE = {
    REQUIRED: 'REQUIRED',
    NOT_EMPTY: 'NOT_EMPTY',
    INVALID_TYPE: 'INVALID_TYPE',
    INVALID_VALUE: 'INVALID_VALUE',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_EMAIL: 'INVALID_EMAIL',
    INVALID_URL: 'INVALID_URL',
    INVALID_DATE: 'INVALID_DATE',
    INVALID_UUID: 'INVALID_UUID',
    INVALID_PATTERN: 'INVALID_PATTERN',
    INVALID_JSON: 'INVALID_JSON',
    TOO_SHORT: 'TOO_SHORT',
    TOO_LONG: 'TOO_LONG',
    TOO_SMALL: 'TOO_SMALL',
    TOO_LARGE: 'TOO_LARGE',
    OUT_OF_RANGE: 'OUT_OF_RANGE',
    NOT_IN_ENUM: 'NOT_IN_ENUM',
    NOT_UNIQUE: 'NOT_UNIQUE',
    DUPLICATE: 'DUPLICATE',
} as const;

export type ValidationErrorCode = typeof VALIDATION_ERROR_CODE[keyof typeof VALIDATION_ERROR_CODE];

export const ERROR_MESSAGES = {
    REQUIRED: 'This field is required',
    REQUIRED_FIELD: (field: string) => `${field} is required`,
    NOT_EMPTY: 'This field cannot be empty',
    INVALID_TYPE: (expected: string) => `Invalid type, expected ${expected}`,
    INVALID_STRING: 'Value must be a string',
    INVALID_NUMBER: 'Please enter a valid number',
    INVALID_INTEGER: 'Please enter a whole number',
    MUST_BE_POSITIVE: 'Value must be positive',
    INVALID_FORMAT: 'Invalid format',
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_URL: 'Please enter a valid URL',
    INVALID_DATE: 'Please enter a valid date (YYYY-MM-DD)',
    INVALID_UUID: 'Invalid UUID format',
    INVALID_JSON: 'Invalid JSON format',
    PATTERN_MISMATCH: (name: string) => `Does not match ${name} format`,
    TOO_SHORT: (min: number) => `Must be at least ${min} characters`,
    TOO_LONG: (max: number) => `Must be no more than ${max} characters`,
    LENGTH_BETWEEN: (min: number, max: number) => `Must be between ${min} and ${max} characters`,
    TOO_SMALL: (min: number) => `Must be at least ${min}`,
    TOO_LARGE: (max: number) => `Must be no more than ${max}`,
    VALUE_BETWEEN: (min: number, max: number) => `Must be between ${min} and ${max}`,
    NOT_IN_ENUM: (values: string[]) => `Must be one of: ${values.join(', ')}`,
    UNIQUE_VIOLATION: 'This value already exists',
    DUPLICATE: (field: string) => `Duplicate ${field}`,
    JSON_REQUIRED: 'JSON value is required',
    JSON_OBJECT_EXPECTED: 'Value must be a JSON object',
    JSON_ARRAY_EXPECTED: 'Value must be a JSON array',
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

import {
    isValidEmail as sharedIsValidEmail,
    isValidUrl as sharedIsValidUrl,
    isValidUuid as sharedIsValidUuid,
    isValidSlug as sharedIsValidSlug,
} from '../../shared/utils/validation';

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
