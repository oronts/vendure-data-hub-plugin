/**
 * Reliability, resilience, and performance defaults
 */

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
    /** Maximum number of registered webhooks to cache (prevents unbounded memory growth) */
    MAX_REGISTERED_WEBHOOKS: 1000,
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
    /** Maximum number of in-memory lock entries (prevents unbounded growth) */
    MAX_MEMORY_LOCKS: 1000,
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
 * Metrics defaults
 */
export const METRICS = {
    /** Maximum samples to keep in memory */
    MAX_SAMPLES: 1000,
    /** Percentile precision */
    PERCENTILE_PRECISION: 100,
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
