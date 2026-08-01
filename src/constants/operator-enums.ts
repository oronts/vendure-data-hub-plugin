/**
 * Target operation constants for entity loaders.
 * Use these constants instead of string literals for type safety.
 */
export const TARGET_OPERATION = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    UPSERT: 'UPSERT',
    MERGE: 'MERGE',
    DELETE: 'DELETE',
} as const;

/**
 * Timer types for scheduled pipeline execution
 */
export const TIMER_TYPE = {
    INTERVAL: 'INTERVAL',
    CRON: 'CRON',
    REFRESH: 'REFRESH',
} as const;
export type TimerType = typeof TIMER_TYPE[keyof typeof TIMER_TYPE];

/**
 * Outcome types for loader record processing
 */
export const OUTCOME_TYPE = {
    SKIP: 'SKIP',
    ERROR: 'ERROR',
    CONTINUE: 'CONTINUE',
} as const;
export type LoaderOutcomeType = typeof OUTCOME_TYPE[keyof typeof OUTCOME_TYPE];

/**
 * Field types for entity schema definitions
 */
export enum FieldType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
}

/**
 * Date format constants for date parsing and formatting operations
 */
export const DATE_FORMAT = {
    ISO_DATE: 'YYYY-MM-DD',
    EU_SLASH: 'DD/MM/YYYY',
    EU_DOT: 'DD.MM.YYYY',
    US_DATE: 'MM/DD/YYYY',
    ISO_DATETIME: 'YYYY-MM-DDTHH:mm:ss',
    ISO_DATETIME_Z: 'YYYY-MM-DDTHH:mm:ssZ',
} as const;

/**
 * Math operations for numeric transforms
 */
export enum MathOperation {
    ADD = 'ADD',
    SUBTRACT = 'SUBTRACT',
    MULTIPLY = 'MULTIPLY',
    DIVIDE = 'DIVIDE',
    MODULO = 'MODULO',
    POWER = 'POWER',
}

/**
 * Pad position for string padding
 */
export enum PadPosition {
    LEFT = 'LEFT',
    RIGHT = 'RIGHT',
}

/**
 * Lookup types for record lookups
 */
export enum LookupType {
    VENDURE_ENTITY = 'VENDURE_ENTITY',
    VALUE_MAP = 'VALUE_MAP',
    EXTERNAL = 'EXTERNAL',
}

/**
 * Filter action types
 */
export enum FilterAction {
    KEEP = 'KEEP',
    DROP = 'DROP',
}

/**
 * Pipeline validation error codes
 */
export const PIPELINE_VALIDATION_ERROR = {
    DUPLICATE_STEP_KEY: 'PIPELINE_DUPLICATE_STEP_KEY',
    INVALID_STEP_TYPE: 'PIPELINE_INVALID_STEP_TYPE',
    MISSING_CONFIG: 'PIPELINE_MISSING_CONFIG',
    INVALID_CONCURRENCY: 'PIPELINE_INVALID_CONCURRENCY',
    INVALID_SCHEMA_REFERENCE: 'PIPELINE_INVALID_SCHEMA_REFERENCE',
    SCHEMA_REFERENCE_NOT_FOUND: 'PIPELINE_SCHEMA_REFERENCE_NOT_FOUND',
    SCHEMA_REFERENCE_CHECK_UNAVAILABLE: 'PIPELINE_SCHEMA_REFERENCE_CHECK_UNAVAILABLE',
    INVALID_GATE_CONFIG: 'PIPELINE_INVALID_GATE_CONFIG',
    INVALID_VALIDATION_RULE: 'PIPELINE_INVALID_VALIDATION_RULE',
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
    DEFINITION_TOO_DEEP: 'PIPELINE_DEFINITION_TOO_DEEP',
    DEFINITION_TOO_LARGE: 'PIPELINE_DEFINITION_TOO_LARGE',
    INVALID_VERSION: 'PIPELINE_INVALID_VERSION',
} as const;

/**
 * Re-export DESTINATION_TYPE from shared constants (single source of truth).
 */
export { DESTINATION_TYPE } from '../../shared/constants';

/**
 * Runtime delivery destination type.
 */
export type DestinationType = import('../../shared/types').DestinationType;
