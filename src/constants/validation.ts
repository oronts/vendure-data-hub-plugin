/**
 * Validation patterns and utilities.
 */
import {
    EMAIL_PATTERN,
    URL_PATTERN,
    ISO_DATE_PATTERN,
    UUID_PATTERN,
    SLUG_PATTERN,
    PHONE_PATTERN,
    SQL_IDENTIFIER_PATTERN,
} from './patterns';
import { CONFIDENCE_THRESHOLDS } from '../../shared/constants';

export const VALIDATION_PATTERNS = {
    /** Email address pattern - from patterns.ts */
    EMAIL: EMAIL_PATTERN,

    /** URL pattern (HTTP/HTTPS) */
    URL: URL_PATTERN,

    /** ISO 8601 date format (YYYY-MM-DD) */
    ISO_DATE: ISO_DATE_PATTERN,

    /** UUID v4 pattern */
    UUID: UUID_PATTERN,

    /** Slug pattern (lowercase alphanumeric with dashes) */
    SLUG: SLUG_PATTERN,

    /** Phone number (international format, loose) */
    PHONE: PHONE_PATTERN,

    /** SQL identifier (table/column name) */
    SQL_IDENTIFIER: SQL_IDENTIFIER_PATTERN,
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
} from '../../shared/types';

export { CONFIDENCE_THRESHOLDS };

export type { MatchConfidence } from '../../shared';
export { scoreToConfidence, confidenceToMinScore } from '../../shared';
