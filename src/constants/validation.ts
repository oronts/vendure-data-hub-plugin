// VALIDATION CONSTANTS - Patterns and limits for data validation

/**
 * Regular expression patterns for common validations
 */
export const VALIDATION_PATTERNS = {
    /** Email address pattern (RFC 5322 simplified) */
    EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

    /** URL pattern (HTTP/HTTPS) */
    URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,

    /** ISO 8601 date format (YYYY-MM-DD) */
    ISO_DATE: /^\d{4}-\d{2}-\d{2}$/,

    /** ISO 8601 datetime format */
    ISO_DATETIME: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/,

    /** UUID v4 pattern */
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

    /** SKU pattern (alphanumeric with dashes/underscores) */
    SKU: /^[A-Za-z0-9][A-Za-z0-9_-]*$/,

    /** Slug pattern (lowercase alphanumeric with dashes) */
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

    /** Phone number (international format, loose) */
    PHONE: /^\+?[0-9\s\-().]{7,}$/,

    /** Postal/ZIP code (general pattern) */
    POSTAL_CODE: /^[A-Za-z0-9\s-]{3,10}$/,

    /** Country code (ISO 3166-1 alpha-2) */
    COUNTRY_CODE: /^[A-Z]{2}$/,

    /** Language code (ISO 639-1) */
    LANGUAGE_CODE: /^[a-z]{2}(-[A-Z]{2})?$/,

    /** Currency code (ISO 4217) */
    CURRENCY_CODE: /^[A-Z]{3}$/,

    /** Barcode (EAN-13, UPC-A, etc.) */
    BARCODE: /^[0-9]{8,14}$/,

    /** Alphanumeric code (general) */
    ALPHANUMERIC: /^[A-Za-z0-9]+$/,

    /** Safe filename (no special chars) */
    SAFE_FILENAME: /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z]{2,4}$/,

    /** JSON path expression */
    JSON_PATH: /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/,

    /** SQL identifier (table/column name) */
    SQL_IDENTIFIER: /^[a-zA-Z_][a-zA-Z0-9_]*$/,

    /** Secret reference pattern */
    SECRET_REF: /^\$\{([A-Z_][A-Z0-9_]*)\}$/,

    /** Environment variable reference */
    ENV_VAR_REF: /^\$\{env:([A-Z_][A-Z0-9_]*)\}$/,
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
 * Common validation error messages
 */
export const VALIDATION_MESSAGES = {
    REQUIRED: 'This field is required',
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_URL: 'Please enter a valid URL',
    INVALID_DATE: 'Please enter a valid date (YYYY-MM-DD)',
    INVALID_NUMBER: 'Please enter a valid number',
    INVALID_INTEGER: 'Please enter a whole number',
    INVALID_POSITIVE: 'Value must be positive',
    INVALID_FORMAT: 'Invalid format',
    TOO_SHORT: (min: number) => `Must be at least ${min} characters`,
    TOO_LONG: (max: number) => `Must be no more than ${max} characters`,
    TOO_SMALL: (min: number) => `Must be at least ${min}`,
    TOO_LARGE: (max: number) => `Must be no more than ${max}`,
    NOT_IN_ENUM: (values: string[]) => `Must be one of: ${values.join(', ')}`,
    PATTERN_MISMATCH: (name: string) => `Does not match ${name} format`,
    UNIQUE_VIOLATION: 'This value already exists',
    FOREIGN_KEY: (entity: string) => `Referenced ${entity} not found`,
} as const;

/**
 * Vendure-specific field requirements
 */
export const VENDURE_FIELD_REQUIREMENTS = {
    PRODUCT: {
        name: { required: true, minLength: 1, maxLength: 255 },
        slug: { required: true, pattern: VALIDATION_PATTERNS.SLUG, maxLength: 255 },
        description: { maxLength: 100000 },
    },
    VARIANT: {
        sku: { required: true, minLength: 1, maxLength: 100 },
        price: { required: true, min: 0 },
    },
    CUSTOMER: {
        emailAddress: { required: true, pattern: VALIDATION_PATTERNS.EMAIL },
        firstName: { maxLength: 255 },
        lastName: { maxLength: 255 },
    },
    COLLECTION: {
        name: { required: true, minLength: 1, maxLength: 255 },
        slug: { required: true, pattern: VALIDATION_PATTERNS.SLUG, maxLength: 255 },
    },
    ASSET: {
        name: { required: true, minLength: 1, maxLength: 255 },
        source: { required: true },
    },
} as const;

/**
 * Validate a value against a pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
    return pattern.test(value);
}

/**
 * Validate string length
 */
export function isWithinLength(
    value: string,
    min: number = 0,
    max: number = Infinity,
): boolean {
    return value.length >= min && value.length <= max;
}

/**
 * Validate numeric range
 */
export function isWithinRange(
    value: number,
    min: number = -Infinity,
    max: number = Infinity,
): boolean {
    return value >= min && value <= max;
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(value: string): boolean {
    return VALIDATION_PATTERNS.EMAIL.test(value);
}

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(value: string): boolean {
    return VALIDATION_PATTERNS.URL.test(value);
}

/**
 * Check if a string is a valid ISO date
 */
export function isValidIsoDate(value: string): boolean {
    if (!VALIDATION_PATTERNS.ISO_DATE.test(value) && !VALIDATION_PATTERNS.ISO_DATETIME.test(value)) {
        return false;
    }
    const date = new Date(value);
    return !isNaN(date.getTime());
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUuid(value: string): boolean {
    return VALIDATION_PATTERNS.UUID.test(value);
}

/**
 * Check if a string is a valid slug
 */
export function isValidSlug(value: string): boolean {
    return VALIDATION_PATTERNS.SLUG.test(value);
}

// =============================================================================
// CONFIDENCE SCORING
// =============================================================================

/**
 * Confidence score thresholds for auto-mapping
 */
export const CONFIDENCE_THRESHOLDS = {
    HIGH: 70,
    MEDIUM: 40,
} as const;

/**
 * Match confidence type
 */
export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * Convert numeric score to confidence level
 * Replaces ternary chains: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
 */
export function scoreToConfidence(score: number): MatchConfidence {
    if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
    if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
    return 'low';
}

/**
 * Get minimum score for a confidence level option
 * Replaces: minConfidence === 'high' ? 70 : minConfidence === 'medium' ? 40 : 0
 */
export function confidenceToMinScore(confidence: MatchConfidence | undefined): number {
    switch (confidence) {
        case 'high': return CONFIDENCE_THRESHOLDS.HIGH;
        case 'medium': return CONFIDENCE_THRESHOLDS.MEDIUM;
        default: return 0;
    }
}
