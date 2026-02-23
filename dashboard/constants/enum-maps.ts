/**
 * Enum map constants for type-safe comparisons in wizard components
 * and across the dashboard. These are NOT option arrays for dropdowns
 * (which come from the backend via useOptionValues), but rather
 * constant maps used as type guards in switch/if statements.
 *
 * Shared constants are re-exported from shared/constants/enums.ts
 * to eliminate duplication between dashboard and backend.
 */

export {
    FILE_FORMAT,
    SOURCE_TYPE,
    EXPORT_FORMAT,
    CLEANUP_STRATEGY,
    COMPRESSION_TYPE,
} from '../../shared/constants';

