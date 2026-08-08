/**
 * Scheduler interval and timing defaults
 */

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
    /** Lease duration for one bounded retention purge */
    RETENTION_PURGE_LOCK_TTL_MS: 30 * 60 * 1000, // 30 minutes
    /** Interval for temporary file cleanup */
    FILE_CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    /** Interval for analytics refresh */
    ANALYTICS_REFRESH_INTERVAL_MS: 10_000,
    /** Minimum scheduler interval (safety limit) */
    MIN_INTERVAL_MS: 1000,
    /** Maximum number of pipelines to discover per cache refresh */
    MAX_PIPELINE_DISCOVERY: 1000,
    /** Maximum number of active schedules and in-memory tracking entries */
    MAX_TRACKING_ENTRIES: 1000,
    /** Default consecutive trigger failures before pausing a schedule */
    DEFAULT_MAX_CONSECUTIVE_FAILURES: 5,
    /** Hard ceiling for the configurable consecutive failure threshold */
    MAX_CONSECUTIVE_FAILURES: 100,
} as const;
