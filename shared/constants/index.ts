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
    QUEUE_TYPE,
    ACK_MODE,
    RUN_STATUS,
    DRY_RUN_MESSAGE_LEVEL,
    DRY_RUN_MESSAGE_CODE,
    STEP_TYPE,
    TRIGGER_TYPE,
    LOAD_STRATEGY,
    CONFLICT_STRATEGY,
    VALIDATION_MODE,
    HOOK_STAGE,
    CONFIGURATION_SOURCE,
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
    SMTP: 587,
    POSTGRESQL: 5432,
    MYSQL: 3306,
    RABBITMQ: 5672,
    REDIS: 6379,
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

export const WEBHOOK_AUTH_HEADERS = {
    API_KEY: 'x-api-key',
    HMAC_SIGNATURE: 'x-datahub-signature',
    IDEMPOTENCY_KEY: 'x-idempotency-key',
    JWT: 'authorization',
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
    /** Hard cap for user-configured request timeouts */
    MAX_TIMEOUT_MS: 5 * 60_000,
    /** Hard cap for user-configured retry attempts */
    MAX_RETRY_ATTEMPTS: 10,
    /** Hard cap for user-configured exponential backoff multipliers */
    MAX_BACKOFF_MULTIPLIER: 10,
    /** Hard cap for user-configured requests per second */
    MAX_REQUESTS_PER_SECOND: 10_000,
    /** Enable exponential backoff for retries */
    EXPONENTIAL_BACKOFF: true,
    /** Backoff multiplier for exponential backoff */
    BACKOFF_MULTIPLIER: 2,
    /** HTTP status codes that should trigger retry */
    RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504] as readonly number[],
} as const;

/** Bounded pipeline-level retry defaults and limits. */
export const PIPELINE_RETRY = {
    DEFAULT_MAX_RETRIES: 0,
    DEFAULT_DELAY_MS: 0,
    DEFAULT_MAX_DELAY_MS: HTTP.RETRY_MAX_DELAY_MS,
    DEFAULT_BACKOFF_MULTIPLIER: HTTP.BACKOFF_MULTIPLIER,
    MAX_RETRIES: HTTP.MAX_RETRY_ATTEMPTS,
    MAX_DELAY_MS: HTTP.MAX_TIMEOUT_MS,
    MAX_BACKOFF_MULTIPLIER: HTTP.MAX_BACKOFF_MULTIPLIER,
} as const;

export const PARALLEL_EXECUTION = {
    DEFAULT_MAX_CONCURRENT_STEPS: 4,
    MIN_CONCURRENT_STEPS: 1,
    MAX_CONCURRENT_STEPS: 16,
    ERROR_POLICIES: ['FAIL_FAST', 'CONTINUE', 'BEST_EFFORT'],
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
    /** Minimum retention days; zero disables cleanup */
    MIN_DAYS: 0,
    /** Maximum rows deleted or updated by one database statement */
    PURGE_BATCH_SIZE: 1_000,
    /** Maximum rows processed per entity during one purge cycle */
    MAX_ROWS_PER_ENTITY_PER_PURGE: 10_000,
    /** Distributed lock key used to serialize purge cycles */
    PURGE_LOCK_KEY: 'data-hub:retention-purge',
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
 * This is the canonical set accepted by backend validation and exposed to clients.
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

/** Union type of every connection type accepted by the backend. */
export type UIConnectionType = typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE];

/** Default Vendure channel code used when no specific channel is configured */
export const DEFAULT_CHANNEL_CODE = '__default_channel__';

export { SHARED_STEP_TYPE_CONFIGS } from './step-type-configs';
export type { SharedStepTypeConfig } from './step-type-configs';
