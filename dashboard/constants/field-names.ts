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
} from '../../shared/types';

export type {
    TriggerTypeValue,
    LoadStrategyValue,
    ConflictResolutionValue,
    CanonicalTriggerConfig,
    CanonicalLoaderConfig,
} from '../../shared/types';

export const CONDITION_FIELDS = {
    FIELD: 'field',
    CMP: 'cmp',
    VALUE: 'value',
} as const;
