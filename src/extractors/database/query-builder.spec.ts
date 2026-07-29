import { describe, expect, it } from 'vitest';
import { DatabasePaginationType, DatabaseType } from '../../constants';
import type { DatabasePaginationConfig } from './types';
import { buildPaginatedQuery } from './query-builder';

const cursorPagination: DatabasePaginationConfig = {
    enabled: true,
    type: DatabasePaginationType.CURSOR,
    pageSize: 100,
    cursorColumn: 'updated_at',
    cursorTieBreakerColumn: 'id',
};

describe('database pagination query builder', () => {
    it.each([
        {
            databaseType: DatabaseType.POSTGRESQL,
            cursorColumn: '"updated_at"',
            tieBreakerColumn: '"id"',
        },
        {
            databaseType: DatabaseType.SQLITE,
            cursorColumn: '"updated_at"',
            tieBreakerColumn: '"id"',
        },
        {
            databaseType: DatabaseType.MYSQL,
            cursorColumn: '`updated_at`',
            tieBreakerColumn: '`id`',
        },
    ])('builds composite keyset queries for $databaseType', ({
        databaseType,
        cursorColumn,
        tieBreakerColumn,
    }) => {
        const firstPage = buildPaginatedQuery(
            'SELECT id, updated_at FROM products;',
            cursorPagination,
            { offset: 0 },
            databaseType,
        );
        const nextPage = buildPaginatedQuery(
            'SELECT id, updated_at FROM products',
            cursorPagination,
            { offset: 0, cursor: '2026-07-18T08:00:00Z', cursorTieBreaker: 42 },
            databaseType,
        );

        const baseQuery = 'SELECT * FROM (SELECT id, updated_at FROM products) AS _dh_paginated';
        expect(firstPage).toBe(
            `${baseQuery} ORDER BY ${cursorColumn}, ${tieBreakerColumn} LIMIT 100`,
        );
        expect(nextPage).toBe(
            `${baseQuery} WHERE (${cursorColumn} > '2026-07-18T08:00:00Z' OR (${cursorColumn} = '2026-07-18T08:00:00Z' AND ${tieBreakerColumn} > 42)) ORDER BY ${cursorColumn}, ${tieBreakerColumn} LIMIT 100`,
        );
    });

    it('rejects cursor configurations without a distinct tie-breaker', () => {
        expect(() => buildPaginatedQuery(
            'SELECT id FROM products',
            { ...cursorPagination, cursorTieBreakerColumn: undefined },
            { offset: 0 },
            DatabaseType.POSTGRESQL,
        )).toThrow('cursorTieBreakerColumn is required');
        expect(() => buildPaginatedQuery(
            'SELECT id FROM products',
            { ...cursorPagination, cursorTieBreakerColumn: 'updated_at' },
            { offset: 0 },
            DatabaseType.POSTGRESQL,
        )).toThrow('cursorColumn and cursorTieBreakerColumn must be different');
    });

    it('rejects incomplete composite cursor state', () => {
        expect(() => buildPaginatedQuery(
            'SELECT id, updated_at FROM products',
            cursorPagination,
            { offset: 0, cursor: '2026-07-18T08:00:00Z' },
            DatabaseType.POSTGRESQL,
        )).toThrow('Cursor pagination state must include both cursor values');
    });

});
