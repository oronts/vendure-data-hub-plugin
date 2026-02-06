/**
 * SQL Security Utilities
 *
 * Protection against SQL injection attacks through:
 * - Column/table name validation
 * - Identifier escaping
 * - SQL injection pattern detection
 *
 * IMPORTANT: These utilities should be used alongside parameterized queries,
 * not as a replacement. Always use parameterized queries for user input.
 */

/** Maximum allowed identifier length (most DBs support at least 128) */
const MAX_IDENTIFIER_LENGTH = 128;

const VALID_COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VALID_TABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

/**
 * Validates a column name for SQL safety.
 *
 * @param column - The column name to validate
 * @param allowedColumns - Optional whitelist of allowed column names
 * @throws Error if column is invalid or not in whitelist
 */
export function validateColumnName(
    column: string | undefined,
    allowedColumns: Set<string> = new Set(),
): void {
    if (!column) {
        throw new Error('Column name is required');
    }

    if (column.length > MAX_IDENTIFIER_LENGTH) {
        throw new Error(`Column name exceeds maximum length of ${MAX_IDENTIFIER_LENGTH} characters`);
    }

    if (!VALID_COLUMN_PATTERN.test(column)) {
        throw new Error(`Invalid column name: "${column}". Column names must start with letter or underscore and contain only letters, numbers, and underscores.`);
    }

    if (allowedColumns.size > 0 && !allowedColumns.has(column)) {
        throw new Error(`Column "${column}" is not in allowed columns list`);
    }
}

/**
 * Validates a table name for SQL safety.
 * Supports schema-qualified names (e.g., "schema.table").
 *
 * @param table - The table name to validate
 * @throws Error if table name is invalid
 */
export function validateTableName(table: string | undefined): void {
    if (!table) {
        throw new Error('Table name is required');
    }

    // Check total length (schema.table could be up to 2x + 1)
    if (table.length > (MAX_IDENTIFIER_LENGTH * 2 + 1)) {
        throw new Error(`Table name exceeds maximum allowed length`);
    }

    if (!VALID_TABLE_PATTERN.test(table)) {
        throw new Error(`Invalid table name: "${table}"`);
    }
}

/**
 * Escapes an SQL identifier (column/table name) for safe interpolation.
 * Uses double-quote escaping per SQL standard.
 *
 * IMPORTANT: Prefer parameterized queries when possible.
 * Use only when identifiers must be interpolated.
 *
 * @param identifier - The identifier to escape
 * @returns Escaped identifier wrapped in double quotes
 */
export function escapeSqlIdentifier(identifier: string): string {
    validateColumnName(identifier);
    return `"${identifier.replace(/"/g, '""')}"`;
}

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
 * Maximum string length to check for SQL injection patterns.
 * Prevents ReDoS attacks on very long strings.
 */
const MAX_SQL_CHECK_LENGTH = 10_000;

/**
 * Check if a string contains potential SQL injection patterns.
 * Note: This is a heuristic check and should be used alongside parameterized queries.
 *
 * @param str - String to check
 * @returns true if potential SQL injection detected
 */
export function containsSqlInjection(str: string): boolean {
    // Truncate very long strings to prevent ReDoS
    const checkStr = str.length > MAX_SQL_CHECK_LENGTH ? str.slice(0, MAX_SQL_CHECK_LENGTH) : str;

    // Use simpler patterns that are less susceptible to ReDoS
    // Pattern 1: Statement terminator followed by DDL/DML commands
    if (/;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXEC)\b/i.test(checkStr)) {
        return true;
    }

    // Pattern 2: SQL comment indicators
    if (/--/.test(checkStr) || /\/\*/.test(checkStr) || /\*\//.test(checkStr)) {
        return true;
    }

    // Pattern 3: xp_ extended stored procedures (SQL Server specific)
    if (/\bxp_\w/i.test(checkStr)) {
        return true;
    }

    // Pattern 4: UNION-based injection (simplified to avoid ReDoS)
    if (/\bUNION\b[\s\S]{0,50}\bSELECT\b/i.test(checkStr)) {
        return true;
    }

    // Pattern 5: Multiple single quotes (potential string escape attack)
    // Count single quotes instead of using regex that could ReDoS
    const quoteCount = (checkStr.match(/'/g) || []).length;
    if (quoteCount >= 4) {
        return true;
    }

    return false;
}

export const COMMON_WHITELISTS = {
    ID_COLUMNS: new Set(['id', 'ID', '_id', 'Id']),
    TIMESTAMP_COLUMNS: new Set(['created_at', 'updated_at', 'deleted_at', 'createdAt', 'updatedAt', 'deletedAt']),
    COMMON_COLUMNS: new Set([
        'id', 'name', 'code', 'type', 'status', 'enabled',
        'created_at', 'updated_at', 'deleted_at',
        'createdAt', 'updatedAt', 'deletedAt',
    ]),
};
