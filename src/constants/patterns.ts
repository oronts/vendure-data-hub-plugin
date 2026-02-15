/**
 * Validation Patterns
 *
 * Backend-specific regex patterns plus re-exports of shared patterns.
 * Shared patterns (EMAIL, URL, PIPELINE_CODE) are canonical in shared/utils/validation.ts.
 * Backend-only patterns (SECRET_CODE, IDENTIFIER, UUID, SKU, etc.) live here.
 */

import {
    EMAIL_PATTERN as SHARED_EMAIL_PATTERN,
    URL_PATTERN as SHARED_URL_PATTERN,
    PIPELINE_CODE_PATTERN as SHARED_PIPELINE_CODE_PATTERN,
    isValidEmail as sharedIsValidEmail,
    isValidPipelineCode as sharedIsValidPipelineCode,
} from '../../shared';

// ============================================================================
// Core Identifier Patterns
// ============================================================================

/**
 * Email address pattern.
 * Re-exported from shared/utils/validation.ts (canonical source with empty check).
 */
export const EMAIL_PATTERN = SHARED_EMAIL_PATTERN;

/**
 * Pipeline code pattern (lowercase alphanumeric with dashes).
 * Re-exported from shared/utils/validation.ts (canonical source).
 */
export const PIPELINE_CODE_PATTERN = SHARED_PIPELINE_CODE_PATTERN;

/**
 * Secret code pattern (alphanumeric with dashes and underscores).
 */
export const SECRET_CODE_PATTERN = /^[a-zA-Z0-9-_]+$/;

/**
 * Generic code/identifier pattern (alphanumeric, dashes, underscores, dots).
 */
export const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/**
 * Slug pattern (lowercase alphanumeric with dashes).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Alphanumeric pattern (general).
 */
export const ALPHANUMERIC_PATTERN = /^[A-Za-z0-9]+$/;

// ============================================================================
// URL and Network Patterns
// ============================================================================

/**
 * URL pattern (HTTP/HTTPS).
 * Re-exported from shared/utils/validation.ts (canonical source).
 */
export const URL_PATTERN = SHARED_URL_PATTERN;

// ============================================================================
// Date and Time Patterns
// ============================================================================

/**
 * ISO 8601 date format (YYYY-MM-DD).
 */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO 8601 datetime format.
 */
export const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Cron expression pattern (5 fields: minute hour day month weekday).
 * Note: For full validation, use isValidCron() from shared/utils/validation.ts
 */
export const CRON_BASIC_PATTERN = /^(\S+\s+){4}\S+$/;

// ============================================================================
// UUID and ID Patterns
// ============================================================================

/**
 * UUID v4 pattern.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// Product/Commerce Patterns
// ============================================================================

/**
 * SKU pattern (alphanumeric with dashes/underscores).
 */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Barcode pattern (EAN-13, UPC-A, etc.).
 */
export const BARCODE_PATTERN = /^[0-9]{8,14}$/;

// ============================================================================
// Location/Contact Patterns
// ============================================================================

/**
 * Phone number (international format, loose).
 */
export const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,}$/;

/**
 * Postal/ZIP code (general pattern).
 */
export const POSTAL_CODE_PATTERN = /^[A-Za-z0-9\s-]{3,10}$/;

/**
 * Country code (ISO 3166-1 alpha-2).
 */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Language code (ISO 639-1).
 */
export const LANGUAGE_CODE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * Currency code (ISO 4217).
 */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

// ============================================================================
// File and Path Patterns
// ============================================================================

/**
 * Safe filename (no special chars).
 */
export const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z]{2,4}$/;

/**
 * JSON path expression.
 */
export const JSON_PATH_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;

/**
 * SQL identifier (table/column name).
 */
export const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ============================================================================
// Reference Patterns
// ============================================================================

/**
 * Secret reference pattern (${SECRET_CODE}).
 */
export const SECRET_REF_PATTERN = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

/**
 * Environment variable reference (${env:VAR_NAME}).
 */
export const ENV_VAR_REF_PATTERN = /^\$\{env:([A-Z_][A-Z0-9_]*)\}$/;

/**
 * Template variable pattern for interpolation (${path.to.value}).
 */
export const TEMPLATE_VAR_PATTERN = /\$\{([^}]+)\}/g;

// ============================================================================
// Pattern Collections
// ============================================================================

/**
 * All validation patterns in a single object.
 */
export const PATTERNS = {
    // Core identifiers
    EMAIL: EMAIL_PATTERN,
    PIPELINE_CODE: PIPELINE_CODE_PATTERN,
    SECRET_CODE: SECRET_CODE_PATTERN,
    IDENTIFIER: IDENTIFIER_PATTERN,
    SLUG: SLUG_PATTERN,
    ALPHANUMERIC: ALPHANUMERIC_PATTERN,

    // URL and network
    URL: URL_PATTERN,

    // Date and time
    ISO_DATE: ISO_DATE_PATTERN,
    ISO_DATETIME: ISO_DATETIME_PATTERN,
    CRON_BASIC: CRON_BASIC_PATTERN,

    // UUID and IDs
    UUID: UUID_PATTERN,

    // Product/Commerce
    SKU: SKU_PATTERN,
    BARCODE: BARCODE_PATTERN,

    // Location/Contact
    PHONE: PHONE_PATTERN,
    POSTAL_CODE: POSTAL_CODE_PATTERN,
    COUNTRY_CODE: COUNTRY_CODE_PATTERN,
    LANGUAGE_CODE: LANGUAGE_CODE_PATTERN,
    CURRENCY_CODE: CURRENCY_CODE_PATTERN,

    // File and path
    SAFE_FILENAME: SAFE_FILENAME_PATTERN,
    JSON_PATH: JSON_PATH_PATTERN,
    SQL_IDENTIFIER: SQL_IDENTIFIER_PATTERN,

    // References
    SECRET_REF: SECRET_REF_PATTERN,
    ENV_VAR_REF: ENV_VAR_REF_PATTERN,
    TEMPLATE_VAR: TEMPLATE_VAR_PATTERN,
} as const;

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate email format.
 * Re-exported from shared/utils/validation.ts (canonical source with empty check).
 */
export const isValidEmail = sharedIsValidEmail;

/**
 * Validate pipeline code format.
 * Re-exported from shared/utils/validation.ts (canonical source with empty check).
 */
export const isValidPipelineCode = sharedIsValidPipelineCode;


