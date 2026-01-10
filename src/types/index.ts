export * from './common';
export * from './pipeline';
export * from './schema';
export * from './extractor-interfaces';
export * from './loader-interfaces';
export * from './plugin-options';
export * from './typed-config';
export * from './versioning.types';
export * from './impact-analysis.types';

// Shared types and field name constants - CRITICAL for UI/backend consistency
export {
    TRIGGER_FIELDS,
    TRIGGER_TYPES,
    LOADER_FIELDS,
    LOAD_STRATEGIES,
    EXTRACTOR_FIELDS,
    EXPORT_FIELDS,
    FEED_FIELDS,
    TRANSFORM_FIELDS,
    THROUGHPUT_FIELDS,
    COMMON_FIELDS,
    STEP_RESULT_FIELDS,
    WEBHOOK_FIELDS,
} from './shared';
export type {
    TriggerTypeValue,
    LoadStrategyValue,
    CanonicalTriggerConfig,
    CanonicalLoaderConfig,
} from './shared';
