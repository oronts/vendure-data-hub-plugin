import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { DATABASE_TYPE_OPTIONS } from '../../constants/adapter-schema-options';
import { DatabaseType } from '../../constants';
import { createDatabaseClient } from './connection-pool';
import { DatabaseExtractor } from './database.extractor';
import type { DatabaseExtractorConfig } from './types';

function createContext(connection?: {
    type: string;
    config: Record<string, unknown>;
}): ExtractorContext {
    return {
        secrets: {
            get: vi.fn().mockResolvedValue(undefined),
        },
        connections: {
            get: vi.fn(),
            getRequired: vi.fn(async () => ({
                code: 'saved-database',
                type: connection?.type ?? 'POSTGRES',
                config: connection?.config ?? {},
            })),
        },
    } as unknown as ExtractorContext;
}

describe('database extractor contract', () => {
    it('executes SQLite queries through the installed driver', async () => {
        const client = await createDatabaseClient(createContext(), {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT 1',
        } as DatabaseExtractorConfig);

        try {
            await expect(client.query('SELECT ? AS value', [42])).resolves.toMatchObject({
                rows: [{ value: 42 }],
                rowCount: 1,
            });
        } finally {
            await client.close();
        }
    });

    it('infers PostgreSQL for a saved POSTGRES connection during validation', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(
            createContext({
                type: 'POSTGRES',
                config: {
                    host: 'db.example.com',
                    port: 5432,
                    database: 'catalog',
                    username: 'reader',
                    ssl: true,
                },
            }),
            {
                connectionCode: 'saved-database',
                query: 'SELECT 1',
            } as DatabaseExtractorConfig,
        );

        expect(result).toEqual({ valid: true, errors: [], warnings: [] });
    });

    it('does not advertise database drivers that always throw', () => {
        expect(Object.values(DatabaseType)).toEqual([
            DatabaseType.POSTGRESQL,
            DatabaseType.MYSQL,
            DatabaseType.SQLITE,
        ]);
        expect(DATABASE_TYPE_OPTIONS.map(option => option.value)).toEqual([
            DatabaseType.POSTGRESQL,
            DatabaseType.MYSQL,
            DatabaseType.SQLITE,
        ]);
    });

    it.each(['MSSQL', 'ORACLE'] as const)('rejects removed %s database types from untyped input', async databaseType => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(createContext(), {
            databaseType: databaseType as DatabaseType,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual({
            field: 'databaseType',
            message: `${databaseType} is not supported by the database extractor`,
        });
    });

    it('rejects configuration fields that have no execution semantics', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(createContext(), {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT 1',
            namedParameters: { status: 'active' },
            schema: 'main',
            includeQueryMetadata: true,
            pool: { min: 1, max: 2 },
            incremental: { enabled: true, column: 'updated_at', type: 'timestamp' },
        } as never);

        expect(result.errors.map(error => error.field)).toEqual([
            'namedParameters',
            'schema',
            'includeQueryMetadata',
            'pool.min',
            'incremental.type',
        ]);
    });

    it('rejects the removed generic saved database connection', async () => {
        const extractor = new DatabaseExtractor();

        await expect(extractor.validate(
            createContext({
                type: 'DATABASE',
                config: {
                    databaseType: 'POSTGRESQL',
                    host: 'db.example.com',
                    database: 'catalog',
                },
            }),
            {
                connectionCode: 'saved-database',
                query: 'SELECT 1',
            } as DatabaseExtractorConfig,
        )).rejects.toThrow('expected POSTGRES or MYSQL');
    });
});
