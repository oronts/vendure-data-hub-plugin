/**
 * Pipeline domain enums - Pipeline lifecycle, execution, and configuration types
 */

/**
 * Diff entry type identifiers for pipeline revision comparison
 *
 * Values use lowercase to match type identifier conventions (AdapterType, TriggerType)
 */
export enum DiffEntryType {
    STEP = 'step',
    TRIGGER = 'trigger',
    HOOK = 'hook',
    EDGE = 'edge',
    CONFIG = 'config',
    META = 'meta',
}

export const TriggerType = {
    MANUAL: "MANUAL",
    SCHEDULE: "SCHEDULE",
    WEBHOOK: "WEBHOOK",
    EVENT: "EVENT",
    FILE: "FILE",
    MESSAGE: "MESSAGE",
} as const;
export type TriggerType = typeof TriggerType[keyof typeof TriggerType];

/**
 * Pipeline lifecycle status
 */
export enum PipelineStatus {
    DRAFT = 'DRAFT',
    REVIEW = 'REVIEW',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

export enum RevisionType {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
}

/**
 * Pipeline run execution status
 */
export const RunStatus = {
    PENDING: "PENDING",
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    TIMEOUT: "TIMEOUT",
    CANCELLED: "CANCELLED",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
} as const;
export type RunStatus = typeof RunStatus[keyof typeof RunStatus];

/**
 * Pipeline step types that define processing stages
 */
export const StepType = {
    TRIGGER: "TRIGGER",
    EXTRACT: "EXTRACT",
    TRANSFORM: "TRANSFORM",
    VALIDATE: "VALIDATE",
    ENRICH: "ENRICH",
    ROUTE: "ROUTE",
    LOAD: "LOAD",
    EXPORT: "EXPORT",
    FEED: "FEED",
    SINK: "SINK",
} as const;
export type StepType = typeof StepType[keyof typeof StepType];

/**
 * Hook stages in pipeline execution lifecycle
 *
 * Note: Values use SCREAMING_SNAKE_CASE to match runtime usage patterns
 * throughout the codebase (hook registrations, configurations, etc.)
 */
export const HookStage = {
    BEFORE_EXTRACT: "BEFORE_EXTRACT",
    AFTER_EXTRACT: "AFTER_EXTRACT",
    BEFORE_TRANSFORM: "BEFORE_TRANSFORM",
    AFTER_TRANSFORM: "AFTER_TRANSFORM",
    BEFORE_VALIDATE: "BEFORE_VALIDATE",
    AFTER_VALIDATE: "AFTER_VALIDATE",
    BEFORE_ENRICH: "BEFORE_ENRICH",
    AFTER_ENRICH: "AFTER_ENRICH",
    BEFORE_ROUTE: "BEFORE_ROUTE",
    AFTER_ROUTE: "AFTER_ROUTE",
    BEFORE_LOAD: "BEFORE_LOAD",
    AFTER_LOAD: "AFTER_LOAD",
    ON_ERROR: "ON_ERROR",
    ON_RETRY: "ON_RETRY",
    ON_DEAD_LETTER: "ON_DEAD_LETTER",
    PIPELINE_STARTED: "PIPELINE_STARTED",
    PIPELINE_COMPLETED: "PIPELINE_COMPLETED",
    PIPELINE_FAILED: "PIPELINE_FAILED",
} as const;
export type HookStage = typeof HookStage[keyof typeof HookStage];

/**
 * Hook action types
 *
 * Values use SCREAMING_SNAKE_CASE to match the type definition in shared/types
 */
export const HookActionType = {
    WEBHOOK: "WEBHOOK",
    EMIT: "EMIT",
    TRIGGER_PIPELINE: "TRIGGER_PIPELINE",
    LOG: "LOG",
    INTERCEPTOR: "INTERCEPTOR",
    SCRIPT: "SCRIPT",
} as const;
export type HookActionType = typeof HookActionType[keyof typeof HookActionType];

/**
 * Route condition comparison operators
 */
export enum RouteConditionOperator {
    EQ = 'eq',
    NE = 'ne',
    GT = 'gt',
    LT = 'lt',
    GTE = 'gte',
    LTE = 'lte',
    IN = 'in',
    NOT_IN = 'notIn',
    CONTAINS = 'contains',
    NOT_CONTAINS = 'notContains',
    STARTS_WITH = 'startsWith',
    ENDS_WITH = 'endsWith',
    MATCHES = 'matches',
    REGEX = 'regex',
    EXISTS = 'exists',
    IS_NULL = 'isNull',
}

/**
 * Pipeline run modes
 */
export const RunMode = {
    SYNC: "SYNC",
    ASYNC: "ASYNC",
    BATCH: "BATCH",
    STREAM: "STREAM",
} as const;
export type RunMode = typeof RunMode[keyof typeof RunMode];

/**
 * Step execution status within a pipeline run
 * Values use SCREAMING_SNAKE_CASE to match RunStatus enum
 */
export enum StepStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}

/**
 * Pipeline source types (high-level data origin)
 */
export type PipelineSourceType =
    | 'FILE_UPLOAD'
    | 'WEBHOOK'
    | 'HTTP_API'
    | 'FTP'
    | 'S3'
    | 'DATABASE'
    | 'VENDURE_QUERY'
    | 'EVENT';

/**
 * Event kinds for pipeline event triggers
 *
 * Values use SCREAMING_SNAKE_CASE to match entity type conventions
 */
export enum EventKind {
    PRODUCT = 'PRODUCT',
    VARIANT = 'VARIANT',
    ASSET = 'ASSET',
    COLLECTION = 'COLLECTION',
    CUSTOMER = 'CUSTOMER',
    ORDER_STATE = 'ORDER_STATE',
}

/**
 * Timer types for scheduled pipeline execution
 */
export const TIMER_TYPE = {
    INTERVAL: 'interval',
    CRON: 'cron',
    REFRESH: 'refresh',
} as const;
export type TimerType = typeof TIMER_TYPE[keyof typeof TIMER_TYPE];

/**
 * Pipeline validation error codes
 *
 * Error codes follow SCREAMING_SNAKE_CASE convention for consistency
 * with other error codes in the codebase (PipelineErrorCode, ExtractorErrorCode, etc.)
 */
export const PIPELINE_VALIDATION_ERROR = {
    DUPLICATE_STEP_KEY: 'PIPELINE_DUPLICATE_STEP_KEY',
    INVALID_STEP_TYPE: 'PIPELINE_INVALID_STEP_TYPE',
    MISSING_CONFIG: 'PIPELINE_MISSING_CONFIG',
    INVALID_CONCURRENCY: 'PIPELINE_INVALID_CONCURRENCY',
    INVALID_EDGE: 'PIPELINE_INVALID_EDGE',
    EDGE_MISSING_NODES: 'PIPELINE_EDGE_MISSING_NODES',
    EDGE_UNKNOWN_SOURCE: 'PIPELINE_EDGE_UNKNOWN_SOURCE',
    EDGE_UNKNOWN_TARGET: 'PIPELINE_EDGE_UNKNOWN_TARGET',
    EDGE_SELF_LOOP: 'PIPELINE_EDGE_SELF_LOOP',
    EDGE_BRANCH_NON_ROUTE: 'PIPELINE_EDGE_BRANCH_NON_ROUTE',
    EDGE_UNKNOWN_BRANCH: 'PIPELINE_EDGE_UNKNOWN_BRANCH',
    ROUTE_MISSING_BRANCHES: 'PIPELINE_ROUTE_MISSING_BRANCHES',
    ROUTE_BRANCH_MISSING_NAME: 'PIPELINE_ROUTE_BRANCH_MISSING_NAME',
    ROUTE_BRANCH_DUPLICATE: 'PIPELINE_ROUTE_BRANCH_DUPLICATE',
    INVALID_ROOT_COUNT: 'PIPELINE_INVALID_ROOT_COUNT',
    INVALID_ROOT_TYPE: 'PIPELINE_INVALID_ROOT_TYPE',
    GRAPH_CYCLE: 'PIPELINE_GRAPH_CYCLE',
    NO_LOAD_REACHABLE: 'PIPELINE_NO_LOAD_REACHABLE',
    INVALID_DEFINITION: 'PIPELINE_INVALID_DEFINITION',
    INVALID_VERSION: 'PIPELINE_INVALID_VERSION',
} as const;

/**
 * Validation error codes - re-exported from shared types
 */
export { VALIDATION_ERROR_CODE, type ValidationErrorCode } from '../../../shared/types/validation.types';

