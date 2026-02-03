/**
 * DataHub Sources - Common Types
 */

import { JsonObject } from '../types/index';
import { DataSourceType, RestPaginationStrategy, GraphQLPaginationStyle, AuthType } from '../constants/enums';

export type SourceType = DataSourceType;

/**
 * Base source configuration
 */
export interface BaseSourceConfig {
    /** Source type */
    type: SourceType;
    /** Human-readable name */
    name?: string;
    /** Connection reference (if using a saved connection) */
    connectionCode?: string;
}

// FILE SOURCE TYPES

/**
 * Local file source configuration
 */
export interface LocalFileSourceConfig extends BaseSourceConfig {
    type: 'local-file';
    /** Path to file or directory */
    path: string;
    /** File pattern for directory (glob) */
    pattern?: string;
    /** Watch for changes */
    watch?: boolean;
    /** Encoding */
    encoding?: BufferEncoding;
}

/**
 * Remote file source configuration (HTTP/HTTPS)
 */
export interface RemoteFileSourceConfig extends BaseSourceConfig {
    type: 'remote-file';
    /** URL to fetch file from */
    url: string;
    /** HTTP method */
    method?: 'GET' | 'POST';
    /** Request headers */
    headers?: Record<string, string>;
    /** Authentication configuration */
    auth?: AuthConfig;
    /** Request timeout in milliseconds */
    timeout?: number;
}

// API SOURCE TYPES

/**
 * REST API source configuration
 */
export interface RestApiSourceConfig extends BaseSourceConfig {
    type: 'rest-api';
    /** Base URL for the API */
    baseUrl: string;
    /** Endpoint path */
    endpoint: string;
    /** HTTP method */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** Query parameters */
    params?: Record<string, string | number | boolean>;
    /** Request body (for POST/PUT/PATCH) */
    body?: JsonObject;
    /** Authentication configuration */
    auth?: AuthConfig;
    /** Pagination configuration */
    pagination?: PaginationConfig;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Path to data array in response */
    dataPath?: string;
}

/**
 * GraphQL API source configuration
 */
export interface GraphqlApiSourceConfig extends BaseSourceConfig {
    type: 'graphql-api';
    /** GraphQL endpoint URL */
    url: string;
    /** GraphQL query */
    query: string;
    /** Query variables */
    variables?: Record<string, unknown>;
    /** Request headers */
    headers?: Record<string, string>;
    /** Authentication configuration */
    auth?: AuthConfig;
    /** Path to data in response */
    dataPath?: string;
    /** Pagination configuration */
    pagination?: GraphqlPaginationConfig;
}

// DATABASE SOURCE TYPES

/**
 * SQL database source configuration
 */
export interface SqlDatabaseSourceConfig extends BaseSourceConfig {
    type: 'sql-database';
    /** Database type */
    dbType: 'postgresql' | 'mysql' | 'mssql' | 'sqlite';
    /** Connection string or config */
    connection: DatabaseConnection;
    /** SQL query */
    query: string;
    /** Query parameters */
    params?: unknown[];
}

/**
 * Database connection configuration
 */
export interface DatabaseConnection {
    /** Host */
    host?: string;
    /** Port */
    port?: number;
    /** Database name */
    database?: string;
    /** Username */
    username?: string;
    /** Password (or secret reference) */
    password?: string;
    /** SSL mode */
    ssl?: boolean | 'require' | 'prefer' | 'disable';
    /** Connection string (alternative to individual fields) */
    connectionString?: string;
}

// FTP/SFTP SOURCE TYPES

/**
 * FTP source configuration
 */
export interface FtpSourceConfig extends BaseSourceConfig {
    type: 'ftp';
    /** FTP host */
    host: string;
    /** FTP port */
    port?: number;
    /** Username */
    username: string;
    /** Password (or secret reference) */
    password: string;
    /** Remote path */
    path: string;
    /** File pattern (glob) */
    pattern?: string;
    /** Use passive mode */
    passive?: boolean;
    /** Use secure FTP (FTPS) */
    secure?: boolean | 'implicit';
}

/**
 * SFTP source configuration
 */
export interface SftpSourceConfig extends BaseSourceConfig {
    type: 'sftp';
    /** SFTP host */
    host: string;
    /** SFTP port */
    port?: number;
    /** Username */
    username: string;
    /** Password (or secret reference) */
    password?: string;
    /** Private key (or secret reference) */
    privateKey?: string;
    /** Private key passphrase */
    passphrase?: string;
    /** Remote path */
    path: string;
    /** File pattern (glob) */
    pattern?: string;
}

// S3 SOURCE TYPES

/**
 * S3 source configuration
 */
export interface S3SourceConfig extends BaseSourceConfig {
    type: 's3';
    /** S3 bucket name */
    bucket: string;
    /** Object key or prefix */
    key: string;
    /** AWS region */
    region?: string;
    /** S3-compatible endpoint URL */
    endpoint?: string;
    /** Access key ID */
    accessKeyId?: string;
    /** Secret access key (or secret reference) */
    secretAccessKey?: string;
    /** Use path-style URLs */
    forcePathStyle?: boolean;
}

// AUTHENTICATION TYPES

/**
 * Authentication configuration
 */
export type AuthConfig =
    | BasicAuthConfig
    | BearerAuthConfig
    | ApiKeyAuthConfig
    | OAuth2AuthConfig;

/**
 * Basic authentication
 */
export interface BasicAuthConfig {
    type: typeof AuthType.BASIC;
    username: string;
    /** Password or secret reference */
    password: string;
}

/**
 * Bearer token authentication
 */
export interface BearerAuthConfig {
    type: typeof AuthType.BEARER;
    /** Token or secret reference */
    token: string;
}

/**
 * API key authentication
 */
export interface ApiKeyAuthConfig {
    type: typeof AuthType.API_KEY;
    /** Key name */
    key: string;
    /** Key value or secret reference */
    value: string;
    /** Where to send the key */
    in: 'header' | 'query';
}

/**
 * OAuth2 authentication
 */
export interface OAuth2AuthConfig {
    type: typeof AuthType.OAUTH2;
    /** Grant type */
    grantType: 'client_credentials' | 'password' | 'refresh_token';
    /** Token endpoint URL */
    tokenUrl: string;
    /** Client ID */
    clientId: string;
    /** Client secret (or secret reference) */
    clientSecret: string;
    /** OAuth2 scopes */
    scopes?: string[];
    /** Username (for password grant) */
    username?: string;
    /** Password (for password grant) */
    password?: string;
    /** Refresh token (for refresh_token grant) */
    refreshToken?: string;
}

// PAGINATION TYPES

/**
 * REST API pagination configuration
 */
export interface PaginationConfig {
    /** Pagination strategy */
    strategy: RestPaginationStrategy;
    /** Page size */
    pageSize?: number;
    /** Maximum pages to fetch */
    maxPages?: number;
    /** Configuration for offset-based pagination */
    offset?: {
        /** Query parameter for offset/skip */
        offsetParam?: string;
        /** Query parameter for limit */
        limitParam?: string;
        /** Path to total count in response */
        totalPath?: string;
    };
    /** Configuration for cursor-based pagination */
    cursor?: {
        /** Path to cursor in response */
        cursorPath?: string;
        /** Query parameter for cursor */
        cursorParam?: string;
        /** Path to check if more pages exist */
        hasNextPath?: string;
    };
    /** Configuration for page-based pagination */
    page?: {
        /** Query parameter for page number */
        pageParam?: string;
        /** Path to total pages in response */
        totalPagesPath?: string;
    };
    /** Configuration for link-based pagination */
    link?: {
        /** Header or path containing next link */
        nextLinkPath?: string;
    };
}

/**
 * GraphQL pagination configuration
 */
export interface GraphqlPaginationConfig {
    /** Pagination style */
    style: GraphQLPaginationStyle;
    /** Page size */
    pageSize?: number;
    /** Maximum pages to fetch */
    maxPages?: number;
    /** Path to page info (for relay style) */
    pageInfoPath?: string;
    /** Path to end cursor */
    endCursorPath?: string;
    /** Path to hasNextPage */
    hasNextPagePath?: string;
}

// SOURCE RESULT TYPES

/**
 * Result of fetching from a source
 */
export interface SourceResult<T = Record<string, unknown>> {
    /** Whether fetch was successful */
    success: boolean;
    /** Fetched records */
    records: T[];
    /** Total record count (if known) */
    total?: number;
    /** Source-specific metadata */
    metadata?: SourceMetadata;
    /** Errors encountered */
    errors?: SourceError[];
}

/**
 * Source metadata
 */
export interface SourceMetadata {
    /** File name or path */
    filename?: string;
    /** Content type */
    contentType?: string;
    /** File size in bytes */
    size?: number;
    /** Last modified timestamp */
    lastModified?: Date;
    /** Pagination cursor for next page */
    nextCursor?: string;
    /** Whether more data is available */
    hasMore?: boolean;
}

/**
 * Source error
 */
export interface SourceError {
    /** Error code */
    code?: string;
    /** Error message */
    message: string;
    /** Additional details */
    details?: Record<string, unknown>;
    /** Is this error retryable? */
    retryable?: boolean;
}

// SOURCE INTERFACE

/**
 * Source interface for data source implementations
 */
export interface DataSource<TConfig extends BaseSourceConfig = BaseSourceConfig> {
    /**
     * Fetch data from the source
     */
    fetch(config: TConfig): Promise<SourceResult>;

    /**
     * Test the source connection
     */
    test?(config: TConfig): Promise<{ success: boolean; message?: string }>;

    /**
     * Get source metadata (schema, available fields, etc.)
     */
    describe?(config: TConfig): Promise<{ fields?: string[]; metadata?: Record<string, unknown> }>;
}

/**
 * Union of all data source service configurations
 * (Different from pipeline SourceConfig - this is for source service implementations)
 */
export type DataSourceServiceConfig =
    | LocalFileSourceConfig
    | RemoteFileSourceConfig
    | RestApiSourceConfig
    | GraphqlApiSourceConfig
    | SqlDatabaseSourceConfig
    | FtpSourceConfig
    | SftpSourceConfig
    | S3SourceConfig;
