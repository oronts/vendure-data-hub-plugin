import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { DATABASE_TYPE_OPTIONS } from '../../constants/adapter-schema-options';
import { CONNECTION_POOL, DatabaseType, HTTP } from '../../constants';
import { createDatabaseClient } from './connection-pool';
import { DatabaseExtractor } from './database.extractor';
import type { DatabaseExtractorConfig } from './types';
import { resolveDatabaseExtractorConfig } from './database-config.resolver';
import { DATABASE_EXTRACTOR_SCHEMA } from './schema';
import { CONNECTION_SCHEMAS } from '../../constants/connection-schemas';

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

    it('maps saved database TLS controls to the extractor TLS contract', async () => {
        const resolved = await resolveDatabaseExtractorConfig(
            createContext({
                type: 'MYSQL',
                config: {
                    host: 'db.example.com',
                    database: 'catalog',
                    ssl: true,
                    sslRejectUnauthorized: true,
                    sslCaSecretCode: 'database-ca',
                    sslCertSecretCode: 'database-client-cert',
                    sslKeySecretCode: 'database-client-key',
                },
            }),
            {
                connectionCode: 'saved-database',
                query: 'SELECT 1',
            } as DatabaseExtractorConfig,
        );

        expect(resolved).toMatchObject({
            databaseType: DatabaseType.MYSQL,
            ssl: {
                enabled: true,
                rejectUnauthorized: true,
                caSecretCode: 'database-ca',
                certSecretCode: 'database-client-cert',
                keySecretCode: 'database-client-key',
            },
        });
        expect(resolved).not.toHaveProperty('sslCaSecretCode');
    });

    it('does not ignore saved TLS secrets when TLS is disabled', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(
            createContext({
                type: 'POSTGRES',
                config: {
                    host: 'db.example.com',
                    database: 'catalog',
                    sslCaSecretCode: 'database-ca',
                },
            }),
            {
                connectionCode: 'saved-database',
                query: 'SELECT 1',
            } as DatabaseExtractorConfig,
        );

        expect(result.errors).toContainEqual({
            field: 'ssl.enabled',
            message: 'TLS must be enabled when TLS secrets are configured',
        });
    });

    it('exposes TLS trust and mutual-TLS controls in dynamic schemas', () => {
        const extractorFields = DATABASE_EXTRACTOR_SCHEMA.fields.map(field => field.key);
        const expectedExtractorFields = [
            'ssl.enabled',
            'ssl.rejectUnauthorized',
            'ssl.caSecretCode',
            'ssl.certSecretCode',
            'ssl.keySecretCode',
        ];
        expect(extractorFields).toEqual(expect.arrayContaining(expectedExtractorFields));

        for (const connectionType of ['POSTGRES', 'MYSQL'] as const) {
            const schema = CONNECTION_SCHEMAS.find(entry => entry.type === connectionType);
            expect(schema?.fields.map(field => field.key)).toEqual(expect.arrayContaining([
                'ssl',
                'sslRejectUnauthorized',
                'sslCaSecretCode',
                'sslCertSecretCode',
                'sslKeySecretCode',
            ]));
        }
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
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            namedParameters: { status: 'active' },
            schema: 'main',
            includeQueryMetadata: true,
            pool: { min: 1, max: 2 },
            incremental: { enabled: false, column: 'updated_at', type: 'timestamp' },
        } as never);

        expect(result.errors.map(error => error.field)).toEqual([
            'namedParameters',
            'schema',
            'includeQueryMetadata',
            'pool.min',
            'incremental.type',
        ]);
    });

    it.each([0, 1.5, HTTP.MAX_TIMEOUT_MS + 1])(
        'rejects unsafe query timeout %s',
        async queryTimeoutMs => {
            const extractor = new DatabaseExtractor();
            const result = await extractor.validate(createContext(), {
                databaseType: DatabaseType.POSTGRESQL,
                host: 'db.example.com',
                database: 'catalog',
                query: 'SELECT 1',
                queryTimeoutMs,
            });

            expect(result.errors).toContainEqual({
                field: 'queryTimeoutMs',
                message: `Query timeout must be an integer from 1 to ${HTTP.MAX_TIMEOUT_MS} milliseconds`,
            });
        },
    );

    it('rejects query timeout for SQLite', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(createContext(), {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT 1',
            queryTimeoutMs: HTTP.TIMEOUT_MS,
        });

        expect(result.errors).toContainEqual({
            field: 'queryTimeoutMs',
            message: 'queryTimeoutMs is not supported for SQLite',
        });
    });

    it('rejects transport settings that SQLite cannot apply', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(createContext(), {
            databaseType: DatabaseType.SQLITE,
            database: ':memory:',
            query: 'SELECT 1',
            ssl: { enabled: true },
            pool: { max: 2 },
        });

        expect(result.errors).toEqual(expect.arrayContaining([
            { field: 'ssl', message: 'TLS is not supported for SQLite' },
            { field: 'pool', message: 'Connection pools are not configurable for SQLite' },
        ]));
    });

    it('requires complete mutual-TLS credentials', async () => {
        const extractor = new DatabaseExtractor();
        const result = await extractor.validate(createContext(), {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            ssl: {
                enabled: true,
                certSecretCode: 'database-client-cert',
            },
        });

        expect(result.errors).toContainEqual({
            field: 'ssl.keySecretCode',
            message: 'TLS client certificate and key secrets must be configured together',
        });
    });

    it.each([
        [
            { max: 0 },
            'pool.max',
            `Pool size must be an integer from ${CONNECTION_POOL.MIN} to ${CONNECTION_POOL.MAX}`,
        ],
        [
            { max: CONNECTION_POOL.MAX + 1 },
            'pool.max',
            `Pool size must be an integer from ${CONNECTION_POOL.MIN} to ${CONNECTION_POOL.MAX}`,
        ],
        [
            { idleTimeoutMs: 0 },
            'pool.idleTimeoutMs',
            `Pool idle timeout must be an integer from 1 to ${HTTP.MAX_TIMEOUT_MS} milliseconds`,
        ],
        [
            { idleTimeoutMs: HTTP.MAX_TIMEOUT_MS + 1 },
            'pool.idleTimeoutMs',
            `Pool idle timeout must be an integer from 1 to ${HTTP.MAX_TIMEOUT_MS} milliseconds`,
        ],
    ] as const)(
        'rejects unsafe pool configuration %j',
        async (pool, field, message) => {
            const extractor = new DatabaseExtractor();
            const result = await extractor.validate(createContext(), {
                databaseType: DatabaseType.POSTGRESQL,
                host: 'db.example.com',
                database: 'catalog',
                query: 'SELECT 1',
                pool,
            });

            expect(result.errors).toContainEqual({ field, message });
        },
    );

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
