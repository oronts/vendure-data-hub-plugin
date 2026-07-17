/**
 * Runtime execution, analysis, and processing defaults
 */

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

export const PARALLEL_EXECUTION = {
    DEFAULT_MAX_CONCURRENT_STEPS: 4,
    MAX_CONCURRENT_STEPS: 16,
    ERROR_POLICIES: ['FAIL_FAST', 'CONTINUE', 'BEST_EFFORT'],
} as const;

/**
 * Hook execution defaults
 */
export const HOOK = {
    /** Default timeout for interceptor/script hooks */
    INTERCEPTOR_TIMEOUT_MS: 5_000,
    /** Maximum compiled Script entries to cache (prevents unbounded memory growth) */
    MAX_SCRIPT_CACHE: 100,
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
 * Queue/admin query defaults
 */
export const QUEUE = {
    /** Default limit for recent failed runs query */
    DEFAULT_RECENT_FAILED_LIMIT: 10,
    /** Default messages requested per broker poll */
    DEFAULT_MESSAGE_BATCH_SIZE: 10,
    /** Minimum messages requested per broker poll */
    MIN_MESSAGE_BATCH_SIZE: 1,
    /** Maximum messages requested per broker poll */
    MAX_MESSAGE_BATCH_SIZE: 100,
    /** Default number of deliveries processed in parallel */
    DEFAULT_MESSAGE_CONCURRENCY: 1,
    /** Minimum number of deliveries processed in parallel */
    MIN_MESSAGE_CONCURRENCY: 1,
    /** Maximum number of deliveries processed in parallel */
    MAX_MESSAGE_CONCURRENCY: 32,
    /** Minimum broker prefetch window */
    MIN_MESSAGE_PREFETCH: 1,
    /** Maximum broker prefetch window */
    MAX_MESSAGE_PREFETCH: 1_000,
    /** Default and minimum broker poll interval */
    DEFAULT_MESSAGE_POLL_INTERVAL_MS: 1_000,
    /** Maximum broker poll interval */
    MAX_MESSAGE_POLL_INTERVAL_MS: 5 * 60 * 1_000,
    /** Retry attempts after the initial pipeline enqueue failure */
    DEFAULT_MESSAGE_RETRIES: 3,
    /** Prevent a malformed definition from creating an excessive retry loop */
    MAX_MESSAGE_RETRIES: 10,
    /** Poll interval while a queue delivery waits for its correlated run */
    RUN_STATUS_POLL_INTERVAL_MS: 5_000,
    /**
     * Keep the wait below broker delivery leases and pending-entry cleanup windows.
     * A non-terminal run after this limit is treated as a processing timeout.
     */
    RUN_STATUS_WAIT_TIMEOUT_MS: 4 * 60 * 1_000,
    /** Redeliveries reuse their correlated run for this duration */
    RUN_IDEMPOTENCY_TTL_SECONDS: 7 * 24 * 60 * 60,
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
    /** Maximum object depth exposed in impact-analysis entity snapshots */
    SNAPSHOT_MAX_DEPTH: 4,
    /** Maximum array entries exposed in one impact-analysis snapshot */
    SNAPSHOT_MAX_ARRAY_ITEMS: 50,
    /** Maximum object keys exposed at each impact-analysis snapshot level */
    SNAPSHOT_MAX_OBJECT_KEYS: 100,
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
