/**
 * Validation Patterns
 *
 * Backend-specific regex patterns plus re-exports of shared patterns.
 * Shared patterns (EMAIL, URL, PIPELINE_CODE) are canonical in shared/utils/validation.ts.
 * Backend-only patterns (UUID, SLUG, PHONE, etc.) live here.
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
 * Slug pattern (lowercase alphanumeric with dashes).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

// ============================================================================
// UUID and ID Patterns
// ============================================================================

/**
 * UUID v4 pattern.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// Location/Contact Patterns
// ============================================================================

/**
 * Phone number (international format, loose).
 */
export const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,}$/;

// ============================================================================
// File and Path Patterns
// ============================================================================

/**
 * SQL identifier (table/column name).
 */
export const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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


