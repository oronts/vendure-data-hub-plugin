import { Pool as PgPool } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mysql2 = require('mysql2/promise');
import { ExtractorContext } from '../../types/index';
import { DatabaseExtractorConfig, DATABASE_DEFAULT_PORTS } from './types';
import { DatabaseType, CONNECTION_POOL, HTTP } from '../../constants/index';

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

async function createPostgresClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    const poolConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port || DATABASE_DEFAULT_PORTS[DatabaseType.POSTGRESQL],
        database: config.database,
        user: config.username,
        max: config.pool?.max ?? CONNECTION_POOL.MAX,
        idleTimeoutMillis: config.pool?.idleTimeoutMs ?? CONNECTION_POOL.IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: config.queryTimeoutMs ?? HTTP.TIMEOUT_MS,
    };

    if (config.passwordSecretCode) {
        poolConfig.password = await context.secrets.get(config.passwordSecretCode);
    }

    if (config.ssl?.enabled) {
        const ssl: Record<string, unknown> = {
            rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
        };

        if (config.ssl.caSecretCode) {
            const ca = await context.secrets.get(config.ssl.caSecretCode);
            if (ca) {
                ssl.ca = ca;
            }
        }
        if (config.ssl.certSecretCode) {
            const cert = await context.secrets.get(config.ssl.certSecretCode);
            if (cert) {
                ssl.cert = cert;
            }
        }
        if (config.ssl.keySecretCode) {
            const key = await context.secrets.get(config.ssl.keySecretCode);
            if (key) {
                ssl.key = key;
            }
        }
        poolConfig.ssl = ssl;
    }

    if (config.connectionStringSecretCode) {
        const connectionString = await context.secrets.get(config.connectionStringSecretCode);
        if (connectionString) {
            poolConfig.connectionString = connectionString;
        }
    } else if (config.connectionString) {
        poolConfig.connectionString = config.connectionString;
    }

    const pool = new PgPool(poolConfig);

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
    const poolConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port || DATABASE_DEFAULT_PORTS[DatabaseType.MYSQL],
        database: config.database,
        user: config.username,
        waitForConnections: true,
        connectionLimit: config.pool?.max ?? 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
    };

    if (config.passwordSecretCode) {
        poolConfig.password = await context.secrets.get(config.passwordSecretCode);
    }

    if (config.ssl?.enabled) {
        const ssl: Record<string, unknown> = {
            rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
        };

        if (config.ssl.caSecretCode) {
            const ca = await context.secrets.get(config.ssl.caSecretCode);
            if (ca) {
                ssl.ca = ca;
            }
        }
        if (config.ssl.certSecretCode) {
            const cert = await context.secrets.get(config.ssl.certSecretCode);
            if (cert) {
                ssl.cert = cert;
            }
        }
        if (config.ssl.keySecretCode) {
            const key = await context.secrets.get(config.ssl.keySecretCode);
            if (key) {
                ssl.key = key;
            }
        }
        poolConfig.ssl = ssl;
    }

    const pool = mysql2.createPool(poolConfig);

    return {
        async query(sql: string, params?: unknown[]): Promise<DatabaseQueryResult> {
            const [rows, fields] = await pool.query(sql, params);
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
            throw new Error(
                'SQLite extraction requires the better-sqlite3 package. ' +
                    'Install it with: npm install better-sqlite3',
            );

        case DatabaseType.MSSQL:
            throw new Error(
                'SQL Server extraction requires the mssql package. ' +
                    'Install it with: npm install mssql',
            );

        case DatabaseType.ORACLE:
            throw new Error(
                'Oracle extraction requires the oracledb package. ' +
                    'Install it with: npm install oracledb',
            );

        default:
            throw new Error(`Unsupported database type: ${config.databaseType}`);
    }
}

export async function testDatabaseConnection(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
    testQuery: string,
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();

    try {
        const client = await createDatabaseClient(context, config);
        await client.query(testQuery);
        await client.close();

        return {
            success: true,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
