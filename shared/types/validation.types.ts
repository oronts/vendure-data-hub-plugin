/**
 * Validation Types
 *
 * This is the SINGLE SOURCE OF TRUTH for validation types, error codes, and error messages
 * shared between frontend (dashboard) and backend (src).
 *
 * Architecture Note:
 * This file is intentionally self-contained with no external imports. The shared/ directory
 * operates independently from src/ to ensure compatibility with both backend (tsconfig.build.json)
 * and dashboard (tsconfig.dashboard.json) TypeScript configurations.
 *
 * - For backend-specific validation patterns and utilities, see: src/constants/patterns.ts
 * - For shared validation utilities (functions), see: shared/utils/validation.ts
 * - This file provides only types, constants, and inline pattern definitions
 */

/**
 * Canonical email validation regex.
 * Simple pattern: [localpart]@[domain].[tld]
 *
 * Defined inline here as this file must remain self-contained (no external imports).
 * This same pattern is also available as EMAIL_PATTERN in src/constants/patterns.ts
 * and shared/utils/validation.ts for use in their respective contexts.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// VALIDATION ERROR CODES
// ============================================================================

/**
 * Validation error codes - used by both frontend and backend for consistent error handling.
 * These codes map to specific validation failures and can be used for i18n.
 */
export const VALIDATION_ERROR_CODE = {
    // Field presence errors
    REQUIRED: 'REQUIRED',
    NOT_EMPTY: 'NOT_EMPTY',

    // Type errors
    INVALID_TYPE: 'INVALID_TYPE',
    INVALID_VALUE: 'INVALID_VALUE',

    // Format errors
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_EMAIL: 'INVALID_EMAIL',
    INVALID_URL: 'INVALID_URL',
    INVALID_DATE: 'INVALID_DATE',
    INVALID_UUID: 'INVALID_UUID',
    INVALID_PATTERN: 'INVALID_PATTERN',
    INVALID_JSON: 'INVALID_JSON',

    // Range errors
    TOO_SHORT: 'TOO_SHORT',
    TOO_LONG: 'TOO_LONG',
    TOO_SMALL: 'TOO_SMALL',
    TOO_LARGE: 'TOO_LARGE',
    OUT_OF_RANGE: 'OUT_OF_RANGE',

    // Constraint errors
    NOT_IN_ENUM: 'NOT_IN_ENUM',
    NOT_UNIQUE: 'NOT_UNIQUE',
    DUPLICATE: 'DUPLICATE',
    CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',

    // Reference errors
    NOT_FOUND: 'NOT_FOUND',
    FOREIGN_KEY: 'FOREIGN_KEY',

    // Date range errors
    INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
} as const;

export type ValidationErrorCode = typeof VALIDATION_ERROR_CODE[keyof typeof VALIDATION_ERROR_CODE];

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Centralized error messages for validation.
 * Use these constants instead of hardcoded strings for consistency and i18n support.
 *
 * Message format conventions:
 * - Field-specific: Use dynamic function to include field name
 * - Generic: Use static string for context-agnostic messages
 * - All messages should be user-friendly and actionable
 */
export const ERROR_MESSAGES = {
    // -------------------------------------------------------------------------
    // Required field messages
    // -------------------------------------------------------------------------
    REQUIRED: 'This field is required',
    REQUIRED_FIELD: (field: string) => `${field} is required`,
    NOT_EMPTY: 'This field cannot be empty',
    NOT_EMPTY_FIELD: (field: string) => `${field} cannot be empty`,

    // -------------------------------------------------------------------------
    // Type validation messages
    // -------------------------------------------------------------------------
    INVALID_TYPE: (expected: string) => `Invalid type, expected ${expected}`,
    INVALID_STRING: 'Value must be a string',
    INVALID_NUMBER: 'Please enter a valid number',
    INVALID_INTEGER: 'Please enter a whole number',
    INVALID_BOOLEAN: 'Value must be true or false',
    INVALID_ARRAY: 'Value must be an array',
    INVALID_OBJECT: 'Value must be an object',
    MUST_BE_POSITIVE: 'Value must be positive',
    MUST_BE_POSITIVE_FIELD: (field: string) => `${field} must be a positive number`,

    // -------------------------------------------------------------------------
    // Format validation messages
    // -------------------------------------------------------------------------
    INVALID_FORMAT: 'Invalid format',
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_URL: 'Please enter a valid URL',
    INVALID_DATE: 'Please enter a valid date (YYYY-MM-DD)',
    INVALID_UUID: 'Invalid UUID format',
    INVALID_JSON: 'Invalid JSON format',
    PATTERN_MISMATCH: (name: string) => `Does not match ${name} format`,

    // -------------------------------------------------------------------------
    // Length/size validation messages
    // -------------------------------------------------------------------------
    TOO_SHORT: (min: number) => `Must be at least ${min} characters`,
    TOO_LONG: (max: number) => `Must be no more than ${max} characters`,
    LENGTH_BETWEEN: (min: number, max: number) => `Must be between ${min} and ${max} characters`,

    // -------------------------------------------------------------------------
    // Range validation messages
    // -------------------------------------------------------------------------
    TOO_SMALL: (min: number) => `Must be at least ${min}`,
    TOO_LARGE: (max: number) => `Must be no more than ${max}`,
    VALUE_BETWEEN: (min: number, max: number) => `Must be between ${min} and ${max}`,

    // -------------------------------------------------------------------------
    // Enum/constraint validation messages
    // -------------------------------------------------------------------------
    NOT_IN_ENUM: (values: string[]) => `Must be one of: ${values.join(', ')}`,
    UNIQUE_VIOLATION: 'This value already exists',
    DUPLICATE: (field: string) => `Duplicate ${field}`,
    CONSTRAINT_VIOLATION: 'Constraint violation',

    // -------------------------------------------------------------------------
    // Reference validation messages
    // -------------------------------------------------------------------------
    NOT_FOUND: (entity: string) => `${entity} not found`,
    FOREIGN_KEY: (entity: string) => `Referenced ${entity} not found`,

    // -------------------------------------------------------------------------
    // Entity-specific required field messages
    // -------------------------------------------------------------------------
    // Product
    PRODUCT_NAME_REQUIRED: 'Product name is required',
    PRODUCT_SKU_REQUIRED: 'SKU is required',
    PRODUCT_PRICE_REQUIRED: 'Price is required',

    // Customer
    EMAIL_ADDRESS_REQUIRED: 'Email address is required',
    FIRST_NAME_REQUIRED: 'First name is required',
    LAST_NAME_REQUIRED: 'Last name is required',

    // Order
    CUSTOMER_EMAIL_REQUIRED: 'Customer email is required',
    ORDER_LINES_REQUIRED: 'At least one order line is required',
    LINE_SKU_REQUIRED: 'Line SKU is required',

    // Address
    STREET_LINE_REQUIRED: 'Street line 1 is required',
    CITY_REQUIRED: 'City is required',
    POSTAL_CODE_REQUIRED: 'Postal code is required',
    COUNTRY_CODE_REQUIRED: 'Country code is required',

    // Collection/Facet
    COLLECTION_NAME_REQUIRED: 'Collection name is required',
    FACET_NAME_REQUIRED: 'Facet name is required',
    FACET_CODE_REQUIRED: 'Facet code is required',
    FACET_VALUE_NAME_REQUIRED: 'Facet value name is required',
    FACET_VALUE_CODE_REQUIRED: 'Facet value code is required',
    PARENT_FACET_REQUIRED: 'Parent facet code or ID is required',

    // Shipping/Payment
    SHIPPING_METHOD_NAME_REQUIRED: 'Shipping method name is required',
    SHIPPING_METHOD_CODE_REQUIRED: 'Shipping method code is required',
    FULFILLMENT_HANDLER_REQUIRED: 'Fulfillment handler is required',
    SHIPPING_CALCULATOR_REQUIRED: 'Shipping calculator is required',
    PAYMENT_METHOD_NAME_REQUIRED: 'Payment method name is required',
    PAYMENT_METHOD_CODE_REQUIRED: 'Payment method code is required',
    PAYMENT_HANDLER_REQUIRED: 'Payment handler is required',

    // Tax
    TAX_RATE_NAME_REQUIRED: 'Tax rate name is required',
    TAX_RATE_VALUE_REQUIRED: 'Tax rate value is required',
    TAX_CATEGORY_REQUIRED: 'Tax category code or ID is required',
    ZONE_REQUIRED: 'Zone code or ID is required',

    // Channel
    CHANNEL_CODE_REQUIRED: 'Channel code is required',
    DEFAULT_LANGUAGE_REQUIRED: 'Default language code is required',
    DEFAULT_CURRENCY_REQUIRED: 'Default currency code is required',

    // Asset
    SOURCE_URL_REQUIRED: 'Source URL is required',

    // Stock
    STOCK_LOCATION_NAME_REQUIRED: 'Stock location name is required',
    STOCK_ON_HAND_REQUIRED: 'Stock on hand is required',

    // Customer Group
    CUSTOMER_GROUP_NAME_REQUIRED: 'Customer group name is required',

    // Promotion
    PROMOTION_NAME_REQUIRED: 'Promotion name is required',

    // -------------------------------------------------------------------------
    // Pipeline/Step validation messages
    // -------------------------------------------------------------------------
    STEP_KEY_REQUIRED: 'Step key is required',
    TRIGGER_TYPE_REQUIRED: 'Trigger type is required',
    EXTRACTOR_CODE_REQUIRED: 'Extractor adapterCode is required',
    CRON_EXPRESSION_REQUIRED: 'Cron expression is required',
    EVENT_TYPE_REQUIRED: 'Event type is required for event triggers',
    BRANCH_NAME_REQUIRED: 'Branch name is required',

    // -------------------------------------------------------------------------
    // Database/Query validation messages
    // -------------------------------------------------------------------------
    QUERY_REQUIRED: 'Query is required',
    SQL_QUERY_REQUIRED: 'SQL query is required',
    GRAPHQL_QUERY_REQUIRED: 'GraphQL query is required',
    TABLE_OR_QUERY_REQUIRED: 'Query or table is required',
    COLUMN_NAME_REQUIRED: 'Column name is required',
    TABLE_NAME_REQUIRED: 'Table name is required',
    DATABASE_TYPE_REQUIRED: 'Database type is required',
    DATABASE_NAME_REQUIRED: 'Database name is required',
    HOST_REQUIRED: 'Host is required',

    // -------------------------------------------------------------------------
    // File/Storage validation messages
    // -------------------------------------------------------------------------
    FILE_PATH_REQUIRED: 'File path is required',
    BUCKET_NAME_REQUIRED: 'Bucket name is required',
    REMOTE_PATH_REQUIRED: 'Remote path is required',
    PROTOCOL_REQUIRED: 'Protocol is required',
    URL_REQUIRED: 'URL is required',
    ENTITY_TYPE_REQUIRED: 'Entity type is required',

    // -------------------------------------------------------------------------
    // Mapping validation messages
    // -------------------------------------------------------------------------
    MAPPING_SOURCE_REQUIRED: 'Mapping source field is required',
    MAPPING_TARGET_REQUIRED: 'Mapping target field is required',
    OPERATION_TYPE_REQUIRED: 'Operation type is required',
    VALIDATION_RULE_FIELD_REQUIRED: 'Validation rule field is required',
    VALIDATION_RULE_TYPE_REQUIRED: 'Validation rule type is required',

    // -------------------------------------------------------------------------
    // Script validation messages
    // -------------------------------------------------------------------------
    SCRIPT_CODE_REQUIRED: 'Script code is required',

    // -------------------------------------------------------------------------
    // JSON validation messages (for dashboard)
    // -------------------------------------------------------------------------
    JSON_REQUIRED: 'JSON value is required',
    JSON_OBJECT_EXPECTED: 'Value must be a JSON object',
    JSON_ARRAY_EXPECTED: 'Value must be a JSON array',
} as const;

// ============================================================================
// VALIDATION TYPES
// ============================================================================

type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationError {
    field: string;
    rule: string;
    message: string;
    code?: ValidationErrorCode;
    severity?: ValidationSeverity;
    value?: unknown;
    context?: Record<string, unknown>;
}

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Basic validation patterns for shared API contract between frontend and backend.
 *
 * These patterns are defined inline to keep this file self-contained and importable
 * by both dashboard and backend code without circular dependencies.
 *
 * Architecture:
 * - This file (shared/types/validation.types.ts): Basic patterns as inline regex for shared types
 * - shared/utils/validation.ts: Shared validation functions using these patterns
 * - src/constants/patterns.ts: Backend-specific patterns
 * - src/constants/validation.ts: Backend validation utilities that re-export from shared
 */
export const VALIDATION_PATTERNS = {
    /** Email pattern - canonical format [localpart]@[domain].[tld] */
    EMAIL: EMAIL_REGEX,
    /** URL pattern - HTTP/HTTPS only */
    URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    /** UUID v4 pattern */
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    /** Slug pattern - lowercase alphanumeric with dashes */
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    /** ISO date/datetime pattern */
    DATE_ISO: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/,
    /** Numeric pattern - integers and floats */
    NUMERIC: /^-?\d+(\.\d+)?$/,
    /** Alphanumeric pattern */
    ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
    /** Code pattern - lowercase alphanumeric with dashes/underscores */
    CODE: /^[a-z][a-z0-9_-]*$/,
    /** SKU pattern - alphanumeric with dashes/underscores */
    SKU: /^[A-Z0-9][A-Z0-9_-]*$/i,
} as const;

