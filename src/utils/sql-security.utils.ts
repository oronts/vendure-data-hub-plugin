/**
 * SQL Security Utilities
 * 
 * Provides safe SQL query construction with column whitelisting and validation.
 * Prevents SQL injection attacks by validating all SQL identifiers.
 */

const VALID_COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VALID_TABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

/**
 * Validate a column name against whitelist and pattern
 * 
 * @param column - Column name to validate
 * @param allowedColumns - Whitelist of allowed column names
 * @throws Error if column is invalid or not in whitelist
 */
export function validateColumnName(
    column: string | undefined,
    allowedColumns: Set<string> = new Set(),
): void {
    if (!column) {
        throw new Error('Column name is required');
    }

    if (!VALID_COLUMN_PATTERN.test(column)) {
        throw new Error(`Invalid column name: "${column}". Column names must start with letter or underscore and contain only letters, numbers, and underscores.`);
    }

    if (allowedColumns.size > 0 && !allowedColumns.has(column)) {
        throw new Error(`Column "${column}" is not in allowed columns list`);
    }
}

/**
 * Validate a table name
 * 
 * @param table - Table name to validate
 * @throws Error if table name is invalid
 */
export function validateTableName(table: string | undefined): void {
    if (!table) {
        throw new Error('Table name is required');
    }

    if (!VALID_TABLE_PATTERN.test(table)) {
        throw new Error(`Invalid table name: "${table}"`);
    }
}

/**
 * Escape a SQL identifier for safe use in queries
 * 
 * @param identifier - SQL identifier to escape
 * @returns Escaped identifier wrapped in double quotes
 */
export function escapeSqlIdentifier(identifier: string): string {
    validateColumnName(identifier);
    return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Validate and sanitize a LIMIT/OFFSET value
 * 
 * @param value - Numeric value to validate
 * @param min - Minimum allowed value (default: 0)
 * @param max - Maximum allowed value (default: 1000000)
 * @returns Sanitized integer value
 * @throws Error if value is invalid
 */
export function validateLimitOffset(
    value: number | string | undefined,
    min: number = 0,
    max: number = 1000000,
): number {
    if (value === undefined || value === null) {
        throw new Error(`Invalid LIMIT/OFFSET value: ${value}. Value is required`);
    }

    const num = typeof value === 'string' ? parseInt(value, 10) : value;

    if (isNaN(num) || num < min || num > max) {
        throw new Error(`Invalid LIMIT/OFFSET value: ${value}. Must be between ${min} and ${max}`);
    }

    return Math.floor(num);
}

/**
 * Check if a string contains SQL injection patterns
 * 
 * @param str - String to check
 * @returns true if potentially dangerous patterns found
 */
export function containsSqlInjection(str: string): boolean {
    const dangerousPatterns = [
        /;.*\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXEC)\b/i,
        /--/,
        /\/\*/,
        /\*\//,
        /xp_/i,
        /\bUNION\b.*SELECT\b/i,
        /'.*'.*/,
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(str));
}

/**
 * Common column name whitelists for database operations
 */
export const COMMON_WHITELISTS = {
    ID_COLUMNS: new Set(['id', 'ID', '_id', 'Id']),
    TIMESTAMP_COLUMNS: new Set(['created_at', 'updated_at', 'deleted_at', 'createdAt', 'updatedAt', 'deletedAt']),
    COMMON_COLUMNS: new Set([
        'id', 'name', 'code', 'type', 'status', 'enabled',
        'created_at', 'updated_at', 'deleted_at',
        'createdAt', 'updatedAt', 'deletedAt',
    ]),
};
