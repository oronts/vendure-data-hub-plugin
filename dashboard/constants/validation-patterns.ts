/**
 * Dashboard Validation Patterns
 *
 * Re-exports shared validation utilities and adds dashboard-specific
 * error messages for form validation.
 */

import {
    isValidEmail as sharedIsValidEmail,
    isValidUrl as sharedIsValidUrl,
    ERROR_MESSAGES as SHARED_ERROR_MESSAGES,
} from '../../shared';

export const ERROR_MESSAGES = {
    ...SHARED_ERROR_MESSAGES,
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
