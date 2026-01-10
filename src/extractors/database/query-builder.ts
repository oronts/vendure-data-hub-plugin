import { JsonValue } from '../../types/index';
import { DatabaseExtractorConfig, DatabasePaginationConfig, PaginationState } from './types';

export function buildPaginatedQuery(
    query: string,
    pagination: DatabasePaginationConfig | undefined,
    state: PaginationState,
): string {
    if (!pagination?.enabled) return query;

    if (pagination.type === 'offset') {
        return `${query} LIMIT ${pagination.pageSize} OFFSET ${state.offset}`;
    }

    if (pagination.type === 'cursor' && state.cursor !== undefined) {
        const cursorFilter = `${pagination.cursorColumn} > ${formatSqlValue(state.cursor)}`;
        if (/WHERE/i.test(query)) {
            return `${query} AND ${cursorFilter} ORDER BY ${pagination.cursorColumn} LIMIT ${pagination.pageSize}`;
        }
        return `${query} WHERE ${cursorFilter} ORDER BY ${pagination.cursorColumn} LIMIT ${pagination.pageSize}`;
    }

    return `${query} LIMIT ${pagination.pageSize}`;
}

export function appendIncrementalFilter(
    query: string,
    config: DatabaseExtractorConfig,
    lastValue: JsonValue,
): string {
    if (!config.incremental?.enabled || lastValue === undefined) {
        return query;
    }

    const column = config.incremental.column;
    const operator = '>';
    const value = formatSqlValue(lastValue);
    const filter = `${column} ${operator} ${value}`;

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

export function validateQuery(query: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const queryUpper = query.trim().toUpperCase();

    if (!queryUpper.startsWith('SELECT')) {
        errors.push('Query must be a SELECT statement');
    }

    const dangerousOperations = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;
    if (dangerousOperations.test(query)) {
        errors.push('Query contains potentially dangerous operations. Only SELECT is allowed.');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export function hasLimitClause(query: string): boolean {
    return /\bLIMIT\b/i.test(query);
}

export function extractSelectColumns(query: string): string[] {
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) return [];

    const columnsPart = selectMatch[1];
    if (columnsPart.trim() === '*') return ['*'];

    const columns: string[] = [];
    let depth = 0;
    let current = '';

    for (const char of columnsPart) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
                const aliasMatch = trimmed.match(/\bAS\s+(\w+)$/i);
                columns.push(aliasMatch ? aliasMatch[1] : trimmed.split(/\s+/).pop() || trimmed);
            }
            current = '';
            continue;
        }
        current += char;
    }

    const trimmed = current.trim();
    if (trimmed) {
        const aliasMatch = trimmed.match(/\bAS\s+(\w+)$/i);
        columns.push(aliasMatch ? aliasMatch[1] : trimmed.split(/\s+/).pop() || trimmed);
    }

    return columns;
}
