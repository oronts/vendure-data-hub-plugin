/**
 * SQL Database Source
 *
 * Executes SQL queries against various database types.
 * Requires database-specific drivers (pg, mysql2, etc.)
 */

import {
    SqlDatabaseSourceConfig,
    SourceResult,
    DataSource,
    DatabaseConnection,
} from '../types';
import { DEFAULT_HOSTS, PORTS } from '../../constants/defaults';

/**
 * SQL database source implementation
 */
export class SqlDatabaseSource implements DataSource<SqlDatabaseSourceConfig> {
    /**
     * Fetch data from SQL database
     */
    async fetch(config: SqlDatabaseSourceConfig): Promise<SourceResult> {
        try {
            // Get the appropriate driver and execute query
            const records = await this.executeQuery(config);

            return {
                success: true,
                records,
                total: records.length,
            };
        } catch (err) {
            return {
                success: false,
                records: [],
                errors: [
                    {
                        code: 'DATABASE_ERROR',
                        message: err instanceof Error ? err.message : 'Database query failed',
                        retryable: this.isRetryableError(err),
                    },
                ],
            };
        }
    }

    /**
     * Test database connectivity
     */
    async test(config: SqlDatabaseSourceConfig): Promise<{ success: boolean; message?: string }> {
        try {
            // Try a simple test query
            const testQuery = this.getTestQuery(config.dbType);
            await this.executeQuery({ ...config, query: testQuery });

            return {
                success: true,
                message: `Connected to ${config.dbType} database`,
            };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'Connection failed',
            };
        }
    }

    /**
     * Execute SQL query
     */
    private async executeQuery(config: SqlDatabaseSourceConfig): Promise<Record<string, unknown>[]> {
        const { dbType, connection, query, params } = config;

        switch (dbType) {
            case 'postgresql':
                return this.executePostgresQuery(connection, query, params);
            case 'mysql':
                return this.executeMysqlQuery(connection, query, params);
            case 'mssql':
                return this.executeMssqlQuery(connection, query, params);
            case 'sqlite':
                return this.executeSqliteQuery(connection, query, params);
            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }
    }

    /**
     * Execute PostgreSQL query
     */
    private async executePostgresQuery(
        connection: DatabaseConnection,
        query: string,
        params?: unknown[],
    ): Promise<Record<string, unknown>[]> {
        try {
            const { Pool } = await import('pg');
            const pool = new Pool({
                host: connection.host,
                port: connection.port ?? PORTS.POSTGRESQL,
                database: connection.database,
                user: connection.username,
                password: connection.password,
                ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
                connectionString: connection.connectionString,
            });

            try {
                const result = await pool.query(query, params);
                return result.rows;
            } finally {
                await pool.end();
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('Cannot find module')) {
                throw new Error('PostgreSQL driver not installed. Run: npm install pg');
            }
            throw err;
        }
    }

    /**
     * Execute MySQL query
     */
    private async executeMysqlQuery(
        connection: DatabaseConnection,
        query: string,
        params?: unknown[],
    ): Promise<Record<string, unknown>[]> {
        try {
            const mysql = await import('mysql2/promise');
            const conn = await mysql.createConnection({
                host: connection.host,
                port: connection.port ?? PORTS.MYSQL,
                database: connection.database,
                user: connection.username,
                password: connection.password,
                ssl: connection.ssl ? {} : undefined,
            });

            try {
                const [rows] = await conn.execute(query, params);
                return rows as Record<string, unknown>[];
            } finally {
                await conn.end();
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('Cannot find module')) {
                throw new Error('MySQL driver not installed. Run: npm install mysql2');
            }
            throw err;
        }
    }

    /**
     * Execute MSSQL query
     */
    private async executeMssqlQuery(
        connection: DatabaseConnection,
        query: string,
        _params?: unknown[],
    ): Promise<Record<string, unknown>[]> {
        try {
            const mssql = await import('mssql');
            const config = {
                server: connection.host ?? DEFAULT_HOSTS.LOCALHOST,
                port: connection.port ?? PORTS.MSSQL,
                database: connection.database,
                user: connection.username,
                password: connection.password,
                options: {
                    encrypt: !!connection.ssl,
                    trustServerCertificate: true,
                },
            };

            const pool = await mssql.connect(config as Parameters<typeof mssql.connect>[0]);

            try {
                const result = await pool.request().query(query);
                return result.recordset;
            } finally {
                await pool.close();
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('Cannot find module')) {
                throw new Error('MSSQL driver not installed. Run: npm install mssql');
            }
            throw err;
        }
    }

    /**
     * Execute SQLite query
     */
    private async executeSqliteQuery(
        connection: DatabaseConnection,
        query: string,
        params?: unknown[],
    ): Promise<Record<string, unknown>[]> {
        try {
            // Try better-sqlite3 first (synchronous, faster)
            try {
                const betterSqlite3 = await import('better-sqlite3');
                const Database = betterSqlite3.default as new (filename: string) => {
                    prepare(sql: string): { all(...params: unknown[]): Record<string, unknown>[] };
                    close(): void;
                };
                const db = new Database(connection.database ?? ':memory:');

                try {
                    const stmt = db.prepare(query);
                    return params ? stmt.all(...params) : stmt.all();
                } finally {
                    db.close();
                }
            } catch {
                // better-sqlite3 not available - fall back to sqlite3 (async)
                const sqlite3 = await import('sqlite3');
                const { open } = await import('sqlite');

                const db = await open({
                    filename: connection.database ?? ':memory:',
                    driver: sqlite3.Database,
                });

                try {
                    return await db.all(query, params);
                } finally {
                    await db.close();
                }
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('Cannot find module')) {
                throw new Error('SQLite driver not installed. Run: npm install better-sqlite3 or npm install sqlite3 sqlite');
            }
            throw err;
        }
    }

    /**
     * Get test query for database type
     */
    private getTestQuery(dbType: string): string {
        switch (dbType) {
            case 'postgresql':
                return 'SELECT 1';
            case 'mysql':
                return 'SELECT 1';
            case 'mssql':
                return 'SELECT 1';
            case 'sqlite':
                return 'SELECT 1';
            default:
                return 'SELECT 1';
        }
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(err: unknown): boolean {
        if (!(err instanceof Error)) return false;

        const message = err.message.toLowerCase();

        // Connection errors are usually retryable
        if (message.includes('connection') || message.includes('timeout')) {
            return true;
        }

        // Deadlocks are retryable
        if (message.includes('deadlock')) {
            return true;
        }

        return false;
    }
}

/**
 * Create a SQL database source instance
 */
export function createSqlDatabaseSource(): SqlDatabaseSource {
    return new SqlDatabaseSource();
}

/**
 * Build connection string from config
 */
export function buildConnectionString(
    dbType: SqlDatabaseSourceConfig['dbType'],
    connection: DatabaseConnection,
): string {
    if (connection.connectionString) {
        return connection.connectionString;
    }

    const { host, port, database, username, password } = connection;

    switch (dbType) {
        case 'postgresql':
            return `postgresql://${username}:${password}@${host}:${port ?? 5432}/${database}`;
        case 'mysql':
            return `mysql://${username}:${password}@${host}:${port ?? 3306}/${database}`;
        case 'mssql':
            return `mssql://${username}:${password}@${host}:${port ?? 1433}/${database}`;
        case 'sqlite':
            return database ?? ':memory:';
        default:
            throw new Error(`Unknown database type: ${dbType}`);
    }
}
