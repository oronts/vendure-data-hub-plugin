/**
 * Hook action types for pipeline lifecycle events.
 * Used in the `hooks` configuration of pipelines.
 *
 * @example
 * ```typescript
 * import { HOOK_ACTION } from '@vendure/data-hub/sdk';
 *
 * const action = { type: HOOK_ACTION.WEBHOOK, url: 'https://...' };
 * ```
 */
export const HOOK_ACTION = {
    /** Send HTTP POST to a webhook URL */
    WEBHOOK: 'WEBHOOK',
    /** Emit an event to the event bus */
    EMIT: 'EMIT',
    /** Trigger another pipeline by code */
    TRIGGER_PIPELINE: 'TRIGGER_PIPELINE',
    /** Log a message */
    LOG: 'LOG',
} as const;

/** Hook action type - union of all HOOK_ACTION values */
export type HookAction = typeof HOOK_ACTION[keyof typeof HOOK_ACTION];

/**
 * Run modes for pipeline execution.
 * Determines how the pipeline processes records.
 */
export const SDK_RUN_MODE = {
    /** Process all records synchronously in a single transaction */
    SYNC: 'SYNC',
    /** Process records asynchronously via job queue */
    ASYNC: 'ASYNC',
    /** Process records in batches */
    BATCH: 'BATCH',
    /** Process records as a continuous stream */
    STREAM: 'STREAM',
} as const;

/** Run mode type - union of all SDK_RUN_MODE values */
export type SdkRunMode = typeof SDK_RUN_MODE[keyof typeof SDK_RUN_MODE];

/**
 * Default trigger type used when no trigger config is provided.
 * @default 'manual'
 */
export const DEFAULT_TRIGGER_TYPE = 'MANUAL';

/**
 * Route condition comparison operators.
 * Used in route step branch conditions and filter operators.
 *
 * @example
 * ```typescript
 * import { ROUTE_OPERATOR } from '@vendure/data-hub/sdk';
 *
 * const condition = { field: 'status', cmp: ROUTE_OPERATOR.EQ, value: 'active' };
 * ```
 */
export const ROUTE_OPERATOR = {
    /** Equal (==) */
    EQ: 'eq',
    /** Not equal (!=) */
    NE: 'ne',
    /** Greater than (>) */
    GT: 'gt',
    /** Less than (<) */
    LT: 'lt',
    /** Greater than or equal (>=) */
    GTE: 'gte',
    /** Less than or equal (<=) */
    LTE: 'lte',
    /** Value is in array */
    IN: 'in',
    /** Value is not in array */
    NOT_IN: 'notIn',
    /** String contains substring */
    CONTAINS: 'contains',
    /** String does not contain substring */
    NOT_CONTAINS: 'notContains',
    /** String starts with prefix */
    STARTS_WITH: 'startsWith',
    /** String ends with suffix */
    ENDS_WITH: 'endsWith',
    /** String matches glob pattern */
    MATCHES: 'matches',
    /** String matches regex pattern */
    REGEX: 'regex',
    /** Field exists (is defined) */
    EXISTS: 'exists',
    /** Field is null */
    IS_NULL: 'isNull',
} as const;

/** Route operator type - union of all ROUTE_OPERATOR values */
export type RouteOperator = typeof ROUTE_OPERATOR[keyof typeof ROUTE_OPERATOR];

/**
 * Transform step operators.
 * Used in transform step configurations to specify data transformations.
 *
 * @example
 * ```typescript
 * import { TRANSFORM_OPERATOR } from '@vendure/data-hub/sdk';
 *
 * const operator = { op: TRANSFORM_OPERATOR.MAP, args: { mapping: {...} } };
 * ```
 */
export const TRANSFORM_OPERATOR = {
    /** Map fields from source to destination paths */
    MAP: 'map',
    /** Set a static value at a path */
    SET: 'set',
    /** Enrich with defaults or lookups */
    ENRICH: 'enrich',
    /** Remove a field */
    REMOVE: 'remove',
    /** Rename a field */
    RENAME: 'rename',
    /** Conditional filter (keep/drop) */
    WHEN: 'when',
    /** Render a string template */
    TEMPLATE: 'template',
    /** Lookup value from a map */
    LOOKUP: 'lookup',
    /** Convert currency to minor units */
    CURRENCY: 'currency',
    /** Convert between units */
    UNIT: 'unit',
    /** Filter unchanged records (delta detection) */
    DELTA_FILTER: 'deltaFilter',
    /** Compute aggregate (count, sum, avg, etc.) */
    AGGREGATE: 'aggregate',
    /** Flatten nested arrays */
    FLATTEN: 'flatten',
    /** Split string into array */
    SPLIT: 'split',
    /** Join array into string */
    JOIN: 'join',
    /** Return first non-null value from paths */
    COALESCE: 'coalesce',
    /** Format a date */
    DATE_FORMAT: 'dateFormat',
    /** Parse JSON string to object */
    PARSE_JSON: 'parseJson',
    /** Stringify object to JSON */
    STRINGIFY_JSON: 'stringifyJson',
    /** Trim whitespace */
    TRIM: 'trim',
    /** Convert to lowercase */
    LOWERCASE: 'lowercase',
    /** Convert to uppercase */
    UPPERCASE: 'uppercase',
    /** Generate URL-safe slug */
    SLUGIFY: 'slugify',
    /** Fetch data from HTTP endpoint */
    HTTP_LOOKUP: 'httpLookup',
} as const;

/** Transform operator type - union of all TRANSFORM_OPERATOR values */
export type TransformOperator = typeof TRANSFORM_OPERATOR[keyof typeof TRANSFORM_OPERATOR];
