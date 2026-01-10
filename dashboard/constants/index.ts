/**
 * Dashboard Constants
 * Barrel export for all constant definitions
 */

// Field name constants - CRITICAL for UI/backend consistency
export {
    TRIGGER_FIELDS,
    LOADER_FIELDS,
    LOAD_STRATEGIES,
    EXTRACTOR_FIELDS,
    EXPORT_FIELDS,
    FEED_FIELDS,
    TRANSFORM_FIELDS,
    COMMON_FIELDS,
    DEPRECATED_OPERATION,
    DEPRECATED_CRON_EXPR,
} from './field-names';
export type { LoadStrategy } from './field-names';

// Navigation
export {
    DATAHUB_NAV_SECTION,
    DATAHUB_NAV_ID,
    DATAHUB_ROUTE_BASE,
    DATAHUB_JOBS_NAV_ID,
    DATAHUB_JOBS_ROUTE_BASE,
} from './navigation';

// Step types and configuration
export {
    STEP_TYPES,
    STEP_CONFIGS,
} from './steps';
export type { StepType, StepConfig } from './steps';

// Trigger types and configuration
export {
    TRIGGER_TYPES,
    TRIGGER_TYPE_CONFIGS,
    CRON_PRESETS,
} from './triggers';
export type { TriggerType, TriggerTypeConfig, CronPreset } from './triggers';

// Run status
export {
    RUN_STATUS,
    RUN_STATUS_CONFIGS,
} from './run-status';
export type { RunStatus, RunStatusConfig } from './run-status';

// Adapter categories
export {
    ADAPTER_CATEGORIES,
    ADAPTER_CATEGORY_CONFIGS,
} from './adapters';
export type { AdapterCategory, AdapterCategoryConfig } from './adapters';

// Vendure events
export {
    VENDURE_EVENTS,
    VENDURE_EVENTS_BY_CATEGORY,
} from './events';
export type { VendureEventConfig } from './events';

// Editor defaults
export {
    EDITOR_DEFAULTS,
    UI_DEFAULTS,
} from './editor';

// Operators and transform definitions
export {
    COMPARISON_OPERATORS,
    TRANSFORM_OPERATORS,
    AGGREGATION_FUNCTIONS,
    COERCION_TYPES,
    getOperatorDefinition,
    getTransformOperator,
    getTransformOperatorsByCategory,
} from './operators';
export type {
    OperatorDefinition,
    TransformOperatorDefinition,
    AggregationFunction,
    CoercionType,
} from './operators';

// UI configuration
export {
    ANALYTICS_THRESHOLDS,
    POLLING_INTERVALS,
    UI_LIMITS,
    CONFIDENCE_THRESHOLDS,
    PIPELINE_STATUS_VARIANTS,
    OPERATOR_PLACEHOLDERS,
    scoreToConfidence,
    getStatusBadgeVariant,
    getSuccessRateVariant,
    getSuccessRateTrend,
    getOperatorPlaceholder,
} from './ui-config';
export type { PipelineStatus, BadgeVariant } from './ui-config';

// Connection configuration defaults
export {
    CONNECTION_PORTS,
    CONNECTION_HOSTS,
    HTTP_CONNECTION_DEFAULTS,
    DATABASE_PLACEHOLDERS,
    CLOUD_PLACEHOLDERS,
    SEARCH_PLACEHOLDERS,
    getConnectionPlaceholder,
} from './connection-defaults';
