import { TIME_UNITS, UI_TIMEOUTS } from '../../shared/constants';
export { TIME_UNITS, UI_TIMEOUTS };

const TIME_INTERVALS = {
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

export const CRON = {
    /** Maximum iterations when searching for next cron occurrence (~1 year in minutes) */
    MAX_ITERATIONS: 525600,
    /** Minutes in one year */
    MINUTES_PER_YEAR: 525600,
} as const;

export const TIME = {
    ...TIME_UNITS,
    ...TIME_INTERVALS,
    COPY_FEEDBACK_TIMEOUT_MS: UI_TIMEOUTS.COPY_FEEDBACK_MS,
} as const;

export function calculateThroughput(records: number, durationMs: number): number {
    if (durationMs <= 0) return 0;
    return Math.round((records / durationMs) * TIME_UNITS.SECOND);
}
