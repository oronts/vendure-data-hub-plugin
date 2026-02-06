/**
 * Dashboard constants - imports shared constants to avoid duplication.
 * The shared folder can be used by both dashboard and backend.
 */

/**
 * Time units in milliseconds - re-exported from shared constants
 */
export { TIME_UNITS } from '../../shared/constants';

/**
 * UI-related timeouts
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
 * Network port defaults - re-exported from shared constants
 */
export { PORTS, DEFAULT_HOSTS, SEARCH_SERVICE_PORTS, CONFIDENCE_THRESHOLDS } from '../../shared/constants';

/**
 * Match confidence type and conversion function - re-exported from src/constants
 */
export type { MatchConfidence } from '../../src/constants/validation';
export { scoreToConfidence } from '../../src/constants/validation';

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
