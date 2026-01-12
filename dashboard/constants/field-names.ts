/**
 * Field Name Constants
 *
 * Re-exports from backend for UI consistency.
 */

export {
    TRIGGER_FIELDS,
    TRIGGER_TYPES,
    LOADER_FIELDS,
    LOAD_STRATEGIES,
    CONFLICT_RESOLUTIONS,
    EXTRACTOR_FIELDS,
    EXPORT_FIELDS,
    FEED_FIELDS,
    TRANSFORM_FIELDS,
    THROUGHPUT_FIELDS,
    COMMON_FIELDS,
    STEP_RESULT_FIELDS,
    WEBHOOK_FIELDS,
} from '../../src/types/shared';

export type {
    TriggerTypeValue,
    LoadStrategyValue,
    ConflictResolutionValue,
    CanonicalTriggerConfig,
    CanonicalLoaderConfig,
} from '../../src/types/shared';

// Aliases for UI backward compatibility
export { LOAD_STRATEGIES as LOADER_STRATEGIES } from '../../src/types/shared';
export type { LoadStrategyValue as LoadStrategy } from '../../src/types/shared';
export type { ConflictResolutionValue as ConflictResolution } from '../../src/types/shared';

// Condition field names for UI
export const CONDITION_FIELDS = {
    FIELD: 'field',
    CMP: 'cmp',
    VALUE: 'value',
} as const;
