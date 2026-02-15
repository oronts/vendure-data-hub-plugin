/**
 * SQL Security Constants
 *
 * Constants for SQL injection prevention and identifier validation.
 */

/**
 * Maximum allowed identifier length (most DBs support at least 128)
 */
export const SQL_IDENTIFIER_MAX_LENGTH = 128;

/**
 * Maximum string length to check for SQL injection patterns.
 * Prevents ReDoS attacks on very long strings.
 */
export const SQL_CHECK_MAX_LENGTH = 10_000;

/**
 * Valid identifier patterns for SQL columns and tables
 */
export const SQL_PATTERNS = {
    /** Valid column name pattern: starts with letter/underscore, contains only letters/numbers/underscores */
    COLUMN: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    /** Valid table name pattern: supports schema-qualified names (schema.table) */
    TABLE: /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/,
} as const;

