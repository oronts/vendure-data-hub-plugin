/**
 * Dashboard constants - imports shared constants to avoid duplication.
 * The shared folder can be used by both dashboard and backend.
 */

/**
 * Shared constants - re-exported from shared folder
 * These are used by both dashboard and backend for consistency
 */
export {
    TIME_UNITS,
    PORTS,
    DEFAULT_HOSTS,
    SEARCH_SERVICE_PORTS,
    CONFIDENCE_THRESHOLDS,
    HTTP,
    BATCH,
    RETENTION,
} from '../../shared/constants';

/**
 * UI-related timeouts (dashboard-specific)
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
 * Match confidence type and conversion function - re-exported from src/constants
 */
export type { MatchConfidence } from '../../src/constants/validation';
export { scoreToConfidence } from '../../src/constants/validation';
