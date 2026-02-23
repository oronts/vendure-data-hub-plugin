/**
 * Shared constants between dashboard and backend
 * Import these instead of duplicating values
 */

export {
    DESTINATION_TYPE,
    SOURCE_TYPE,
    FILE_FORMAT,
    EXPORT_FORMAT,
    CLEANUP_STRATEGY,
    COMPRESSION_TYPE,
    CHECKPOINT_STRATEGY,
    QUEUE_TYPE,
    ACK_MODE,
    RUN_STATUS,
    STEP_TYPE,
    TRIGGER_TYPE,
    LOAD_STRATEGY,
    CONFLICT_STRATEGY,
    VALIDATION_MODE,
    HOOK_STAGE,
} from './enums';

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

/**
 * HTTP configuration defaults
 * Used by both dashboard and backend for consistent timeout/retry behavior
 */
export const HTTP = {
    /** Request timeout in milliseconds */
    TIMEOUT_MS: 30_000,
    /** Connection test timeout in milliseconds (shorter for quick tests) */
    CONNECTION_TEST_TIMEOUT_MS: 10_000,
    /** Initial retry delay */
    RETRY_DELAY_MS: 1_000,
    /** Maximum retry delay */
    RETRY_MAX_DELAY_MS: 30_000,
    /** Maximum retry attempts */
    MAX_RETRIES: 3,
    /** Enable exponential backoff for retries */
    EXPONENTIAL_BACKOFF: true,
    /** Backoff multiplier for exponential backoff */
    BACKOFF_MULTIPLIER: 2,
    /** HTTP status codes that should trigger retry */
    RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504] as readonly number[],
} as const;

/**
 * Batch processing defaults
 * Used by both dashboard and backend for consistent batch operations
 */
export const BATCH = {
    /** Default batch size for processing */
    SIZE: 50,
    /** Bulk operation size */
    BULK_SIZE: 100,
    /** Batch size for export operations */
    EXPORT_BATCH_SIZE: 1000,
    /** Query limit for export operations */
    EXPORT_QUERY_LIMIT: 10000,
    /** Maximum concurrent in-flight operations */
    MAX_IN_FLIGHT: 5,
    /** Default rate limit (requests per second) */
    RATE_LIMIT_RPS: 10,
} as const;

/**
 * Retention policy defaults (in days)
 * Used by both dashboard and backend for consistent data retention
 */
export const RETENTION = {
    /** Days to retain pipeline run history */
    RUNS_DAYS: 30,
    /** Days to retain error records */
    ERRORS_DAYS: 90,
    /** Maximum retention days (1 year) */
    MAX_DAYS: 365,
    /** Minimum retention days */
    MIN_DAYS: 1,
} as const;

/**
 * UI-related timeouts
 * Used by both dashboard and backend for consistent UI behavior
 */
export const UI_TIMEOUTS = {
    /** Feedback duration for copy actions */
    COPY_FEEDBACK_MS: 2000,
    /** Debounce delay for search inputs */
    SEARCH_DEBOUNCE_MS: 300,
    /** Toast notification duration */
    TOAST_DURATION_MS: 5000,
} as const;

/**
 * Connection types for external services.
 *
 * Core types (HTTP, S3, FTP, SFTP, DATABASE, CUSTOM) are used by both backend
 * and dashboard. Extended types (POSTGRES, MYSQL, MSSQL, MONGODB, REST, GRAPHQL,
 * RABBITMQ, SQS, REDIS) are UI-specific subtypes for richer connection configuration.
 */
export const CONNECTION_TYPE = {
    /** Generic HTTP connection */
    HTTP: 'HTTP',
    /** REST API connection */
    REST: 'REST',
    /** GraphQL API connection */
    GRAPHQL: 'GRAPHQL',
    /** PostgreSQL database connection */
    POSTGRES: 'POSTGRES',
    /** MySQL database connection */
    MYSQL: 'MYSQL',
    /** Microsoft SQL Server connection */
    MSSQL: 'MSSQL',
    /** MongoDB connection */
    MONGO: 'MONGODB',
    /** Generic database connection (used when specific type unknown) */
    DATABASE: 'DATABASE',
    /** AWS S3 or S3-compatible storage */
    S3: 'S3',
    /** FTP server connection */
    FTP: 'FTP',
    /** SFTP (SSH File Transfer Protocol) connection */
    SFTP: 'SFTP',
    /** RabbitMQ message queue */
    RABBITMQ: 'RABBITMQ',
    /** AWS Simple Queue Service */
    SQS: 'SQS',
    /** Redis cache/queue */
    REDIS: 'REDIS',
    /** Custom connection type */
    CUSTOM: 'CUSTOM',
} as const;

/**
 * Union type of all known connection type values.
 * Includes `(string & {})` to allow unknown/future connection types
 * while preserving autocomplete for known values.
 */
export type UIConnectionType =
    | typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE]
    | (string & {});

/** Default Vendure channel code used when no specific channel is configured */
export const DEFAULT_CHANNEL_CODE = '__default_channel__';

export { SHARED_STEP_TYPE_CONFIGS } from './step-type-configs';
export type { SharedStepTypeConfig } from './step-type-configs';
