import { ExtractorConfig } from '../../types/index';
import { JsonValue } from '../../types/index';
import { DatabaseType, DatabasePaginationType, PORTS } from '../../constants/index';

export interface DatabaseSslConfig {
    enabled: boolean;
    rejectUnauthorized?: boolean;
    caSecretCode?: string;
    certSecretCode?: string;
    keySecretCode?: string;
}

export interface DatabasePaginationConfig {
    enabled: boolean;
    type: DatabasePaginationType;
    pageSize: number;
    cursorColumn?: string;
    cursorTieBreakerColumn?: string;
    maxPages?: number;
}

export interface DatabaseIncrementalConfig {
    enabled: boolean;
    column: string;
}

export interface DatabasePoolConfig {
    max?: number;
    idleTimeoutMs?: number;
}

export interface DatabaseExtractorConfig extends ExtractorConfig {
    /** Database type */
    databaseType: DatabaseType;

    /** Connection string or host */
    host?: string;

    /** Database port */
    port?: number;

    /** Database name */
    database?: string;

    /** Username */
    username?: string;

    /** Password secret code */
    passwordSecretCode?: string;

    /** Full connection string (alternative to individual settings) */
    connectionString?: string;

    /** Connection string secret code (for secure storage) */
    connectionStringSecretCode?: string;

    /** SSL/TLS settings */
    ssl?: DatabaseSslConfig;

    /** SQL query to execute */
    query: string;

    /** Query parameters (for parameterized queries) */
    parameters?: JsonValue[];

    /** Pagination settings */
    pagination?: DatabasePaginationConfig;

    /** Incremental extraction settings */
    incremental?: DatabaseIncrementalConfig;

    /** Connection pool settings */
    pool?: DatabasePoolConfig;

    /** Query timeout in milliseconds */
    queryTimeoutMs?: number;

}

export type DatabaseCursorValue = string | number | boolean | Date;

export interface PaginationState {
    offset: number;
    cursor?: DatabaseCursorValue;
    cursorTieBreaker?: DatabaseCursorValue;
}

export const DATABASE_DEFAULT_PORTS: Record<DatabaseType, number> = {
    [DatabaseType.POSTGRESQL]: PORTS.POSTGRESQL,
    [DatabaseType.MYSQL]: PORTS.MYSQL,
    [DatabaseType.SQLITE]: 0,
};

export const DATABASE_TEST_QUERIES: Record<DatabaseType, string> = {
    [DatabaseType.POSTGRESQL]: 'SELECT 1',
    [DatabaseType.MYSQL]: 'SELECT 1',
    [DatabaseType.SQLITE]: 'SELECT 1',
};
