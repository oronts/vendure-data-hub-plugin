/**
 * Database Query Builder
 * 
 * Safe SQL query construction with validation and sanitization.
 * Prevents SQL injection attacks through proper validation.
 */

import { JsonValue } from '../../types/index';
import { DatabaseExtractorConfig, DatabasePaginationConfig, PaginationState } from './types';
import { validateColumnName, escapeSqlIdentifier, validateLimitOffset, containsSqlInjection } from '../../utils/sql-security.utils';

/**
 * Format SQL value for safe interpolation
 */
export function formatSqlValue(value: JsonValue): string {
    if (value === null) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'`;
    }
    return 'NULL';
}

/**
 * Validate query for security issues
 */
export function validateQuery(query: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const queryUpper = query.trim().toUpperCase();

    if (!queryUpper.startsWith('SELECT')) {
        errors.push('Query must be a SELECT statement');
    }

    if (containsSqlInjection(query)) {
        errors.push('Query contains potentially dangerous patterns');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Check if query has LIMIT clause
 */
export function hasLimitClause(query: string): boolean {
    return /\bLIMIT\b/i.test(query);
}

/**
 * Common column name whitelist for database operations
 */
const COMMON_COLUMN_WHITELIST = new Set([
    'id', 'ID', '_id', 'Id',
    'created_at', 'updated_at', 'deleted_at',
    'createdAt', 'updatedAt', 'deletedAt',
    'name', 'code', 'type', 'status', 'enabled',
]);

/**
 * Validate column name against whitelist
 */
function validateColumnNameWithWhitelist(column: string | undefined): void {
    if (!column) {
        throw new Error('Column name is required');
    }
    validateColumnName(column, COMMON_COLUMN_WHITELIST);
}

/**
 * Build SQL query with pagination
 * 
 * @param query - Base query
 * @param pagination - Pagination configuration
 * @param state - Current pagination state
 * @returns SQL query with pagination
 */
export function buildPaginatedQuery(
    query: string,
    pagination: DatabasePaginationConfig | undefined,
    state: PaginationState,
): string {
    if (!query) {
        throw new Error('Query is required');
    }

    const validation = validateQuery(query);
    if (!validation.valid) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
    }

    if (!pagination?.enabled) return query;

    const pageSize = validateLimitOffset(pagination.pageSize, 1, 100000);

    if (pagination.type === 'offset') {
        const offset = validateLimitOffset(state.offset, 0, Number.MAX_SAFE_INTEGER);
        return `${query} LIMIT ${pageSize} OFFSET ${offset}`;
    }

    if (pagination.type === 'cursor') {
        if (!pagination.cursorColumn) {
            throw new Error('cursorColumn is required for cursor-based pagination');
        }

        validateColumnNameWithWhitelist(pagination.cursorColumn);

        if (state.cursor !== undefined) {
            const cursorValue = formatSqlValue(state.cursor);
            const cursorFilter = `${escapeSqlIdentifier(pagination.cursorColumn)} > ${cursorValue}`;
            if (/WHERE/i.test(query)) {
                return `${query} AND ${cursorFilter} ORDER BY ${escapeSqlIdentifier(pagination.cursorColumn)} LIMIT ${pageSize}`;
            }
            return `${query} WHERE ${cursorFilter} ORDER BY ${escapeSqlIdentifier(pagination.cursorColumn)} LIMIT ${pageSize}`;
        }

        return `${query} ORDER BY ${escapeSqlIdentifier(pagination.cursorColumn)} LIMIT ${pageSize}`;
    }

    return `${query} LIMIT ${pageSize}`;
}

/**
 * Build SQL query with incremental sync filter
 * 
 * @param query - Base query
 * @param config - Database extractor configuration
 * @param lastValue - Last synced value
 * @returns SQL query with incremental filter
 */
export function appendIncrementalFilter(
    query: string,
    config: DatabaseExtractorConfig,
    lastValue: JsonValue,
): string {
    if (!query) {
        throw new Error('Query is required');
    }

    const validation = validateQuery(query);
    if (!validation.valid) {
        throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
    }

    if (!config.incremental?.enabled || lastValue === undefined) {
        return query;
    }

    const column = config.incremental.column;
    validateColumnNameWithWhitelist(column);

    const operator = '>';
    const value = formatSqlValue(lastValue);
    const filter = `${escapeSqlIdentifier(column)} ${operator} ${value}`;

    if (/WHERE/i.test(query)) {
        const insertionPoint = findClauseInsertionPoint(query);
        if (insertionPoint >= 0) {
            return (
                query.slice(0, insertionPoint) +
                ` AND ${filter}` +
                query.slice(insertionPoint)
            );
        }
        return `${query} AND ${filter}`;
    }

    const insertionPoint = findClauseInsertionPoint(query);
    if (insertionPoint >= 0) {
        return (
            query.slice(0, insertionPoint) +
            ` WHERE ${filter}` +
            query.slice(insertionPoint)
        );
    }

    return `${query} WHERE ${filter}`;
}

/**
 * Find the best insertion point for a WHERE clause
 */
function findClauseInsertionPoint(query: string): number {
    const keywords = ['ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT'];

    let earliestPosition = -1;

    for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        const match = regex.exec(query);
        if (match && (earliestPosition === -1 || match.index < earliestPosition)) {
            earliestPosition = match.index;
        }
    }

    return earliestPosition;
}
