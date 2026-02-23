import { HookActionType, RouteConditionOperator } from '../constants/enums';

/**
 * Hook action types for pipeline lifecycle events.
 * Used in the `hooks` configuration of pipelines.
 *
 * @example
 * ```typescript
 * import { HOOK_ACTION } from '@oronts/vendure-data-hub-plugin/sdk';
 *
 * const action = { type: HOOK_ACTION.WEBHOOK, url: 'https://...' };
 * ```
 */
export const HOOK_ACTION = {
    /** Send HTTP POST to a webhook URL */
    WEBHOOK: HookActionType.WEBHOOK,
    /** Emit an event to the event bus */
    EMIT: HookActionType.EMIT,
    /** Trigger another pipeline by code */
    TRIGGER_PIPELINE: HookActionType.TRIGGER_PIPELINE,
    /** Log a message */
    LOG: HookActionType.LOG,
    /** Run a sandboxed interceptor function that can modify records */
    INTERCEPTOR: HookActionType.INTERCEPTOR,
    /** Run a named script function registered via plugin options */
    SCRIPT: HookActionType.SCRIPT,
} as const;

/** Hook action type - union of all HOOK_ACTION values */
export type HookAction = typeof HOOK_ACTION[keyof typeof HOOK_ACTION];

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
 * import { ROUTE_OPERATOR } from '@oronts/vendure-data-hub-plugin/sdk';
 *
 * const condition = { field: 'status', cmp: ROUTE_OPERATOR.EQ, value: 'active' };
 * ```
 */
export const ROUTE_OPERATOR = {
    /** Equal (==) */
    EQ: RouteConditionOperator.EQ,
    /** Not equal (!=) */
    NE: RouteConditionOperator.NE,
    /** Greater than (>) */
    GT: RouteConditionOperator.GT,
    /** Less than (<) */
    LT: RouteConditionOperator.LT,
    /** Greater than or equal (>=) */
    GTE: RouteConditionOperator.GTE,
    /** Less than or equal (<=) */
    LTE: RouteConditionOperator.LTE,
    /** Value is in array */
    IN: RouteConditionOperator.IN,
    /** Value is not in array */
    NOT_IN: RouteConditionOperator.NOT_IN,
    /** String contains substring */
    CONTAINS: RouteConditionOperator.CONTAINS,
    /** String does not contain substring */
    NOT_CONTAINS: RouteConditionOperator.NOT_CONTAINS,
    /** String starts with prefix */
    STARTS_WITH: RouteConditionOperator.STARTS_WITH,
    /** String ends with suffix */
    ENDS_WITH: RouteConditionOperator.ENDS_WITH,
    /** String matches glob pattern */
    MATCHES: RouteConditionOperator.MATCHES,
    /** String matches regex pattern */
    REGEX: RouteConditionOperator.REGEX,
    /** Field exists (is defined) */
    EXISTS: RouteConditionOperator.EXISTS,
    /** Field is null */
    IS_NULL: RouteConditionOperator.IS_NULL,
} as const;

/** Route operator type - union of all ROUTE_OPERATOR values */
export type RouteOperator = typeof ROUTE_OPERATOR[keyof typeof ROUTE_OPERATOR];

/**
 * Transform step operators.
 * Used in transform step configurations to specify data transformations.
 *
 * @example
 * ```typescript
 * import { TRANSFORM_OPERATOR } from '@oronts/vendure-data-hub-plugin/sdk';
 *
 * const operator = { op: TRANSFORM_OPERATOR.MAP, args: { mapping: {...} } };
 * ```
 */
export const TRANSFORM_OPERATOR = {
    // Data operators
    /** Map fields from source to destination paths */
    MAP: 'map',
    /** Set a static value at a path */
    SET: 'set',
    /** Remove a field */
    REMOVE: 'remove',
    /** Rename a field */
    RENAME: 'rename',
    /** Copy a field value to another path */
    COPY: 'copy',
    /** Render a string template */
    TEMPLATE: 'template',
    /** Generate hash of field values */
    HASH: 'hash',
    /** Generate a UUID */
    UUID: 'uuid',

    // String operators
    /** Split string into array */
    SPLIT: 'split',
    /** Join array into string */
    JOIN: 'join',
    /** Trim whitespace */
    TRIM: 'trim',
    /** Convert to lowercase */
    LOWERCASE: 'lowercase',
    /** Convert to uppercase */
    UPPERCASE: 'uppercase',
    /** Generate URL-safe slug */
    SLUGIFY: 'slugify',
    /** Concatenate multiple fields into one */
    CONCAT: 'concat',
    /** Replace substring in a field */
    REPLACE: 'replace',
    /** Extract value using regex pattern */
    EXTRACT_REGEX: 'extractRegex',
    /** Replace using regex pattern */
    REPLACE_REGEX: 'replaceRegex',
    /** Strip HTML tags from a string */
    STRIP_HTML: 'stripHtml',
    /** Truncate string to a maximum length */
    TRUNCATE: 'truncate',

    // Numeric operators
    /** Perform math operations (add, subtract, multiply, etc.) */
    MATH: 'math',
    /** Convert currency to minor units */
    CURRENCY: 'currency',
    /** Convert between units */
    UNIT: 'unit',
    /** Convert value to number */
    TO_NUMBER: 'toNumber',
    /** Convert value to string */
    TO_STRING: 'toString',
    /** Parse number from locale-formatted string */
    PARSE_NUMBER: 'parseNumber',
    /** Format number with locale/currency support */
    FORMAT_NUMBER: 'formatNumber',
    /** Convert decimal amount to cents */
    TO_CENTS: 'toCents',
    /** Round a number */
    ROUND: 'round',

    // Date operators
    /** Format a date */
    DATE_FORMAT: 'dateFormat',
    /** Parse a date from string */
    DATE_PARSE: 'dateParse',
    /** Add time to a date */
    DATE_ADD: 'dateAdd',
    /** Calculate difference between two dates */
    DATE_DIFF: 'dateDiff',
    /** Set field to current timestamp */
    NOW: 'now',

    // Logic operators
    /** Conditional filter (keep/drop) */
    WHEN: 'when',
    /** Conditional value assignment (if/then/else) */
    IF_THEN_ELSE: 'ifThenElse',
    /** Map values using switch/case logic */
    SWITCH: 'switch',
    /** Filter unchanged records (delta detection) */
    DELTA_FILTER: 'deltaFilter',

    // JSON operators
    /** Parse JSON string to object */
    PARSE_JSON: 'parseJson',
    /** Stringify object to JSON */
    STRINGIFY_JSON: 'stringifyJson',
    /** Keep only specified fields */
    PICK: 'pick',
    /** Remove specified fields */
    OMIT: 'omit',

    // Enrichment operators
    /** Lookup value from a map */
    LOOKUP: 'lookup',
    /** Return first non-null value from paths */
    COALESCE: 'coalesce',
    /** Enrich with defaults or lookups */
    ENRICH: 'enrich',
    /** Set a default value if field is missing */
    DEFAULT: 'default',
    /** Fetch data from HTTP endpoint */
    HTTP_LOOKUP: 'httpLookup',

    // Aggregation operators
    /** Compute aggregate (count, sum, avg, etc.) */
    AGGREGATE: 'aggregate',
    /** Count items in an array field */
    COUNT: 'count',
    /** Deduplicate array values */
    UNIQUE: 'unique',
    /** Flatten nested arrays */
    FLATTEN: 'flatten',
    /** Get first element of an array */
    FIRST: 'first',
    /** Get last element of an array */
    LAST: 'last',
    /** Expand array field into multiple records */
    EXPAND: 'expand',
    /** Join two datasets by matching key fields */
    MULTI_JOIN: 'multiJoin',

    // Validation operators
    /** Validate required fields are present */
    VALIDATE_REQUIRED: 'validateRequired',
    /** Validate field matches a pattern */
    VALIDATE_FORMAT: 'validateFormat',

    // Script operator
    /** Execute inline JavaScript code */
    SCRIPT: 'script',

    // File operators
    /** Resize images referenced in record fields */
    IMAGE_RESIZE: 'imageResize',
    /** Convert image format (JPEG, PNG, WebP, AVIF, GIF) */
    IMAGE_CONVERT: 'imageConvert',
    /** Generate PDF from HTML template with record data */
    PDF_GENERATE: 'pdfGenerate',
} as const;

/** Transform operator type - union of all TRANSFORM_OPERATOR values */
export type TransformOperator = typeof TRANSFORM_OPERATOR[keyof typeof TRANSFORM_OPERATOR];
