import { Pool as PgPool } from 'pg';
import { ExtractorContext } from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { isBlockedHostname } from '../../utils/url-security.utils';
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

/**
 * Normalize a hostname extracted from a DSN connection string.
 * Strips quotes, protocol prefixes, instance names, ports, and IPv6 brackets.
 */
function normalizeDsnHostname(raw: string): string {
    let h = raw;
    h = h.replace(/^['"]|['"]$/g, '');     // Strip quotes: 'host' or "host"
    h = h.replace(/^tcp:/i, '');            // MSSQL tcp: prefix
    h = h.replace(/\\.*/g, '');             // MSSQL instance: host\INSTANCE -> host
    h = h.replace(/,\d+$/, '');             // MSSQL comma-port: host,1433 -> host
    // Strip IPv6 brackets but preserve the address
    if (h.startsWith('[') && h.includes(']')) {
        h = h.slice(1, h.indexOf(']'));
    }
    // Strip :port only for non-IPv6 (IPv6 has multiple colons)
    const colonCount = (h.match(/:/g) || []).length;
    if (colonCount === 1) {
        h = h.replace(/:\d+$/, '');         // IPv4 host:port -> host
    }
    return h.trim();
}

/**
 * Validate a connection string for SSRF by extracting and checking the hostname
 * against the blocklist. Does not perform DNS resolution.
 */
function validateConnectionStringSsrf(connectionString: string): void {
    // Try URL format first (postgres://host:5432/db)
    try {
        const url = new URL(connectionString);
        if (url.hostname && isBlockedHostname(url.hostname)) {
            throw new Error(`SSRF: connection to ${url.hostname} is blocked`);
        }
        return;
    } catch (e) {
        if (e instanceof Error && e.message.startsWith('SSRF:')) throw e;
    }

    // Extract and normalize hostname from DSN/key-value formats
    const patterns = [
        /\bhost\s*=\s*([^\s;,]+)/i,        // PostgreSQL: host=X
        /\bhostaddr\s*=\s*([^\s;,]+)/i,    // PostgreSQL: hostaddr=X (IP-only form)
        /\bServer\s*=\s*([^\s;,]+)/i,      // MSSQL: Server=X
        /\bData\s+Source\s*=\s*([^\s;,]+)/i, // Oracle/generic: Data Source=X
    ];
    for (const pattern of patterns) {
        const match = connectionString.match(pattern);
        if (match?.[1]) {
            const hostname = normalizeDsnHostname(match[1]);
            if (hostname && isBlockedHostname(hostname)) {
                throw new Error(`SSRF: connection to ${hostname} is blocked`);
            }
        }
    }
}

async function createPostgresClient(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseClient> {
    if (config.host && isBlockedHostname(config.host)) {
        throw new Error(`SSRF: connection to ${config.host} is blocked`);
    }

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
        const password = await context.secrets.get(config.passwordSecretCode);
        if (!password) {
            throw new Error(`Secret "${config.passwordSecretCode}" not found - create it in DataHub > Secrets before using this connection`);
        }
        poolConfig.password = password;
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
        if (!connectionString) {
            throw new Error(`Secret "${config.connectionStringSecretCode}" not found - create it in DataHub > Secrets`);
        }
        validateConnectionStringSsrf(connectionString);
        poolConfig.connectionString = connectionString;
    } else if (config.connectionString) {
        validateConnectionStringSsrf(config.connectionString);
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
    if (config.host && isBlockedHostname(config.host)) {
        throw new Error(`SSRF: connection to ${config.host} is blocked`);
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mysql2 = require('mysql2/promise');
    const poolConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port || DATABASE_DEFAULT_PORTS[DatabaseType.MYSQL],
        database: config.database,
        user: config.username,
        waitForConnections: true,
        connectionLimit: config.pool?.max ?? CONNECTION_POOL.MAX,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
    };

    if (config.passwordSecretCode) {
        const password = await context.secrets.get(config.passwordSecretCode);
        if (!password) {
            throw new Error(`Secret "${config.passwordSecretCode}" not found - create it in DataHub > Secrets before using this connection`);
        }
        poolConfig.password = password;
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

    // SSRF check for MySQL connection strings
    if (config.connectionStringSecretCode) {
        const connectionString = await context.secrets.get(config.connectionStringSecretCode);
        if (!connectionString) {
            throw new Error(`Secret "${config.connectionStringSecretCode}" not found - create it in DataHub > Secrets`);
        }
        validateConnectionStringSsrf(connectionString);
        poolConfig.uri = connectionString;
    } else if (config.connectionString) {
        validateConnectionStringSsrf(config.connectionString);
        poolConfig.uri = config.connectionString;
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
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    const client = await createDatabaseClient(context, config);

    try {
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
        await client.close();
    }
}
