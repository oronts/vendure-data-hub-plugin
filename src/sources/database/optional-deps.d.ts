/**
 * Type declarations for optional database dependencies.
 *
 * These modules are dynamically imported and only required if the
 * corresponding database type is used.
 */

// PostgreSQL driver
declare module 'pg' {
    export interface PoolConfig {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?: boolean | { rejectUnauthorized?: boolean };
        connectionString?: string;
    }

    export interface QueryResult<T = Record<string, unknown>> {
        rows: T[];
        rowCount: number;
    }

    export class Pool {
        constructor(config?: PoolConfig);
        query<T = Record<string, unknown>>(
            text: string,
            values?: unknown[],
        ): Promise<QueryResult<T>>;
        end(): Promise<void>;
    }
}

// MySQL driver
declare module 'mysql2/promise' {
    export interface ConnectionConfig {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?: object;
    }

    export interface Connection {
        execute<T = Record<string, unknown>>(
            sql: string,
            values?: unknown[],
        ): Promise<[T[], unknown]>;
        end(): Promise<void>;
    }

    export function createConnection(config: ConnectionConfig): Promise<Connection>;
}

// MSSQL driver
declare module 'mssql' {
    export interface config {
        server: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        options?: {
            encrypt?: boolean;
            trustServerCertificate?: boolean;
        };
    }

    export interface IResult<T = Record<string, unknown>> {
        recordset: T[];
    }

    export interface IRequest {
        query<T = Record<string, unknown>>(command: string): Promise<IResult<T>>;
    }

    export interface ConnectionPool {
        request(): IRequest;
        close(): Promise<void>;
    }

    export function connect(config: config): Promise<ConnectionPool>;
}

// SQLite drivers
declare module 'better-sqlite3' {
    interface Statement<T = Record<string, unknown>> {
        all(...params: unknown[]): T[];
    }

    interface Database {
        prepare<T = Record<string, unknown>>(sql: string): Statement<T>;
        close(): void;
    }

    interface DatabaseConstructor {
        new (filename: string): Database;
        (filename: string): Database;
    }

    const Database: DatabaseConstructor;
    export default Database;
}

declare module 'sqlite3' {
    export class Database {}
}

declare module 'sqlite' {
    import { Database as SQLite3Database } from 'sqlite3';

    export interface OpenConfig {
        filename: string;
        driver: typeof SQLite3Database;
    }

    export interface Database {
        all<T = Record<string, unknown>>(
            sql: string,
            params?: unknown[],
        ): Promise<T[]>;
        close(): Promise<void>;
    }

    export function open(config: OpenConfig): Promise<Database>;
}
