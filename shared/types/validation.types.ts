/**
 * Validation Types
 *
 * This is the SINGLE SOURCE OF TRUTH for validation types, error codes, and error messages
 * shared between frontend and backend.
 *
 * Note: This file must be self-contained (no imports from src/) to support both
 * backend and dashboard TypeScript configurations.
 */

/**
 * Canonical email validation regex.
 * Simple pattern: [localpart]@[domain].[tld]
 * Defined inline to avoid import from src/ which breaks dashboard compilation.
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

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationError {
    field: string;
    rule: string;
    message: string;
    code?: ValidationErrorCode;
    severity?: ValidationSeverity;
    value?: unknown;
    context?: Record<string, unknown>;
}

export interface RecordValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings?: ValidationError[];
}

export interface BatchValidationResult {
    total: number;
    valid: number;
    invalid: number;
    errors: Map<number, ValidationError[]>;
    allErrors: ValidationError[];
}

export type ValidationRuleType =
    | 'REQUIRED'
    | 'NOT_EMPTY'
    | 'TYPE'
    | 'MIN_LENGTH'
    | 'MAX_LENGTH'
    | 'MIN'
    | 'MAX'
    | 'PATTERN'
    | 'EMAIL'
    | 'URL'
    | 'DATE'
    | 'UUID'
    | 'ENUM'
    | 'UNIQUE'
    | 'CUSTOM';

export interface ValidationRule {
    type: ValidationRuleType;
    field: string;
    params?: Record<string, unknown>;
    message?: string;
    code?: ValidationErrorCode;
    enabled?: boolean;
    severity?: ValidationSeverity;
}

export type InvalidRecordAction = 'DROP' | 'SKIP' | 'FAIL' | 'QUARANTINE';

export interface ValidationConfig {
    rules: ValidationRule[];
    stopOnFirstError?: boolean;
    mode?: 'STRICT' | 'LENIENT';
    onInvalid?: InvalidRecordAction;
}

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Basic validation patterns for shared API contract.
 * For comprehensive validation patterns with helper functions, see src/constants/validation.ts
 */
export const VALIDATION_PATTERNS = {
    /** Email pattern - uses canonical EMAIL_REGEX from utils */
    EMAIL: EMAIL_REGEX,
    URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    DATE_ISO: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/,
    NUMERIC: /^-?\d+(\.\d+)?$/,
    ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
    CODE: /^[a-z][a-z0-9_-]*$/,
    SKU: /^[A-Z0-9][A-Z0-9_-]*$/i,
} as const;

