// TIME CONSTANTS - Time-related values in milliseconds

/**
 * Base time unit values in milliseconds
 */
export const TIME_UNITS = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
} as const;

/**
 * Common time intervals in milliseconds
 */
export const TIME_INTERVALS = {
    ONE_MINUTE_MS: TIME_UNITS.MINUTE,
    FIVE_MINUTES_MS: 5 * TIME_UNITS.MINUTE,
    FIFTEEN_MINUTES_MS: 15 * TIME_UNITS.MINUTE,
    THIRTY_MINUTES_MS: 30 * TIME_UNITS.MINUTE,
    ONE_HOUR_MS: TIME_UNITS.HOUR,
    SIX_HOURS_MS: 6 * TIME_UNITS.HOUR,
    TWELVE_HOURS_MS: 12 * TIME_UNITS.HOUR,
    ONE_DAY_MS: TIME_UNITS.DAY,
    SEVEN_DAYS_MS: 7 * TIME_UNITS.DAY,
    THIRTY_DAYS_MS: 30 * TIME_UNITS.DAY,
    NINETY_DAYS_MS: 90 * TIME_UNITS.DAY,
    // Execution timeouts
    /** Pipeline execution timeout (30 minutes) */
    PIPELINE_EXECUTION_TIMEOUT_MS: 30 * TIME_UNITS.MINUTE,
    /** Step execution timeout (5 minutes) */
    STEP_EXECUTION_TIMEOUT_MS: 5 * TIME_UNITS.MINUTE,
    /** Database operation timeout (1 minute) */
    DATABASE_OPERATION_TIMEOUT_MS: TIME_UNITS.MINUTE,
} as const;

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
 * Cron-related constants
 */
export const CRON = {
    /** Maximum iterations when searching for next cron occurrence (~1 year in minutes) */
    MAX_ITERATIONS: 525600,
    /** Minutes in one year */
    MINUTES_PER_YEAR: 525600,
} as const;

/**
 * Combined TIME object for convenient access
 */
export const TIME = {
    ...TIME_UNITS,
    ...TIME_INTERVALS,
    COPY_FEEDBACK_TIMEOUT_MS: UI_TIMEOUTS.COPY_FEEDBACK_MS,
} as const;

/**
 * Calculate milliseconds for a given duration
 * @param value - Numeric value
 * @param unit - Time unit
 * @returns Duration in milliseconds
 */
export function toMilliseconds(
    value: number,
    unit: 'second' | 'minute' | 'hour' | 'day',
): number {
    switch (unit) {
        case 'second':
            return value * TIME_UNITS.SECOND;
        case 'minute':
            return value * TIME_UNITS.MINUTE;
        case 'hour':
            return value * TIME_UNITS.HOUR;
        case 'day':
            return value * TIME_UNITS.DAY;
    }
}

/**
 * Calculate throughput (records per second)
 * @param records - Number of records processed
 * @param durationMs - Duration in milliseconds
 * @returns Records per second
 */
export function calculateThroughput(records: number, durationMs: number): number {
    if (durationMs <= 0) return 0;
    return Math.round((records / durationMs) * TIME_UNITS.SECOND);
}
