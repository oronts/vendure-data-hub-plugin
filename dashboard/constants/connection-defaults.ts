/**
 * Connection Configuration Defaults
 *
 * These values are used as placeholders and defaults in connection configuration forms.
 * They can be customized by modifying this file without changing component code.
 */

/**
 * Default ports for various services
 * These are the standard default ports for each database/service type
 */
export const CONNECTION_PORTS = {
    POSTGRESQL: 5432,
    MYSQL: 3306,
    MONGODB: 27017,
    REDIS: 6379,
    ELASTICSEARCH: 9200,
    FTP: 21,
    SFTP: 22,
} as const;

/**
 * Default hostnames and placeholders
 */
export const CONNECTION_HOSTS = {
    /** Default localhost hostname */
    LOCALHOST: 'localhost',
    /** Example hostname for FTP connections */
    FTP_EXAMPLE: 'ftp.example.com',
    /** Example hostname for SFTP connections */
    SFTP_EXAMPLE: 'sftp.example.com',
} as const;

/**
 * HTTP connection defaults
 */
export const HTTP_CONNECTION_DEFAULTS = {
    /** Default HTTP request timeout in milliseconds */
    TIMEOUT_MS: 30000,
    /** Example base URL placeholder */
    BASE_URL_PLACEHOLDER: 'https://api.example.com',
} as const;

/**
 * Database connection placeholders
 * Used in connection configuration forms
 */
export const DATABASE_PLACEHOLDERS = {
    /** Default database name placeholder */
    DATABASE: 'mydb',
    /** PostgreSQL username placeholder */
    POSTGRES_USER: 'postgres',
    /** MySQL username placeholder */
    MYSQL_USER: 'root',
    /** MongoDB connection string placeholder */
    MONGODB_CONNECTION_STRING: 'mongodb://localhost:27017',
    /** MongoDB auth source placeholder */
    MONGODB_AUTH_SOURCE: 'admin',
} as const;

/**
 * Cloud service placeholders
 */
export const CLOUD_PLACEHOLDERS = {
    /** S3 bucket name placeholder */
    S3_BUCKET: 'my-bucket',
    /** S3 region placeholder */
    S3_REGION: 'us-east-1',
    /** S3 custom endpoint placeholder */
    S3_ENDPOINT: 'https://s3.amazonaws.com',
} as const;

/**
 * Search service placeholders
 */
export const SEARCH_PLACEHOLDERS = {
    /** Elasticsearch node URL placeholder */
    ELASTICSEARCH_NODE: 'http://localhost:9200',
} as const;

/**
 * Get placeholder for connection type and field
 */
export function getConnectionPlaceholder(
    type: string,
    field: string,
): string | number | undefined {
    switch (type) {
        case 'postgres':
            if (field === 'host') return CONNECTION_HOSTS.LOCALHOST;
            if (field === 'port') return CONNECTION_PORTS.POSTGRESQL;
            if (field === 'database') return DATABASE_PLACEHOLDERS.DATABASE;
            if (field === 'username') return DATABASE_PLACEHOLDERS.POSTGRES_USER;
            break;
        case 'mysql':
            if (field === 'host') return CONNECTION_HOSTS.LOCALHOST;
            if (field === 'port') return CONNECTION_PORTS.MYSQL;
            if (field === 'database') return DATABASE_PLACEHOLDERS.DATABASE;
            if (field === 'username') return DATABASE_PLACEHOLDERS.MYSQL_USER;
            break;
        case 'mongodb':
            if (field === 'connectionString') return DATABASE_PLACEHOLDERS.MONGODB_CONNECTION_STRING;
            if (field === 'database') return DATABASE_PLACEHOLDERS.DATABASE;
            if (field === 'authSource') return DATABASE_PLACEHOLDERS.MONGODB_AUTH_SOURCE;
            break;
        case 's3':
            if (field === 'bucket') return CLOUD_PLACEHOLDERS.S3_BUCKET;
            if (field === 'region') return CLOUD_PLACEHOLDERS.S3_REGION;
            if (field === 'endpoint') return CLOUD_PLACEHOLDERS.S3_ENDPOINT;
            break;
        case 'ftp':
            if (field === 'host') return CONNECTION_HOSTS.FTP_EXAMPLE;
            if (field === 'port') return CONNECTION_PORTS.FTP;
            break;
        case 'sftp':
            if (field === 'host') return CONNECTION_HOSTS.SFTP_EXAMPLE;
            if (field === 'port') return CONNECTION_PORTS.SFTP;
            break;
        case 'redis':
            if (field === 'host') return CONNECTION_HOSTS.LOCALHOST;
            if (field === 'port') return CONNECTION_PORTS.REDIS;
            if (field === 'db') return 0;
            break;
        case 'elasticsearch':
            if (field === 'node') return SEARCH_PLACEHOLDERS.ELASTICSEARCH_NODE;
            break;
        case 'http':
            if (field === 'baseUrl') return HTTP_CONNECTION_DEFAULTS.BASE_URL_PLACEHOLDER;
            break;
    }
    return undefined;
}
