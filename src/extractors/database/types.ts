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
    maxPages?: number;
}

export interface DatabaseIncrementalConfig {
    enabled: boolean;
    column: string;
    type: 'timestamp' | 'sequence' | 'id';
}

export interface DatabasePoolConfig {
    min?: number;
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

    /** Named parameters (for some database drivers) */
    namedParameters?: Record<string, JsonValue>;

    /** Pagination settings */
    pagination?: DatabasePaginationConfig;

    /** Incremental extraction settings */
    incremental?: DatabaseIncrementalConfig;

    /** Connection pool settings */
    pool?: DatabasePoolConfig;

    /** Query timeout in milliseconds */
    queryTimeoutMs?: number;

    /** Schema/namespace to use */
    schema?: string;

    /** Include query metadata in results */
    includeQueryMetadata?: boolean;
}

export interface PaginationState {
    offset: number;
    cursor?: JsonValue;
}

export const DATABASE_DEFAULT_PORTS: Record<DatabaseType, number> = {
    [DatabaseType.POSTGRESQL]: PORTS.POSTGRESQL,
    [DatabaseType.MYSQL]: PORTS.MYSQL,
    [DatabaseType.SQLITE]: 0,
    [DatabaseType.MSSQL]: PORTS.MSSQL,
    [DatabaseType.ORACLE]: PORTS.ORACLE,
};

export const DATABASE_TEST_QUERIES: Record<DatabaseType, string> = {
    [DatabaseType.POSTGRESQL]: 'SELECT 1',
    [DatabaseType.MYSQL]: 'SELECT 1',
    [DatabaseType.SQLITE]: 'SELECT 1',
    [DatabaseType.MSSQL]: 'SELECT 1',
    [DatabaseType.ORACLE]: 'SELECT 1 FROM DUAL',
};
