/**
 * Validation Patterns
 *
 * Backend-specific regex patterns plus re-exports of shared patterns.
 */

import {
    EMAIL_PATTERN as SHARED_EMAIL_PATTERN,
    URL_PATTERN as SHARED_URL_PATTERN,
} from '../../shared';

export const EMAIL_PATTERN = SHARED_EMAIL_PATTERN;

/**
 * Slug pattern (lowercase alphanumeric with dashes).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const URL_PATTERN = SHARED_URL_PATTERN;

/**
 * ISO 8601 date format (YYYY-MM-DD).
 */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UUID v4 pattern.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Phone number (international format, loose).
 */
export const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,}$/;

/**
 * SQL identifier (table/column name).
 */
export const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
