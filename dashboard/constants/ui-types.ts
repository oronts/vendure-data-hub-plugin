/** Diff change types */
export const DIFF_TYPE = {
    ADDED: 'ADDED',
    REMOVED: 'REMOVED',
    CHANGED: 'CHANGED',
    UNCHANGED: 'UNCHANGED',
} as const;

/** Trend directions for stat cards */
export const TREND_DIRECTION = {
    UP: 'UP',
    DOWN: 'DOWN',
} as const;

/** Move direction for reordering items */
export const MOVE_DIRECTION = {
    UP: 'UP',
    DOWN: 'DOWN',
} as const;

export type MoveDirection = typeof MOVE_DIRECTION[keyof typeof MOVE_DIRECTION];

/** Loading state types */
export const LOADING_STATE_TYPE = {
    SPINNER: 'SPINNER',
    TABLE: 'TABLE',
    FORM: 'FORM',
    CARD: 'CARD',
    LIST: 'LIST',
} as const;

/** File upload mapper steps */
export const MAPPER_STEP = {
    UPLOAD: 'UPLOAD',
    PREVIEW: 'PREVIEW',
    MAPPING: 'MAPPING',
} as const;

/** Secret provider types */
export const SECRET_PROVIDER = {
    ENV: 'ENV',
    INLINE: 'INLINE',
    EXTERNAL: 'EXTERNAL',
} as const;

/** Revision types */
export const REVISION_TYPE = {
    PUBLISHED: 'PUBLISHED',
    DRAFT: 'DRAFT',
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

/** UI adapter categories for pipeline organization */
export const UI_ADAPTER_CATEGORY = {
    SOURCES: 'SOURCES',
    TRANSFORMS: 'TRANSFORMS',
    VALIDATION: 'VALIDATION',
    ROUTING: 'ROUTING',
    DESTINATIONS: 'DESTINATIONS',
    FEEDS: 'FEEDS',
    EXPORTS: 'EXPORTS',
    SINKS: 'SINKS',
} as const;
