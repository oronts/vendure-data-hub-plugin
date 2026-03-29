import { JsonValue } from '../../types/index';
import { DatabaseExtractorConfig, DatabasePaginationConfig, PaginationState } from './types';
import { DatabasePaginationType, PAGINATION } from '../../constants/index';
import { validateColumnName, escapeSqlIdentifier, validateLimitOffset, containsSqlInjection } from '../../utils/sql-security.utils';

export function formatSqlValue(value: JsonValue): string {
    if (value === null) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'`;
    }
    return 'NULL';
}

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

export function hasLimitClause(query: string): boolean {
    return /\bLIMIT\b/i.test(query);
}

function validateColumnNameSafe(column: string | undefined): void {
    if (!column) {
        throw new Error('Column name is required');
    }
    // Validate format only (letters, digits, underscores) - no whitelist restriction
    validateColumnName(column);
}

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

    const pageSize = validateLimitOffset(pagination.pageSize, 1, PAGINATION.DATABASE_MAX_PAGE_SIZE);

    // Wrap the user query in a subquery so we never modify the original SQL.
    // This safely handles ORDER BY / LIMIT inside subqueries or quoted strings.
    const baseQuery = `SELECT * FROM (${query.replace(/;\s*$/, '')}) AS _dh_paginated`;

    if (pagination.type === DatabasePaginationType.OFFSET) {
        const offset = validateLimitOffset(state.offset, 0, Number.MAX_SAFE_INTEGER);
        return `${baseQuery} LIMIT ${pageSize} OFFSET ${offset}`;
    }

    if (pagination.type === DatabasePaginationType.CURSOR) {
        if (!pagination.cursorColumn) {
            throw new Error('cursorColumn is required for cursor-based pagination');
        }

        validateColumnNameSafe(pagination.cursorColumn);
        const col = escapeSqlIdentifier(pagination.cursorColumn);

        if (state.cursor !== undefined) {
            const cursorValue = formatSqlValue(state.cursor);
            const cursorFilter = `${col} > ${cursorValue}`;
            return `${baseQuery} WHERE ${cursorFilter} ORDER BY ${col} LIMIT ${pageSize}`;
        }

        return `${baseQuery} ORDER BY ${col} LIMIT ${pageSize}`;
    }

    return `${baseQuery} LIMIT ${pageSize}`;
}

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
    validateColumnNameSafe(column);

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
