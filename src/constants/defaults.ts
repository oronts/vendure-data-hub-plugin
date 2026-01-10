// DEFAULT VALUES - Configuration defaults for DataHub

/**
 * Retention policy defaults (in days)
 */
export const RETENTION = {
    /** Days to retain pipeline run history */
    RUNS_DAYS: 30,
    /** Days to retain error records */
    ERRORS_DAYS: 90,
} as const;

/**
 * Pagination and limits defaults
 */
export const PAGINATION = {
    /** Maximum pages to fetch from paginated APIs */
    MAX_PAGES: 100,
    /** Maximum pages for GraphQL queries */
    MAX_GRAPHQL_PAGES: 100,
    /** Default page size for data extraction */
    PAGE_SIZE: 100,
    /** Default page size for database queries (larger for SQL) */
    DATABASE_PAGE_SIZE: 1000,
    /** Default page size for admin list views */
    LIST_PAGE_SIZE: 20,
    /** Limit for recent logs queries */
    RECENT_LOGS_LIMIT: 100,
    /** Limit for events display */
    EVENTS_LIMIT: 50,
    /** Limit for feed preview records */
    FEED_PREVIEW_LIMIT: 10,
    /** Limit for file preview rows */
    FILE_PREVIEW_ROWS: 10,
    /** Limit for top errors display */
    TOP_ERRORS_LIMIT: 10,
    /** Limit for recent activity display */
    RECENT_ACTIVITY_LIMIT: 10,
    /** Limit for search results */
    SEARCH_RESULTS_LIMIT: 100,
    /** Limit for querying all records (safety) */
    QUERY_ALL_LIMIT: 999,
} as const;

/**
 * Batch processing defaults
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
 * Scheduler interval defaults (in milliseconds)
 */
export const SCHEDULER = {
    /** Interval for checking scheduled pipelines */
    CHECK_INTERVAL_MS: 30_000,
    /** Interval for refreshing schedule cache */
    REFRESH_INTERVAL_MS: 60_000,
    /** Interval for retention purge job */
    RETENTION_PURGE_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
    /** Interval for temporary file cleanup */
    FILE_CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    /** Interval for analytics refresh */
    ANALYTICS_REFRESH_INTERVAL_MS: 10_000,
    /** Minimum scheduler interval (safety limit) */
    MIN_INTERVAL_MS: 1000,
} as const;

/**
 * Webhook configuration defaults
 */
export const WEBHOOK = {
    /** Request timeout in milliseconds */
    TIMEOUT_MS: 30_000,
    /** Interval for retrying failed webhooks */
    RETRY_CHECK_INTERVAL_MS: 30_000,
    /** Maximum delay between retries */
    MAX_DELAY_MS: 3_600_000, // 1 hour
    /** Maximum delay for hook webhooks */
    HOOK_MAX_DELAY_MS: 300_000, // 5 minutes
    /** Backoff multiplier for retries */
    BACKOFF_MULTIPLIER: 2,
    /** Initial delay for retries */
    INITIAL_DELAY_MS: 1_000,
    /** Maximum retry attempts */
    MAX_ATTEMPTS: 5,
    /** Default signature header name */
    SIGNATURE_HEADER: 'X-DataHub-Signature',
} as const;

/**
 * HTTP configuration defaults
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
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
    OK: 200,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    REQUEST_TIMEOUT: 408,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    /** Success range start (inclusive) */
    SUCCESS_MIN: 200,
    /** Success range end (exclusive) */
    SUCCESS_MAX: 300,
} as const;

/**
 * Rate limiting and adaptive delay defaults
 */
export const RATE_LIMIT = {
    /** Initial delay for adaptive throttling */
    ADAPTIVE_DELAY_INITIAL_MS: 200,
    /** Minimum delay for adaptive throttling */
    ADAPTIVE_DELAY_MIN_MS: 100,
    /** Check interval when paused */
    PAUSE_CHECK_INTERVAL_MS: 100,
} as const;

/**
 * File storage defaults
 */
export const FILE_STORAGE = {
    /** Maximum file size in bytes */
    MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
    /** Maximum number of files per upload request */
    FILE_MAX_FILES: 10,
    /** File expiry time in minutes */
    EXPIRY_MINUTES: 60 * 24, // 24 hours
    /** Temp directory for exports */
    TEMP_DIR: '/tmp',
} as const;

/**
 * Default output file paths
 */
export const OUTPUT_PATHS = {
    /** Default CSV export path */
    CSV_EXPORT: '/tmp/export.csv',
    /** Default JSON export path */
    JSON_EXPORT: '/tmp/export.json',
    /** Default XML export path */
    XML_EXPORT: '/tmp/export.xml',
    /** Default Google Merchant feed path */
    GOOGLE_MERCHANT_FEED: '/tmp/google-merchant-feed.xml',
    /** Default Meta catalog feed path */
    META_CATALOG_FEED: '/tmp/meta-catalog-feed.csv',
    /** Default Amazon feed path */
    AMAZON_FEED: '/tmp/amazon-feed.txt',
    /** Default custom feed path */
    CUSTOM_FEED: '/tmp/custom-feed.json',
} as const;

/**
 * XML export configuration
 */
export const XML_EXPORT = {
    /** Default root element name */
    ROOT_ELEMENT: 'records',
    /** Default item element name */
    ITEM_ELEMENT: 'record',
} as const;

/**
 * UI configuration defaults
 */
export const UI = {
    /** Debounce delay for search inputs (ms) */
    DEBOUNCE_DELAY_MS: 300,
    /** Refetch interval for log statistics (ms) */
    LOG_STATS_REFETCH_INTERVAL_MS: 30_000,
    /** Default page size for logs display */
    LOGS_PAGE_SIZE: 50,
} as const;

/**
 * Cache configuration defaults
 */
export const CACHE = {
    /** Default cache TTL in milliseconds (1 minute) */
    DEFAULT_TTL_MS: 60_000,
    /** Settings cache TTL in milliseconds (1 minute) */
    SETTINGS_TTL_MS: 60_000,
    /** Adapter catalog stale time in milliseconds (1 minute) */
    ADAPTER_CATALOG_STALE_TIME_MS: 60_000,
} as const;

/**
 * Extractor-specific limits
 */
export const EXTRACTOR_LIMITS = {
    /** Default max files for file extractor */
    FILE_MAX_FILES: 100,
    /** Default max objects for S3 extractor */
    S3_MAX_OBJECTS: 100,
    /** S3 list objects max keys */
    S3_LIST_MAX_KEYS: 1000,
} as const;

/**
 * Span tracker configuration
 */
export const SPAN_TRACKER = {
    /** Maximum completed spans to keep in memory */
    MAX_COMPLETED_SPANS: 100,
} as const;

/**
 * Truncation limits for display/storage
 */
export const TRUNCATION = {
    /** Maximum length for error messages */
    ERROR_MESSAGE_MAX_LENGTH: 200,
    /** Maximum length for response body logging */
    RESPONSE_BODY_MAX_LENGTH: 1000,
    /** Length of webhook ID hash */
    WEBHOOK_ID_HASH_LENGTH: 16,
    /** Length for value preview */
    VALUE_PREVIEW_LENGTH: 50,
    /** Maximum description length for feeds */
    FEED_DESCRIPTION_MAX_LENGTH: 5000,
    /** Maximum characters for content preview */
    CONTENT_PREVIEW_LENGTH: 1000,
    /** Maximum unique values to track for statistics */
    MAX_UNIQUE_VALUES: 1000,
    /** Maximum custom aliases allowed */
    MAX_CUSTOM_ALIASES: 1000,
    /** Maximum sample values to store per field for preview */
    SAMPLE_VALUES_LIMIT: 5,
} as const;

/**
 * Numeric calculation defaults
 */
export const NUMERIC = {
    /** Default decimal places for formatting */
    DEFAULT_DECIMALS: 2,
} as const;

/**
 * Network port defaults
 */
export const PORTS = {
    SFTP: 22,
    FTP: 21,
    POSTGRESQL: 5432,
    MYSQL: 3306,
    MSSQL: 1433,
    ORACLE: 1521,
    /** Port range validation */
    MIN: 1,
    MAX: 65535,
} as const;

/**
 * Domain events configuration
 */
export const DOMAIN_EVENTS = {
    /** Maximum events to keep in buffer */
    MAX_EVENTS: 200,
    /** Default limit for event queries */
    DEFAULT_LIMIT: 50,
} as const;

/**
 * Connection pool defaults
 */
export const CONNECTION_POOL = {
    MIN: 1,
    MAX: 10,
    /** Idle timeout in milliseconds (default: 30 seconds) */
    IDLE_TIMEOUT_MS: 30_000,
    /** Acquire timeout in milliseconds (default: 10 seconds) */
    ACQUIRE_TIMEOUT_MS: 10_000,
} as const;

/**
 * Circuit breaker defaults
 */
export const CIRCUIT_BREAKER = {
    /** Whether circuit breaker is enabled by default */
    ENABLED: true,
    /** Number of failures before opening circuit */
    FAILURE_THRESHOLD: 5,
    /** Number of successes to close circuit */
    SUCCESS_THRESHOLD: 3,
    /** Time in ms before attempting reset (default: 30 seconds) */
    RESET_TIMEOUT_MS: 30_000,
    /** Time window for counting failures in ms (default: 60 seconds) */
    FAILURE_WINDOW_MS: 60_000,
} as const;

/**
 * Metrics defaults
 */
export const METRICS = {
    /** Maximum samples to keep in memory */
    MAX_SAMPLES: 1000,
    /** Percentile precision */
    PERCENTILE_PRECISION: 100,
} as const;

/**
 * Validation timeout limits (in milliseconds)
 */
export const VALIDATION_TIMEOUTS = {
    /** Minimum allowed timeout for HTTP requests */
    MIN_TIMEOUT_MS: 1_000,
    /** Maximum allowed timeout for HTTP requests */
    MAX_TIMEOUT_MS: 300_000,
} as const;

/**
 * Transform limits
 */
export const TRANSFORM_LIMITS = {
    /** Maximum length for generated slugs */
    SLUG_MAX_LENGTH: 200,
    /** Currency minor units multiplier (e.g., cents = dollars * 100) */
    CURRENCY_MINOR_UNITS_MULTIPLIER: 100,
    /** Default decimal precision for currency formatting */
    CURRENCY_DECIMAL_PLACES: 2,
    /** Default description truncation for feeds */
    DESCRIPTION_TRUNCATE_LENGTH: 500,
} as const;

/**
 * Validation field defaults
 */
export const VALIDATION_FIELDS = {
    /** Default field name for validation errors */
    DEFAULT_ERROR_FIELD: '_validationErrors',
} as const;

/**
 * Default host values
 */
export const DEFAULT_HOSTS = {
    /** Default localhost hostname */
    LOCALHOST: 'localhost',
} as const;

/**
 * Combined defaults object for convenient access
 */
export const DEFAULTS = {
    // Retention settings
    RETENTION_DAYS_RUNS: RETENTION.RUNS_DAYS,
    RETENTION_DAYS_ERRORS: RETENTION.ERRORS_DAYS,

    // Pagination and limits
    MAX_PAGES: PAGINATION.MAX_PAGES,
    MAX_GRAPHQL_PAGES: PAGINATION.MAX_GRAPHQL_PAGES,
    PAGE_SIZE: PAGINATION.PAGE_SIZE,
    LIST_PAGE_SIZE: PAGINATION.LIST_PAGE_SIZE,
    RECENT_LOGS_LIMIT: PAGINATION.RECENT_LOGS_LIMIT,
    EVENTS_LIMIT: PAGINATION.EVENTS_LIMIT,
    FEED_PREVIEW_LIMIT: PAGINATION.FEED_PREVIEW_LIMIT,
    FILE_PREVIEW_ROWS: PAGINATION.FILE_PREVIEW_ROWS,
    TOP_ERRORS_LIMIT: PAGINATION.TOP_ERRORS_LIMIT,
    RECENT_ACTIVITY_LIMIT: PAGINATION.RECENT_ACTIVITY_LIMIT,
    SEARCH_RESULTS_LIMIT: PAGINATION.SEARCH_RESULTS_LIMIT,
    QUERY_ALL_LIMIT: PAGINATION.QUERY_ALL_LIMIT,

    // Batch processing
    BATCH_SIZE: BATCH.SIZE,
    BULK_SIZE: BATCH.BULK_SIZE,
    EXPORT_BATCH_SIZE: BATCH.EXPORT_BATCH_SIZE,
    EXPORT_QUERY_LIMIT: BATCH.EXPORT_QUERY_LIMIT,
    MAX_IN_FLIGHT: BATCH.MAX_IN_FLIGHT,
    RATE_LIMIT_RPS: BATCH.RATE_LIMIT_RPS,

    // Scheduler intervals
    SCHEDULE_CHECK_INTERVAL_MS: SCHEDULER.CHECK_INTERVAL_MS,
    SCHEDULE_REFRESH_INTERVAL_MS: SCHEDULER.REFRESH_INTERVAL_MS,
    RETENTION_PURGE_INTERVAL_MS: SCHEDULER.RETENTION_PURGE_INTERVAL_MS,
    FILE_CLEANUP_INTERVAL_MS: SCHEDULER.FILE_CLEANUP_INTERVAL_MS,
    ANALYTICS_REFRESH_INTERVAL_MS: SCHEDULER.ANALYTICS_REFRESH_INTERVAL_MS,

    // Webhooks
    WEBHOOK_TIMEOUT_MS: WEBHOOK.TIMEOUT_MS,
    WEBHOOK_RETRY_CHECK_INTERVAL_MS: WEBHOOK.RETRY_CHECK_INTERVAL_MS,
    WEBHOOK_MAX_DELAY_MS: WEBHOOK.MAX_DELAY_MS,
    WEBHOOK_HOOK_MAX_DELAY_MS: WEBHOOK.HOOK_MAX_DELAY_MS,
    WEBHOOK_BACKOFF_MULTIPLIER: WEBHOOK.BACKOFF_MULTIPLIER,
    WEBHOOK_INITIAL_DELAY_MS: WEBHOOK.INITIAL_DELAY_MS,
    WEBHOOK_MAX_ATTEMPTS: WEBHOOK.MAX_ATTEMPTS,

    // HTTP and retries
    HTTP_TIMEOUT_MS: HTTP.TIMEOUT_MS,
    RETRY_DELAY_MS: HTTP.RETRY_DELAY_MS,
    RETRY_MAX_DELAY_MS: HTTP.RETRY_MAX_DELAY_MS,
    MAX_RETRIES: HTTP.MAX_RETRIES,
    RETRYABLE_STATUS_CODES: HTTP.RETRYABLE_STATUS_CODES,

    // Rate limiting and delays
    ADAPTIVE_DELAY_INITIAL_MS: RATE_LIMIT.ADAPTIVE_DELAY_INITIAL_MS,
    ADAPTIVE_DELAY_MIN_MS: RATE_LIMIT.ADAPTIVE_DELAY_MIN_MS,
    PAUSE_CHECK_INTERVAL_MS: RATE_LIMIT.PAUSE_CHECK_INTERVAL_MS,

    // File storage
    MAX_FILE_SIZE_BYTES: FILE_STORAGE.MAX_FILE_SIZE_BYTES,
    FILE_EXPIRY_MINUTES: FILE_STORAGE.EXPIRY_MINUTES,
    TEMP_DIR: FILE_STORAGE.TEMP_DIR,

    // Output paths
    OUTPUT_PATH_CSV: OUTPUT_PATHS.CSV_EXPORT,
    OUTPUT_PATH_JSON: OUTPUT_PATHS.JSON_EXPORT,
    OUTPUT_PATH_XML: OUTPUT_PATHS.XML_EXPORT,
    OUTPUT_PATH_GOOGLE_MERCHANT: OUTPUT_PATHS.GOOGLE_MERCHANT_FEED,
    OUTPUT_PATH_META_CATALOG: OUTPUT_PATHS.META_CATALOG_FEED,
    OUTPUT_PATH_AMAZON: OUTPUT_PATHS.AMAZON_FEED,
    OUTPUT_PATH_CUSTOM_FEED: OUTPUT_PATHS.CUSTOM_FEED,

    // Truncation limits
    ERROR_MESSAGE_MAX_LENGTH: TRUNCATION.ERROR_MESSAGE_MAX_LENGTH,
    RESPONSE_BODY_MAX_LENGTH: TRUNCATION.RESPONSE_BODY_MAX_LENGTH,
    WEBHOOK_ID_HASH_LENGTH: TRUNCATION.WEBHOOK_ID_HASH_LENGTH,
    VALUE_PREVIEW_LENGTH: TRUNCATION.VALUE_PREVIEW_LENGTH,

    // Defaults for numeric calculations
    DEFAULT_DECIMALS: NUMERIC.DEFAULT_DECIMALS,
    DEFAULT_SFTP_PORT: PORTS.SFTP,
    DEFAULT_FTP_PORT: PORTS.FTP,

    // Validation timeouts
    MIN_TIMEOUT_MS: VALIDATION_TIMEOUTS.MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS: VALIDATION_TIMEOUTS.MAX_TIMEOUT_MS,

    // Transform limits
    SLUG_MAX_LENGTH: TRANSFORM_LIMITS.SLUG_MAX_LENGTH,
    CURRENCY_MINOR_UNITS_MULTIPLIER: TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER,
    CURRENCY_DECIMAL_PLACES: TRANSFORM_LIMITS.CURRENCY_DECIMAL_PLACES,
    DESCRIPTION_TRUNCATE_LENGTH: TRANSFORM_LIMITS.DESCRIPTION_TRUNCATE_LENGTH,

    // Default hosts
    LOCALHOST: DEFAULT_HOSTS.LOCALHOST,
} as const;
