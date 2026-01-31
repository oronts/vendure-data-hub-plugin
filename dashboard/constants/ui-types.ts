/** Diff change types */
export const DIFF_TYPE = {
    ADDED: 'added',
    REMOVED: 'removed',
    CHANGED: 'changed',
    UNCHANGED: 'unchanged',
} as const;

/** Trend directions for stat cards */
export const TREND_DIRECTION = {
    UP: 'up',
    DOWN: 'down',
} as const;

export type TrendDirection = typeof TREND_DIRECTION[keyof typeof TREND_DIRECTION];

/** Move direction for reordering items */
export const MOVE_DIRECTION = {
    UP: 'up',
    DOWN: 'down',
} as const;

export type MoveDirection = typeof MOVE_DIRECTION[keyof typeof MOVE_DIRECTION];

/** Loading state types */
export const LOADING_STATE_TYPE = {
    SPINNER: 'spinner',
    TABLE: 'table',
    FORM: 'form',
    CARD: 'card',
    LIST: 'list',
} as const;

/** File upload mapper steps */
export const MAPPER_STEP = {
    UPLOAD: 'upload',
    PREVIEW: 'preview',
    MAPPING: 'mapping',
} as const;

/** Secret provider types */
export const SECRET_PROVIDER = {
    ENV: 'env',
    INLINE: 'inline',
} as const;

/** Revision types */
export const REVISION_TYPE = {
    PUBLISHED: 'published',
    DRAFT: 'draft',
} as const;

/** Field types for operator schema fields */
export const FIELD_TYPE = {
    JSON: 'json',
    OBJECT: 'object',
    ARRAY: 'array',
    SELECT: 'select',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    STRING: 'string',
    PASSWORD: 'password',
    TEXT: 'text',
    SECRET: 'secret',
    CONNECTION: 'connection',
    TEXTAREA: 'textarea',
    CODE: 'code',
    EXPRESSION: 'expression',
    CRON: 'cron',
    DATE: 'date',
    DATETIME: 'datetime',
    FILE: 'file',
    ENTITY: 'entity',
    FIELD: 'field',
    MAPPING: 'mapping',
    MULTISELECT: 'multiselect',
    EMAIL: 'email',
    URL: 'url',
    INT: 'int',
    FLOAT: 'float',
} as const;

export type FieldType = typeof FIELD_TYPE[keyof typeof FIELD_TYPE];

/** UI adapter categories for pipeline organization */
export const UI_ADAPTER_CATEGORY = {
    SOURCES: 'sources',
    TRANSFORMS: 'transforms',
    VALIDATION: 'validation',
    ROUTING: 'routing',
    DESTINATIONS: 'destinations',
    FEEDS: 'feeds',
    EXPORTS: 'exports',
    SINKS: 'sinks',
} as const;
