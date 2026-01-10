/**
 * Type declarations for optional database drivers
 *
 * These drivers are dynamically imported at runtime and are not required
 * at compile time. This file provides minimal type declarations to satisfy
 * TypeScript without requiring the packages to be installed.
 */

declare module 'pg' {
    export class Pool {
        constructor(config?: {
            host?: string;
            port?: number;
            database?: string;
            user?: string;
            password?: string;
            ssl?: boolean | { rejectUnauthorized?: boolean };
            connectionString?: string;
        });
        query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
        end(): Promise<void>;
    }
}

declare module 'mysql2/promise' {
    export function createConnection(config: {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?: boolean | object;
    }): Promise<{
        execute(query: string, params?: unknown[]): Promise<[Record<string, unknown>[], unknown]>;
        end(): Promise<void>;
    }>;
}

declare module 'mssql' {
    export interface IRecordSet<T> extends Array<T> {}
    export interface IResult<T> {
        recordset: IRecordSet<T>;
    }

    export interface config {
        server: string;
        port?: number;
        database: string;
        user?: string;
        password?: string;
        options?: {
            encrypt?: boolean;
            trustServerCertificate?: boolean;
        };
    }

    export interface ConnectionPool {
        request(): Request;
        close(): Promise<void>;
    }

    export function connect(config: config): Promise<ConnectionPool>;

    export class Request {
        query<T = Record<string, unknown>>(query: string): Promise<IResult<T>>;
    }
}

declare module 'better-sqlite3' {
    interface Database {
        prepare(sql: string): Statement;
        close(): void;
    }

    interface Statement {
        all(...params: unknown[]): Record<string, unknown>[];
    }

    interface DatabaseConstructor {
        new(filename: string): Database;
        (filename: string): Database;
    }

    const Database: DatabaseConstructor;
    export default Database;
}

declare module 'sqlite3' {
    export const verbose: () => typeof import('sqlite3');
    export class Database {
        constructor(filename: string);
    }
}

declare module 'sqlite' {
    export function open(config: {
        filename: string;
        driver: unknown;
    }): Promise<{
        all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
        close(): Promise<void>;
    }>;
}
