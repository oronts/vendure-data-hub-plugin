import { JsonValue } from '../../types/index';
import {
    DatabaseCursorValue,
    DatabasePaginationConfig,
    PaginationState,
} from './types';
import { DatabasePaginationType, DatabaseType, PAGINATION } from '../../constants/index';
import { escapeSqlIdentifier, validateLimitOffset, containsSqlInjection } from '../../utils/sql-security.utils';

export function formatSqlValue(value: JsonValue | Date): string {
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

function escapeDatabaseIdentifier(identifier: string, databaseType: DatabaseType): string {
    return escapeSqlIdentifier(
        identifier,
        databaseType === DatabaseType.MYSQL ? '`' : '"',
    );
}

function formatCursorValue(value: DatabaseCursorValue | undefined, column: string): string {
    if (value === undefined) {
        throw new Error(`Cursor column "${column}" must contain a non-null scalar value`);
    }
    return formatSqlValue(value);
}

export function buildPaginatedQuery(
    query: string,
    pagination: DatabasePaginationConfig | undefined,
    state: PaginationState,
    databaseType: DatabaseType,
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
        if (!pagination.cursorTieBreakerColumn) {
            throw new Error('cursorTieBreakerColumn is required for cursor-based pagination');
        }
        if (pagination.cursorColumn === pagination.cursorTieBreakerColumn) {
            throw new Error('cursorColumn and cursorTieBreakerColumn must be different');
        }

        const cursorColumn = escapeDatabaseIdentifier(pagination.cursorColumn, databaseType);
        const tieBreakerColumn = escapeDatabaseIdentifier(
            pagination.cursorTieBreakerColumn,
            databaseType,
        );
        const hasCursor = state.cursor !== undefined;
        const hasTieBreaker = state.cursorTieBreaker !== undefined;

        if (hasCursor !== hasTieBreaker) {
            throw new Error('Cursor pagination state must include both cursor values');
        }

        if (hasCursor && hasTieBreaker) {
            const cursorValue = formatCursorValue(state.cursor, pagination.cursorColumn);
            const tieBreakerValue = formatCursorValue(
                state.cursorTieBreaker,
                pagination.cursorTieBreakerColumn,
            );
            const cursorFilter = `(${cursorColumn} > ${cursorValue} OR (${cursorColumn} = ${cursorValue} AND ${tieBreakerColumn} > ${tieBreakerValue}))`;
            return `${baseQuery} WHERE ${cursorFilter} ORDER BY ${cursorColumn}, ${tieBreakerColumn} LIMIT ${pageSize}`;
        }

        return `${baseQuery} ORDER BY ${cursorColumn}, ${tieBreakerColumn} LIMIT ${pageSize}`;
    }

    return `${baseQuery} LIMIT ${pageSize}`;
}
