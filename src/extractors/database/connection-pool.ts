import { Pool as PgPool } from 'pg';
import {
    createPool as createMysqlPool,
    type PoolOptions as MysqlPoolOptions,
    type QueryOptions as MysqlQueryOptions,
} from 'mysql2/promise';
import { isIP } from 'net';
import { ExtractorContext } from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { resolveSafeRemoteAddresses } from '../../utils/remote-host-security.utils';
import { DatabaseExtractorConfig, DATABASE_DEFAULT_PORTS } from './types';
import { DatabaseType, CONNECTION_POOL, HTTP } from '../../constants/index';
import { resolveDatabaseEndpoint } from './database-endpoint';
import {
    createMysqlSocketFactory,
    createPostgresSocketFactory,
} from './database-socket';

export interface DatabaseClient {
    query(sql: string, parameters?: unknown[]): Promise<DatabaseQueryResult>;
    close(): Promise<void>;
}

export interface DatabaseQueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields?: Array<{
        name: string;
        type: string;
    }>;
}

export function getDefaultPort(databaseType: DatabaseType): number {
    return DATABASE_DEFAULT_PORTS[databaseType] ?? 0;
}

function resolveBoundedInteger(
    field: string,
    value: number | undefined,
    defaultValue: number,
    min: number,
    max: number,
): number {
    const resolved = value ?? defaultValue;
    if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
        throw new Error(`${field} must be an integer from ${min} to ${max}`);
    }
    return resolved;
}

function assertTlsIdentityHostname(
    config: DatabaseExtractorConfig,
    hostname: string,
): void {
    const verifiesCertificates = config.ssl?.enabled
        && (config.ssl.rejectUnauthorized ?? true);
    if (verifiesCertificates && isIP(hostname) !== 0) {
        throw new Error(
            'Verified database TLS requires a DNS hostname for certificate identity validation',
        );
    }
}

async function resolveDatabaseTlsOptions(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
    verifyIdentity = false,
): Promise<Record<string, unknown> | undefined> {
    const tlsConfig = config.ssl;
    const hasTlsSecrets = Boolean(
        tlsConfig?.caSecretCode
        || tlsConfig?.certSecretCode
        || tlsConfig?.keySecretCode,
    );
    if (!tlsConfig?.enabled) {
        if (hasTlsSecrets) {
            throw new Error(
                'Database TLS must be enabled when TLS secrets are configured',
            );
        }
        return undefined;
    }
    if (Boolean(tlsConfig.certSecretCode) !== Boolean(tlsConfig.keySecretCode)) {
        throw new Error(
            'Database TLS client certificate and key secrets must be configured together',
        );
    }

    const ssl: Record<string, unknown> = {
        rejectUnauthorized: tlsConfig.rejectUnauthorized ?? true,
        ...(verifyIdentity ? { verifyIdentity: true } : {}),
    };
    const secretFields = [
        ['caSecretCode', 'ca'],
        ['certSecretCode', 'cert'],
        ['keySecretCode', 'key'],
    ] as const;

    for (const [configField, sslField] of secretFields) {
        const secretCode = tlsConfig[configField];
        if (!secretCode) continue;

        const value = await context.secrets.get(secretCode);
        if (!value) {
            throw new Error(
                `Database TLS ${sslField} secret "${secretCode}" not found`,
            );
        }
        ssl[sslField] = value;
    }

    return ssl;
}

async function createPostgresClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    const endpoint = await resolveDatabaseEndpoint(
        context,
        config,
        DatabaseType.POSTGRESQL,
    );
    assertTlsIdentityHostname(config, endpoint.hostname);
    const ssl = await resolveDatabaseTlsOptions(context, config);
    const remotes = await resolveSafeRemoteAddresses(endpoint.hostname);

    const queryTimeoutMs = resolveBoundedInteger(
        'queryTimeoutMs',
        config.queryTimeoutMs,
        HTTP.TIMEOUT_MS,
        1,
        HTTP.MAX_TIMEOUT_MS,
    );
    const maxConnections = resolveBoundedInteger(
        'pool.max',
        config.pool?.max,
        CONNECTION_POOL.MAX,
        CONNECTION_POOL.MIN,
        CONNECTION_POOL.MAX,
    );
    const idleTimeoutMs = resolveBoundedInteger(
        'pool.idleTimeoutMs',
        config.pool?.idleTimeoutMs,
        CONNECTION_POOL.IDLE_TIMEOUT_MS,
        1,
        HTTP.MAX_TIMEOUT_MS,
    );
    const poolConfig: Record<string, unknown> = {
        host: remotes[0].hostname,
        port: endpoint.port,
        database: endpoint.database,
        user: endpoint.username,
        password: endpoint.password,
        stream: createPostgresSocketFactory(remotes, endpoint.port),
        max: maxConnections,
        idleTimeoutMillis: idleTimeoutMs,
        connectionTimeoutMillis: CONNECTION_POOL.ACQUIRE_TIMEOUT_MS,
        statement_timeout: queryTimeoutMs,
        query_timeout: queryTimeoutMs,
    };

    if (ssl) {
        poolConfig.ssl = ssl;
    }

    const pool = new PgPool(poolConfig);
    pool.on('error', error => {
        context.logger.error('Idle PostgreSQL pool client failed', error);
    });

    return {
        async query(sql: string, params?: unknown[]): Promise<DatabaseQueryResult> {
            const result = await pool.query(sql, params);
            return {
                rows: result.rows as Record<string, unknown>[],
                rowCount: (result as { rowCount?: number | null }).rowCount ?? result.rows.length,
                fields: (result as { fields?: Array<{ name: string; dataTypeID: number }> }).fields?.map(f => ({
                    name: f.name,
                    type: String(f.dataTypeID),
                })),
            };
        },
        async close(): Promise<void> {
            await pool.end();
        },
    };
}

async function createMysqlClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    const endpoint = await resolveDatabaseEndpoint(
        context,
        config,
        DatabaseType.MYSQL,
    );
    assertTlsIdentityHostname(config, endpoint.hostname);
    const ssl = await resolveDatabaseTlsOptions(context, config, true);
    const remotes = await resolveSafeRemoteAddresses(endpoint.hostname);

    const queryTimeoutMs = resolveBoundedInteger(
        'queryTimeoutMs',
        config.queryTimeoutMs,
        HTTP.TIMEOUT_MS,
        1,
        HTTP.MAX_TIMEOUT_MS,
    );
    const maxConnections = resolveBoundedInteger(
        'pool.max',
        config.pool?.max,
        CONNECTION_POOL.MAX,
        CONNECTION_POOL.MIN,
        CONNECTION_POOL.MAX,
    );
    const idleTimeoutMs = resolveBoundedInteger(
        'pool.idleTimeoutMs',
        config.pool?.idleTimeoutMs,
        CONNECTION_POOL.IDLE_TIMEOUT_MS,
        1,
        HTTP.MAX_TIMEOUT_MS,
    );
    const poolConfig: MysqlPoolOptions = {
        host: remotes[0].hostname,
        port: endpoint.port,
        database: endpoint.database,
        user: endpoint.username,
        password: endpoint.password,
        stream: createMysqlSocketFactory(remotes, endpoint.port),
        waitForConnections: true,
        connectionLimit: maxConnections,
        maxIdle: maxConnections,
        idleTimeout: idleTimeoutMs,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: CONNECTION_POOL.ACQUIRE_TIMEOUT_MS,
    };

    if (ssl) {
        poolConfig.ssl = ssl;
    }

    const pool = createMysqlPool(poolConfig);

    return {
        async query(sql: string, params?: unknown[]): Promise<DatabaseQueryResult> {
            const options: MysqlQueryOptions = {
                sql,
                timeout: queryTimeoutMs,
            };
            const [rows, fields] = await pool.query(options, params);
            const rowsArray = rows as Record<string, unknown>[];
            return {
                rows: rowsArray,
                rowCount: rowsArray.length,
                fields: (fields as Array<{ name: string; type: number }> | undefined)?.map(f => ({
                    name: f.name,
                    type: String(f.type),
                })),
            };
        },
        async close(): Promise<void> {
            await pool.end();
        },
    };
}

interface SqliteStatement {
    all(...parameters: unknown[]): Record<string, unknown>[];
    columns(): Array<{ name: string; type: string | null }>;
}

interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    close(): void;
}

interface SqliteDatabaseConstructor {
    new (
        filename: string,
        options: { readonly: boolean; fileMustExist: boolean },
    ): SqliteDatabase;
}

async function createSqliteClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    if (config.queryTimeoutMs !== undefined) {
        throw new Error('queryTimeoutMs is not supported for SQLite');
    }
    if (config.ssl?.enabled
        || config.ssl?.caSecretCode
        || config.ssl?.certSecretCode
        || config.ssl?.keySecretCode) {
        throw new Error('TLS is not supported for SQLite');
    }
    if (config.pool !== undefined) {
        throw new Error('Connection pools are not configurable for SQLite');
    }

    let filename = config.connectionString ?? config.database;
    if (config.connectionStringSecretCode) {
        filename = await context.secrets.get(config.connectionStringSecretCode);
        if (!filename) {
            throw new Error(`Secret "${config.connectionStringSecretCode}" not found - create it in DataHub > Secrets`);
        }
    }
    if (!filename) {
        throw new Error('SQLite database path is required');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BetterSqlite3 = require('better-sqlite3') as SqliteDatabaseConstructor;
    const isMemoryDatabase = filename === ':memory:';
    const database = new BetterSqlite3(filename, {
        readonly: !isMemoryDatabase,
        fileMustExist: !isMemoryDatabase,
    });

    return {
        async query(sql: string, parameters: unknown[] = []): Promise<DatabaseQueryResult> {
            const statement = database.prepare(sql);
            const rows = statement.all(...parameters);
            return {
                rows,
                rowCount: rows.length,
                fields: statement.columns().map(column => ({
                    name: column.name,
                    type: column.type ?? 'unknown',
                })),
            };
        },
        async close(): Promise<void> {
            database.close();
        },
    };
}

export async function createDatabaseClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    switch (config.databaseType) {
        case DatabaseType.POSTGRESQL:
            return createPostgresClient(context, config);

        case DatabaseType.MYSQL:
            return createMysqlClient(context, config);

        case DatabaseType.SQLITE:
            return createSqliteClient(context, config);

        default:
            throw new Error(`Unsupported database type: ${config.databaseType}`);
    }
}

export async function testDatabaseConnection(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    let client: DatabaseClient | undefined;

    try {
        client = await createDatabaseClient(context, config);
        await client.query('SELECT 1');

        return {
            success: true,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            success: false,
            error: getErrorMessage(error),
        };
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (error) {
                context.logger.warn('Failed to close database connection test client', {
                    error: getErrorMessage(error),
                });
            }
        }
    }
}
