import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext, RecordEnvelope } from '../../types';
import { DatabasePaginationType, DatabaseType, PAGINATION } from '../../constants';
import { DatabaseExtractor } from './database.extractor';
import { createDatabaseClient, testDatabaseConnection } from './connection-pool';
import type { DatabaseClient } from './connection-pool';
import type { DatabaseExtractorConfig } from './types';

vi.mock('./connection-pool', async importOriginal => {
    const original = await importOriginal<typeof import('./connection-pool')>();
    return {
        ...original,
        createDatabaseClient: vi.fn(),
        testDatabaseConnection: vi.fn(),
    };
});

function createContext(checkpointData: Record<string, string | number> = {}): ExtractorContext {
    return {
        checkpoint: { data: checkpointData },
        isCancelled: vi.fn().mockResolvedValue(false),
        setCheckpoint: vi.fn(),
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    } as unknown as ExtractorContext;
}

describe('DatabaseExtractor pagination', () => {
    it.each([
        { label: 'absent', pagination: undefined },
        {
            label: 'disabled',
            pagination: {
                enabled: false,
                type: DatabasePaginationType.OFFSET,
                pageSize: PAGINATION.DATABASE_PAGE_SIZE,
                maxPages: PAGINATION.MAX_PAGES,
            },
        },
    ])('executes an unpaginated query once when pagination is $label', async ({ pagination }) => {
        const rows = Array.from(
            { length: PAGINATION.DATABASE_PAGE_SIZE },
            (_, id) => ({ id }),
        );
        const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        const extractor = new DatabaseExtractor();
        const records: RecordEnvelope[] = [];
        for await (const record of extractor.extract(createContext(), {
            databaseType: 'POSTGRESQL',
            host: 'db.example.test',
            database: 'catalog',
            query: 'SELECT id FROM products',
            pagination,
        } as DatabaseExtractorConfig)) {
            records.push(record);
        }

        expect(query).toHaveBeenCalledOnce();
        expect(records).toHaveLength(PAGINATION.DATABASE_PAGE_SIZE);
        expect(close).toHaveBeenCalledOnce();
    });

    it('resumes after the full cursor pair when page boundaries share a cursor value', async () => {
        const pages = [
            [
                { id: 1, updated_at: '2026-07-18T08:00:00Z' },
                { id: 2, updated_at: '2026-07-18T08:00:00Z' },
            ],
            [
                { id: 3, updated_at: '2026-07-18T08:00:00Z' },
                { id: 4, updated_at: '2026-07-18T09:00:00Z' },
            ],
            [],
        ];
        const query = vi.fn();
        for (const rows of pages) {
            query.mockResolvedValueOnce({ rows, rowCount: rows.length });
        }
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        const records: RecordEnvelope[] = [];
        for await (const record of new DatabaseExtractor().extract(createContext(), {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.test',
            database: 'catalog',
            query: 'SELECT id, updated_at FROM products',
            pagination: {
                enabled: true,
                type: DatabasePaginationType.CURSOR,
                pageSize: 2,
                cursorColumn: 'updated_at',
                cursorTieBreakerColumn: 'id',
                maxPages: 10,
            },
        })) {
            records.push(record);
        }

        expect(records.map(record => record.data.id)).toEqual([1, 2, 3, 4]);
        expect(query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM (SELECT id, updated_at FROM products) AS _dh_paginated ORDER BY "updated_at", "id" LIMIT 2',
            undefined,
        );
        expect(query).toHaveBeenNthCalledWith(
            2,
            'SELECT * FROM (SELECT id, updated_at FROM products) AS _dh_paginated WHERE ("updated_at" > \'2026-07-18T08:00:00Z\' OR ("updated_at" = \'2026-07-18T08:00:00Z\' AND "id" > 2)) ORDER BY "updated_at", "id" LIMIT 2',
            undefined,
        );
        expect(query).toHaveBeenCalledTimes(3);
        expect(close).toHaveBeenCalledOnce();
    });

    it('checkpoints and resumes incremental extraction after the exact cursor pair', async () => {
        const firstPage = [
            { id: 41, updated_at: '2026-07-18T08:00:00Z' },
            { id: 42, updated_at: '2026-07-18T08:00:00Z' },
        ];
        const firstQuery = vi.fn().mockResolvedValue({
            rows: firstPage,
            rowCount: firstPage.length,
        });
        vi.mocked(createDatabaseClient).mockResolvedValueOnce({
            query: firstQuery,
            close: vi.fn().mockResolvedValue(undefined),
        } as DatabaseClient);
        const firstContext = createContext();
        const config: DatabaseExtractorConfig = {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.test',
            database: 'catalog',
            query: 'SELECT id, updated_at FROM products',
            pagination: {
                enabled: true,
                type: DatabasePaginationType.CURSOR,
                pageSize: 2,
                cursorColumn: 'updated_at',
                cursorTieBreakerColumn: 'id',
                maxPages: 1,
            },
            incremental: { enabled: true, column: 'updated_at' },
        };

        const firstRecords: RecordEnvelope[] = [];
        for await (const record of new DatabaseExtractor().extract(firstContext, config)) {
            firstRecords.push(record);
        }

        expect(firstRecords.map(record => record.data.id)).toEqual([41, 42]);
        expect(firstContext.setCheckpoint).toHaveBeenCalledWith({
            lastIncrementalValue: '2026-07-18T08:00:00Z',
            lastIncrementalTieBreaker: 42,
        });

        const secondContext = createContext({
            lastIncrementalValue: '2026-07-18T08:00:00Z',
            lastIncrementalTieBreaker: 42,
        });
        const secondQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
        vi.mocked(createDatabaseClient).mockResolvedValueOnce({
            query: secondQuery,
            close: vi.fn().mockResolvedValue(undefined),
        } as DatabaseClient);

        const secondRecords: RecordEnvelope[] = [];
        for await (const record of new DatabaseExtractor().extract(secondContext, config)) {
            secondRecords.push(record);
        }

        expect(secondRecords).toEqual([]);
        expect(secondQuery).toHaveBeenCalledWith(
            'SELECT * FROM (SELECT id, updated_at FROM products) AS _dh_paginated WHERE ("updated_at" > \'2026-07-18T08:00:00Z\' OR ("updated_at" = \'2026-07-18T08:00:00Z\' AND "id" > 42)) ORDER BY "updated_at", "id" LIMIT 2',
            undefined,
        );
    });

    it('fails closed on an incomplete incremental checkpoint', async () => {
        const context = createContext({
            lastIncrementalValue: '2026-07-18T08:00:00Z',
        });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({
            query: vi.fn(),
            close,
        } as DatabaseClient);

        const consume = async () => {
            for await (const _record of new DatabaseExtractor().extract(context, {
                databaseType: DatabaseType.POSTGRESQL,
                host: 'db.example.test',
                database: 'catalog',
                query: 'SELECT id, updated_at FROM products',
                pagination: {
                    enabled: true,
                    type: DatabasePaginationType.CURSOR,
                    pageSize: 100,
                    cursorColumn: 'updated_at',
                    cursorTieBreakerColumn: 'id',
                },
                incremental: { enabled: true, column: 'updated_at' },
            })) {
                throw new Error(`Unexpected record ${String(_record.data.id)}`);
            }
        };

        await expect(consume()).rejects.toThrow(
            'Incremental checkpoint requires both "lastIncrementalValue" and "lastIncrementalTieBreaker"',
        );
        expect(close).toHaveBeenCalledOnce();
    });

    it('fails before emitting a page with a null cursor boundary', async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [{ id: 1, updated_at: null }],
            rowCount: 1,
        });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);
        const records: RecordEnvelope[] = [];

        const consume = async () => {
            for await (const record of new DatabaseExtractor().extract(createContext(), {
                databaseType: DatabaseType.MYSQL,
                host: 'db.example.test',
                database: 'catalog',
                query: 'SELECT id, updated_at FROM products',
                pagination: {
                    enabled: true,
                    type: DatabasePaginationType.CURSOR,
                    pageSize: 1,
                    cursorColumn: 'updated_at',
                    cursorTieBreakerColumn: 'id',
                },
            })) {
                records.push(record);
            }
        };

        await expect(consume()).rejects.toThrow(
            'Cursor column "updated_at" must contain a non-null scalar value',
        );
        expect(records).toEqual([]);
        expect(close).toHaveBeenCalledOnce();
    });

    it('validates the required distinct safe cursor columns', async () => {
        const extractor = new DatabaseExtractor();
        const baseConfig: DatabaseExtractorConfig = {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT id, updated_at FROM products',
            pagination: {
                enabled: true,
                type: DatabasePaginationType.CURSOR,
                pageSize: 100,
                cursorColumn: 'updated_at',
            },
        };

        const missingTieBreaker = await extractor.validate(createContext(), baseConfig);
        expect(missingTieBreaker.errors).toContainEqual({
            field: 'pagination.cursorTieBreakerColumn',
            message: 'Cursor tie-breaker column is required for cursor-based pagination',
        });

        const invalidColumns = await extractor.validate(createContext(), {
            ...baseConfig,
            pagination: {
                ...baseConfig.pagination!,
                cursorColumn: 'updated_at DESC',
                cursorTieBreakerColumn: 'updated_at DESC',
            },
        });
        expect(invalidColumns.errors.map(error => error.field)).toEqual([
            'pagination.cursorTieBreakerColumn',
            'pagination.cursorColumn',
            'pagination.cursorTieBreakerColumn',
        ]);
    });

    it('requires incremental extraction to use the same composite cursor', async () => {
        const result = await new DatabaseExtractor().validate(createContext(), {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT id, updated_at FROM products',
            pagination: {
                enabled: true,
                type: DatabasePaginationType.OFFSET,
                pageSize: 100,
            },
            incremental: { enabled: true, column: 'updated_at' },
        });

        expect(result.errors).toContainEqual({
            field: 'pagination.type',
            message: 'Incremental extraction requires cursor pagination',
        });
    });

    it('uses the resource-safe shared connection test and preserves details', async () => {
        vi.mocked(testDatabaseConnection).mockResolvedValueOnce({
            success: true,
            latencyMs: 12,
        });
        const context = createContext();
        const config: DatabaseExtractorConfig = {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.test',
            database: 'catalog',
            query: 'SELECT id FROM products',
        };

        await expect(new DatabaseExtractor().testConnection(context, config)).resolves.toEqual({
            success: true,
            latencyMs: 12,
            details: {
                databaseType: DatabaseType.POSTGRESQL,
                host: 'db.example.test',
                port: 5432,
                database: 'catalog',
            },
        });
        expect(testDatabaseConnection).toHaveBeenCalledWith(context, config);
    });
});
