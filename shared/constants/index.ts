/**
 * Shared constants between dashboard and backend
 * Import these instead of duplicating values
 */

export const TIME_UNITS = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
} as const;

export const PORTS = {
    SFTP: 22,
    FTP: 21,
    POSTGRESQL: 5432,
    MYSQL: 3306,
    MSSQL: 1433,
    ORACLE: 1521,
    MIN: 1,
    MAX: 65535,
} as const;

export const SEARCH_SERVICE_PORTS = {
    MEILISEARCH: 7700,
    ELASTICSEARCH: 9200,
    TYPESENSE: 8108,
} as const;

export const DEFAULT_HOSTS = {
    LOCALHOST: 'localhost',
} as const;

export const CONFIDENCE_THRESHOLDS = {
    HIGH: 70,
    MEDIUM: 40,
} as const;
