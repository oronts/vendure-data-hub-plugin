/**
 * Validation patterns and utilities.
 */
import {
    EMAIL_PATTERN,
    URL_PATTERN,
    ISO_DATE_PATTERN,
    ISO_DATETIME_PATTERN,
    UUID_PATTERN,
    SKU_PATTERN,
    SLUG_PATTERN,
    PHONE_PATTERN,
    POSTAL_CODE_PATTERN,
    COUNTRY_CODE_PATTERN,
    LANGUAGE_CODE_PATTERN,
    CURRENCY_CODE_PATTERN,
    BARCODE_PATTERN,
    ALPHANUMERIC_PATTERN,
    SAFE_FILENAME_PATTERN,
    JSON_PATH_PATTERN,
    SQL_IDENTIFIER_PATTERN,
    SECRET_REF_PATTERN,
    ENV_VAR_REF_PATTERN,
    isValidEmail as isValidEmailFromPatterns,
} from './patterns';
import { CONFIDENCE_THRESHOLDS } from '../../shared/constants';

export const VALIDATION_PATTERNS = {
    /** Email address pattern - from patterns.ts */
    EMAIL: EMAIL_PATTERN,

    /** URL pattern (HTTP/HTTPS) */
    URL: URL_PATTERN,

    /** ISO 8601 date format (YYYY-MM-DD) */
    ISO_DATE: ISO_DATE_PATTERN,

    /** ISO 8601 datetime format */
    ISO_DATETIME: ISO_DATETIME_PATTERN,

    /** UUID v4 pattern */
    UUID: UUID_PATTERN,

    /** SKU pattern (alphanumeric with dashes/underscores) */
    SKU: SKU_PATTERN,

    /** Slug pattern (lowercase alphanumeric with dashes) */
    SLUG: SLUG_PATTERN,

    /** Phone number (international format, loose) */
    PHONE: PHONE_PATTERN,

    /** Postal/ZIP code (general pattern) */
    POSTAL_CODE: POSTAL_CODE_PATTERN,

    /** Country code (ISO 3166-1 alpha-2) */
    COUNTRY_CODE: COUNTRY_CODE_PATTERN,

    /** Language code (ISO 639-1) */
    LANGUAGE_CODE: LANGUAGE_CODE_PATTERN,

    /** Currency code (ISO 4217) */
    CURRENCY_CODE: CURRENCY_CODE_PATTERN,

    /** Barcode (EAN-13, UPC-A, etc.) */
    BARCODE: BARCODE_PATTERN,

    /** Alphanumeric code (general) */
    ALPHANUMERIC: ALPHANUMERIC_PATTERN,

    /** Safe filename (no special chars) */
    SAFE_FILENAME: SAFE_FILENAME_PATTERN,

    /** JSON path expression */
    JSON_PATH: JSON_PATH_PATTERN,

    /** SQL identifier (table/column name) */
    SQL_IDENTIFIER: SQL_IDENTIFIER_PATTERN,

    /** Secret reference pattern */
    SECRET_REF: SECRET_REF_PATTERN,

    /** Environment variable reference */
    ENV_VAR_REF: ENV_VAR_REF_PATTERN,
} as const;

/**
 * Field length limits
 */
export const FIELD_LIMITS = {
    // Short text fields
    CODE_MIN: 1,
    CODE_MAX: 50,
    NAME_MIN: 1,
    NAME_MAX: 255,
    SLUG_MAX: 255,

    // Medium text fields
    DESCRIPTION_MAX: 5000,
    NOTES_MAX: 2000,

    // Long text fields
    BODY_MAX: 100000,
    JSON_CONFIG_MAX: 500000,

    // Identifier fields
    SKU_MIN: 1,
    SKU_MAX: 100,
    BARCODE_MAX: 50,
    UUID_LENGTH: 36,

    // Numeric fields
    PRICE_MIN: 0,
    PRICE_MAX: 999999999,
    QUANTITY_MIN: 0,
    QUANTITY_MAX: 999999999,
    PERCENTAGE_MIN: 0,
    PERCENTAGE_MAX: 100,
    WEIGHT_MAX: 999999999,

    // Array fields
    TAGS_MAX: 100,
    VARIANTS_MAX: 1000,
    OPTIONS_MAX: 100,
    ASSETS_MAX: 500,

    // Collection limits
    BATCH_SIZE_MIN: 1,
    BATCH_SIZE_MAX: 10000,
    PAGE_SIZE_MIN: 1,
    PAGE_SIZE_MAX: 1000,
} as const;

/**
 * Common validation error messages.
 */
export {
    ERROR_MESSAGES,
    VALIDATION_ERROR_CODE,
} from '../../shared/types';
export type { ValidationErrorCode } from '../../shared/types';

/**
 * Validate a value against a pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
    return pattern.test(value);
}

export { isValidEmailFromPatterns as isValidEmail };

/**
 * Check if a string is a valid URL.
 * Delegates to the canonical isValidUrl from shared/utils/validation.
 */
export { isValidUrl } from '../../shared/utils/validation';

// Re-export from shared constants (single source of truth) - imported at top of file
export { CONFIDENCE_THRESHOLDS };

// Re-export MatchConfidence type and conversion functions from shared (single source of truth).
// These were moved to shared/utils/validation.ts so dashboard can import without
// crossing the src/ boundary.
export type { MatchConfidence } from '../../shared/utils/validation';
export { scoreToConfidence, confidenceToMinScore } from '../../shared/utils/validation';
