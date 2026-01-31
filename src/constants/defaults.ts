import * as os from 'os';
import * as path from 'path';
import { isBrowser } from '../utils/environment';

const getTempBase = (): string => {
    if (isBrowser) {
        return '/tmp';
    }
    return process.env.DATA_HUB_TEMP_DIR || os.tmpdir();
};

const TEMP_BASE = getTempBase();

/**
 * Retention policy defaults (in days)
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
 * Pagination parameter names for HTTP API extractors
 */
export const PAGINATION_PARAMS = {
    /** Default offset parameter name */
    OFFSET: 'offset',
    /** Default limit parameter name */
    LIMIT: 'limit',
    /** Default cursor parameter name */
    CURSOR: 'cursor',
    /** Default page parameter name */
    PAGE: 'page',
    /** Default page size parameter name */
    PAGE_SIZE: 'pageSize',
    /** Alternative page size parameter name (common in APIs) */
    PER_PAGE: 'per_page',
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
    /** Maximum page size for database queries (safety limit) */
    DATABASE_MAX_PAGE_SIZE: 100000,
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
 * Sink defaults for search engine and webhook integrations
 */
export const SINK = {
    /** Default index name for search engines */
    DEFAULT_INDEX_NAME: 'products',
    /** Default ID field for document identification */
    DEFAULT_ID_FIELD: 'id',
    /** Default batch size for queue operations */
    QUEUE_BATCH_SIZE: 100,
    /** Default batch size for webhook operations */
    WEBHOOK_BATCH_SIZE: 100,
    /** Base delay in ms for exponential backoff */
    BACKOFF_BASE_DELAY_MS: 100,
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
    /** Temp directory for exports (configurable via DATA_HUB_TEMP_DIR env var) */
    TEMP_DIR: TEMP_BASE,
} as const;

/**
 * Generate output file path based on pipeline config
 */
export function getOutputPath(pipelineCode: string, format: string, extension?: string): string {
    const ext = extension || format;
    const timestamp = Date.now();
    if (isBrowser) {
        return `${TEMP_BASE}/${pipelineCode}-${timestamp}.${ext}`;
    }
    return path.join(TEMP_BASE, `${pipelineCode}-${timestamp}.${ext}`);
}

/**
 * Default file extensions by format
 */
export const OUTPUT_EXTENSIONS = {
    csv: 'csv',
    json: 'json',
    xml: 'xml',
    'google-merchant': 'xml',
    'meta-catalog': 'csv',
    amazon: 'txt',
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
    /** Maximum cached logger instances */
    MAX_CACHED_LOGGERS: 100,
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
    /** Maximum active spans to track before eviction */
    MAX_ACTIVE_SPANS: 500,
    /** Maximum span duration before timeout (10 minutes) */
    SPAN_TIMEOUT_MS: 10 * 60 * 1000,
} as const;

/**
 * Truncation limits for display/storage
 */
export const TRUNCATION = {
    /** Maximum length for error messages and field values */
    ERROR_MESSAGE_MAX_LENGTH: 200,
    /** Maximum length for field values in logging */
    MAX_FIELD_VALUE_LENGTH: 200,
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
 * Network port defaults - imported from shared constants
 */
import { PORTS } from '../../shared/constants';
export { PORTS };

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
    /** Idle timeout before removing circuit from cache (default: 30 minutes) */
    IDLE_TIMEOUT_MS: 30 * 60 * 1000,
    /** Interval for cleaning up idle circuits (default: 5 minutes) */
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    /** Maximum number of circuits to track */
    MAX_CIRCUITS: 1000,
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
 * Distributed lock defaults
 */
export const DISTRIBUTED_LOCK = {
    /** Default Redis URL for auto-detection */
    DEFAULT_REDIS_URL: 'redis://localhost:6379',
    /** Maximum retries per Redis request */
    MAX_RETRIES_PER_REQUEST: 3,
    /** Maximum retry delay for Redis connection */
    MAX_RETRY_DELAY_MS: 3000,
    /** Maximum iterations for scan operations */
    MAX_SCAN_ITERATIONS: 1000,
    /** Lock cleanup interval in milliseconds (default: 30 seconds) */
    CLEANUP_INTERVAL_MS: 30_000,
    /** Default lock TTL in milliseconds (default: 30 seconds) */
    DEFAULT_TTL_MS: 30_000,
    /** Default wait timeout in milliseconds (default: 10 seconds) */
    DEFAULT_WAIT_TIMEOUT_MS: 10_000,
    /** Default retry interval in milliseconds (default: 100ms) */
    DEFAULT_RETRY_INTERVAL_MS: 100,
    /** Pipeline execution lock TTL in milliseconds (5 minutes - long enough for most pipelines) */
    PIPELINE_LOCK_TTL_MS: 300_000,
    /** Scheduler trigger lock TTL in milliseconds (30 seconds - just for preventing duplicate triggers) */
    SCHEDULER_LOCK_TTL_MS: 30_000,
    /** Message consumer lock TTL in milliseconds (5 minutes - long enough for consumer heartbeat) */
    MESSAGE_CONSUMER_LOCK_TTL_MS: 300_000,
    /** Message consumer lock refresh interval (4 minutes - before TTL expires) */
    MESSAGE_CONSUMER_LOCK_REFRESH_MS: 240_000,
} as const;

/**
 * Webhook queue defaults
 */
export const WEBHOOK_QUEUE = {
    /** Maximum number of deliveries in queue */
    MAX_DELIVERY_QUEUE_SIZE: 10000,
    /** Maximum number of webhook configurations to cache */
    MAX_WEBHOOK_CONFIGS: 500,
    /** Retention time for delivered webhooks (1 minute) */
    DELIVERED_RETENTION_MS: 60_000,
    /** Retention time for dead letter webhooks (24 hours) */
    DEAD_LETTER_RETENTION_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * Safe evaluator defaults
 */
export const SAFE_EVALUATOR = {
    /** Maximum number of cached compiled functions */
    MAX_CACHE_SIZE: 1000,
    /** Default timeout in milliseconds */
    DEFAULT_TIMEOUT_MS: 5000,
    /** Cache eviction percentage (10% of cache evicted when full) */
    CACHE_EVICTION_PERCENT: 0.1,
} as const;

/**
 * Throughput controller defaults
 */
export const THROUGHPUT = {
    /** Maximum size of drain queue */
    MAX_QUEUE_SIZE: 1000,
    /** Default deferred queue retry delay in seconds */
    DEFERRED_RETRY_DELAY_SEC: 5,
} as const;

/**
 * Risk assessment thresholds
 */
export const RISK_THRESHOLDS = {
    /** Record count considered high */
    HIGH_RECORD_COUNT: 10000,
    /** Record count considered very high */
    VERY_HIGH_RECORD_COUNT: 100000,
    /** Deletion count considered high */
    HIGH_DELETION_COUNT: 100,
    /** Failure rate percentage considered high */
    HIGH_FAILURE_RATE_PERCENT: 0.1,
    /** Memory usage in MB considered high */
    HIGH_MEMORY_USAGE_MB: 500,
    /** Database queries count considered high */
    HIGH_DATABASE_QUERIES: 1000,
    /** Duration in ms considered long (30 minutes) */
    LONG_DURATION_MS: 30 * 60 * 1000,
    /** Duration in ms considered very long (2 hours) */
    VERY_LONG_DURATION_MS: 2 * 60 * 60 * 1000,
    /** Number of entity types considered multiple */
    MULTIPLE_ENTITY_TYPES: 3,
    /** Risk score thresholds */
    RISK_SCORE_LOW: 20,
    RISK_SCORE_MEDIUM: 50,
    RISK_SCORE_HIGH: 80,
    /** Risk severity weights */
    SEVERITY_WEIGHT_INFO: 5,
    SEVERITY_WEIGHT_WARNING: 20,
    SEVERITY_WEIGHT_DANGER: 40,
} as const;

/**
 * Sandbox execution defaults
 */
export const SANDBOX = {
    /** Maximum records to process in sandbox mode */
    MAX_RECORDS: 100,
    /** Maximum samples per step */
    MAX_SAMPLES_PER_STEP: 10,
    /** Default timeout in milliseconds */
    DEFAULT_TIMEOUT_MS: 60000,
} as const;

/**
 * Impact analysis resource estimation defaults
 */
export const IMPACT_ANALYSIS = {
    /** Base memory usage in MB for pipeline execution */
    BASE_MEMORY_MB: 50,
    /** Memory usage per record in MB */
    PER_RECORD_MEMORY_MB: 0.01,
    /** Memory usage per transform step in MB */
    PER_TRANSFORM_MEMORY_MB: 10,
    /** CPU usage base percentage */
    BASE_CPU_PERCENT: 20,
    /** CPU percentage per 1000 records */
    CPU_PER_1000_RECORDS: 5,
    /** CPU percentage per transform step */
    CPU_PER_TRANSFORM: 10,
    /** Maximum CPU percentage cap */
    MAX_CPU_PERCENT: 100,
    /** Records per database query batch */
    DB_QUERY_BATCH_SIZE: 100,
    /** Maximum sample record IDs to collect per entity */
    MAX_SAMPLE_RECORD_IDS: 10,
    /** Maximum sample flows to return */
    MAX_SAMPLE_FLOWS: 10,
    /** Maximum sample field values to collect */
    MAX_SAMPLE_FIELD_VALUES: 3,
    /** Minimum runs needed for HIGH confidence */
    HIGH_CONFIDENCE_MIN_RUNS: 3,
    /** Fallback duration multiplier for sampling-based estimates */
    SAMPLING_DURATION_MULTIPLIER: 10,
    /** Duration ratio for extract phase */
    EXTRACT_DURATION_RATIO: 0.3,
    /** Duration ratio for transform phase */
    TRANSFORM_DURATION_RATIO: 0.2,
    /** Duration ratio for load phase */
    LOAD_DURATION_RATIO: 0.5,
    /** Duration ratio for sampling-based extract phase */
    SAMPLING_EXTRACT_RATIO: 0.3,
    /** Duration ratio for sampling-based transform phase */
    SAMPLING_TRANSFORM_RATIO: 0.2,
    /** Duration ratio for sampling-based load phase */
    SAMPLING_LOAD_RATIO: 0.5,
    /** Default base duration for sampling estimate in ms */
    DEFAULT_BASE_DURATION_MS: 1000,
    /** Number of recent runs to fetch for estimation */
    RECENT_RUNS_COUNT: 5,
} as const;

/**
 * Event trigger defaults
 */
export const EVENT_TRIGGER = {
    /** Maximum events in backpressure queue */
    MAX_QUEUE_SIZE: 1000,
} as const;

/**
 * Batch rollback defaults
 */
export const BATCH_ROLLBACK = {
    /** Interval for cleaning up stale transactions (default: 5 minutes) */
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    /** Maximum age for transactions before auto-cleanup (default: 1 hour) */
    MAX_TRANSACTION_AGE_MS: 60 * 60 * 1000,
} as const;

/**
 * Streaming/chunked processing defaults
 */
export const STREAMING = {
    /** Default chunk size for streaming operations */
    DEFAULT_CHUNK_SIZE: 1000,
    /** Maximum buffer size before forcing flush */
    MAX_BUFFER_SIZE: 10_000,
    /** Default concurrency for parallel processing */
    DEFAULT_CONCURRENCY: 5,
    /** Default average record size estimate in bytes */
    DEFAULT_AVG_RECORD_SIZE: 100,
} as const;

/**
 * XML parser defaults
 */
export const XML_PARSER = {
    /** Default attribute prefix for XML parsing */
    DEFAULT_ATTR_PREFIX: '@',
    /** Default tag names to search for records */
    DEFAULT_RECORD_TAGS: ['item', 'record', 'row', 'product', 'customer', 'order', 'entry'] as readonly string[],
    /** Maximum tag name length to prevent ReDoS */
    MAX_TAG_NAME_LENGTH: 100,
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
 * Hook execution defaults
 */
export const HOOK = {
    /** Default timeout for interceptor/script hooks */
    INTERCEPTOR_TIMEOUT_MS: 5_000,
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
 * Code security limits
 */
export const CODE_SECURITY = {
    /** Maximum length for user-provided code expressions */
    MAX_CODE_LENGTH: 10_000,
    /** Maximum length for condition expressions */
    MAX_CONDITION_LENGTH: 1_000,
    /** Maximum expression complexity (nesting depth, operations) */
    MAX_EXPRESSION_COMPLEXITY: 50,
    /** Maximum property access depth (a.b.c.d...) */
    MAX_PROPERTY_ACCESS_DEPTH: 10,
} as const;

/**
 * HTTP lookup operator defaults
 */
export const HTTP_LOOKUP = {
    /** Default cache TTL in seconds */
    DEFAULT_CACHE_TTL_SEC: 300,
    /** Default API key header name */
    DEFAULT_API_KEY_HEADER: 'X-API-Key',
    /** Default max retries for failed requests */
    DEFAULT_MAX_RETRIES: 2,
    /** Default batch size for bulk lookups */
    DEFAULT_BATCH_SIZE: 50,
} as const;

/**
 * Internal timing constants
 */
export const INTERNAL_TIMINGS = {
    /** Cleanup interval for cache/rate-limit stores (ms) */
    CLEANUP_INTERVAL_MS: 60_000,
    /** Short wait delay for connection pooling (ms) */
    CONNECTION_WAIT_MS: 100,
    /** Default rate limit window (ms) */
    DEFAULT_RATE_LIMIT_WINDOW_MS: 60_000,
    /** Default maximum requests per rate limit window */
    DEFAULT_RATE_LIMIT_MAX_REQUESTS: 60,
    /** Default webhook rate limit requests per minute */
    DEFAULT_WEBHOOK_RATE_LIMIT: 100,
    /** Maximum idle time for pooled connections before cleanup (ms) */
    CONNECTION_MAX_IDLE_MS: 5 * 60 * 1000, // 5 minutes
    /** Maximum retries when waiting for a connection (prevents infinite recursion) */
    CONNECTION_RETRY_MAX: 10,
    /** Cleanup interval for pending messages map (ms) */
    PENDING_MESSAGES_CLEANUP_INTERVAL_MS: 60_000,
    /** Maximum age for pending messages before cleanup (ms) */
    PENDING_MESSAGES_MAX_AGE_MS: 10 * 60 * 1000, // 10 minutes
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

    // Output path helper
    getOutputPath,
    OUTPUT_EXTENSIONS,

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

    // Internal timings
    CLEANUP_INTERVAL_MS: INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS,

    // Hook timeouts
    INTERCEPTOR_TIMEOUT_MS: HOOK.INTERCEPTOR_TIMEOUT_MS,
} as const;
