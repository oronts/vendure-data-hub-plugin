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
    HTTP,
    BATCH,
    RETENTION,
    UI_TIMEOUTS,
} from '../../shared/constants';

/**
 * Match confidence type and conversion function - re-exported from src/constants
 */
export type { MatchConfidence } from '../../src/constants/validation';
export { scoreToConfidence } from '../../src/constants/validation';
