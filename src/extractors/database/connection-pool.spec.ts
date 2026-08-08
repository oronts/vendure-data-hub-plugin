import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { CONNECTION_POOL, DatabaseType } from '../../constants';
import { resolveSafeRemoteAddresses } from '../../utils/remote-host-security.utils';
import { createDatabaseClient, testDatabaseConnection } from './connection-pool';

const drivers = vi.hoisted(() => {
    const state: {
        mysqlConfig?: unknown;
        postgresConfig?: unknown;
    } = {};
    const mysqlEnd = vi.fn(async () => undefined);
    const mysqlQuery = vi.fn(async () => [[], []]);
    const postgresEnd = vi.fn(async () => undefined);
    const postgresOn = vi.fn();
    const postgresQuery = vi.fn(async () => ({
        rows: [],
        rowCount: 0,
        fields: [],
    }));

    return {
        state,
        mysqlEnd,
        mysqlQuery,
        postgresEnd,
        postgresOn,
        postgresQuery,
        createMysqlPool: vi.fn((config: unknown) => {
            state.mysqlConfig = config;
            return { end: mysqlEnd, query: mysqlQuery };
        }),
        createPostgresPool: vi.fn((config: unknown) => {
            state.postgresConfig = config;
            return { end: postgresEnd, on: postgresOn, query: postgresQuery };
        }),
    };
});

vi.mock('pg', () => ({
    Pool: drivers.createPostgresPool,
}));

vi.mock('mysql2/promise', () => ({
    createPool: drivers.createMysqlPool,
}));

vi.mock('../../utils/remote-host-security.utils', () => ({
    resolveSafeRemoteAddresses: vi.fn(async (hostname: string) => [{
        hostname,
        address: '203.0.113.10',
        family: 4,
    }]),
    createPinnedAddressLookup: vi.fn(() => vi.fn()),
}));

const context = {
    secrets: {
        get: vi.fn(async () => undefined),
    },
    logger: {
        error: vi.fn(),
    },
} as unknown as ExtractorContext;

describe('database driver query timeouts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        drivers.state.mysqlConfig = undefined;
        drivers.state.postgresConfig = undefined;
    });

    it('separates PostgreSQL connection and query timeouts', async () => {
        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            queryTimeoutMs: 12_345,
        });

        expect(drivers.state.postgresConfig).toEqual(expect.objectContaining({
            host: 'db.example.com',
            port: 5432,
            connectionTimeoutMillis: CONNECTION_POOL.ACQUIRE_TIMEOUT_MS,
            statement_timeout: 12_345,
            query_timeout: 12_345,
            stream: expect.any(Function),
        }));
        await client.close();
    });

    it('passes the configured timeout to each MySQL query', async () => {
        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.MYSQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            queryTimeoutMs: 23_456,
        });

        expect(drivers.state.mysqlConfig).toEqual(expect.objectContaining({
            host: 'db.example.com',
            port: 3306,
            connectTimeout: CONNECTION_POOL.ACQUIRE_TIMEOUT_MS,
            idleTimeout: CONNECTION_POOL.IDLE_TIMEOUT_MS,
            maxIdle: CONNECTION_POOL.MAX,
            stream: expect.any(Function),
        }));

        await client.query('SELECT ? AS value', [42]);

        expect(drivers.mysqlQuery).toHaveBeenCalledWith(
            { sql: 'SELECT ? AS value', timeout: 23_456 },
            [42],
        );
        await client.close();
    });

    it('fails closed before creating a driver pool for unsafe bounds', async () => {
        await expect(createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            pool: { max: CONNECTION_POOL.MAX + 1 },
        })).rejects.toThrow(
            `pool.max must be an integer from ${CONNECTION_POOL.MIN} to ${CONNECTION_POOL.MAX}`,
        );

        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it('uses the normalized URI endpoint without passing the URI to PostgreSQL', async () => {
        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            connectionString: 'postgres://reader:secret@uri.example.com:5544/catalog',
            query: 'SELECT 1',
        });

        expect(resolveSafeRemoteAddresses).toHaveBeenCalledWith('uri.example.com');
        expect(drivers.state.postgresConfig).toEqual(expect.objectContaining({
            host: 'uri.example.com',
            port: 5544,
            database: 'catalog',
            user: 'reader',
            password: 'secret',
        }));
        expect(drivers.state.postgresConfig).not.toEqual(expect.objectContaining({
            connectionString: expect.anything(),
        }));
        await client.close();
    });

    it('uses the URI port and enables MySQL TLS identity verification', async () => {
        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.MYSQL,
            connectionString: 'mysql://reader:secret@mysql.example.com:4406/catalog',
            query: 'SELECT 1',
            ssl: { enabled: true },
        });

        expect(drivers.state.mysqlConfig).toEqual(expect.objectContaining({
            host: 'mysql.example.com',
            port: 4406,
            database: 'catalog',
            user: 'reader',
            password: 'secret',
            ssl: expect.objectContaining({
                rejectUnauthorized: true,
                verifyIdentity: true,
            }),
        }));
        expect(drivers.state.mysqlConfig).not.toEqual(expect.objectContaining({
            uri: expect.anything(),
        }));
        await client.close();
    });

    it('fails before driver construction when global host policy rejects DNS', async () => {
        vi.mocked(resolveSafeRemoteAddresses).mockRejectedValueOnce(
            new Error('SSRF protection: private address'),
        );

        await expect(createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'internal.example.com',
            database: 'catalog',
            query: 'SELECT 1',
        })).rejects.toThrow('SSRF protection: private address');

        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it('rejects URI endpoint overrides before resolving or creating a pool', async () => {
        await expect(createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            connectionString: 'postgres://reader:secret@db.example.com/catalog?host=127.0.0.1',
            query: 'SELECT 1',
        })).rejects.toThrow('query parameters');

        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it.each([
        [DatabaseType.POSTGRESQL, drivers.createPostgresPool],
        [DatabaseType.MYSQL, drivers.createMysqlPool],
    ] as const)('requires a DNS hostname for verified %s TLS', async (databaseType, createPool) => {
        await expect(createDatabaseClient(context, {
            databaseType,
            host: '203.0.113.10',
            database: 'catalog',
            query: 'SELECT 1',
            ssl: { enabled: true },
        })).rejects.toThrow(
            'Verified database TLS requires a DNS hostname for certificate identity validation',
        );

        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
        expect(createPool).not.toHaveBeenCalled();
    });

    it('fails closed when a configured TLS trust secret is missing', async () => {
        await expect(createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            ssl: { enabled: true, caSecretCode: 'database-ca' },
        })).rejects.toThrow('Database TLS ca secret "database-ca" not found');

        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it('passes resolved trust and mutual-TLS secrets to the driver', async () => {
        vi.mocked(context.secrets.get)
            .mockResolvedValueOnce('trusted-ca')
            .mockResolvedValueOnce('client-certificate')
            .mockResolvedValueOnce('client-private-key');

        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.MYSQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            ssl: {
                enabled: true,
                caSecretCode: 'database-ca',
                certSecretCode: 'database-client-cert',
                keySecretCode: 'database-client-key',
            },
        });

        expect(context.secrets.get).toHaveBeenNthCalledWith(1, 'database-ca');
        expect(context.secrets.get).toHaveBeenNthCalledWith(2, 'database-client-cert');
        expect(context.secrets.get).toHaveBeenNthCalledWith(3, 'database-client-key');
        expect(drivers.state.mysqlConfig).toEqual(expect.objectContaining({
            ssl: {
                rejectUnauthorized: true,
                verifyIdentity: true,
                ca: 'trusted-ca',
                cert: 'client-certificate',
                key: 'client-private-key',
            },
        }));
        await client.close();
    });

    it('rejects an incomplete mutual-TLS identity before secret resolution', async () => {
        await expect(createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
            ssl: {
                enabled: true,
                certSecretCode: 'database-client-cert',
            },
        })).rejects.toThrow(
            'Database TLS client certificate and key secrets must be configured together',
        );

        expect(context.secrets.get).not.toHaveBeenCalled();
        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it('handles PostgreSQL idle-client errors without an uncaught pool error', async () => {
        const client = await createDatabaseClient(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
        });
        const registration = drivers.postgresOn.mock.calls.find(
            ([event]) => event === 'error',
        );
        expect(registration?.[1]).toEqual(expect.any(Function));

        const error = new Error('connection lost');
        registration?.[1](error);
        expect(context.logger.error).toHaveBeenCalledWith(
            'Idle PostgreSQL pool client failed',
            error,
        );
        await client.close();
    });

    it('returns a structured failure when connection setup is rejected', async () => {
        vi.mocked(resolveSafeRemoteAddresses).mockRejectedValueOnce(
            new Error('SSRF protection: private address'),
        );

        await expect(testDatabaseConnection(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'internal.example.com',
            database: 'catalog',
            query: 'SELECT 1',
        })).resolves.toEqual({
            success: false,
            error: 'SSRF protection: private address',
        });

        expect(drivers.createPostgresPool).not.toHaveBeenCalled();
    });

    it('closes the pool after a failed connection-test query', async () => {
        drivers.postgresQuery.mockRejectedValueOnce(new Error('authentication failed'));

        await expect(testDatabaseConnection(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'db.example.com',
            database: 'catalog',
            query: 'SELECT 1',
        })).resolves.toEqual({
            success: false,
            error: 'authentication failed',
        });

        expect(drivers.postgresEnd).toHaveBeenCalledOnce();
    });
});
