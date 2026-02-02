/**
 * Mapper transform constants
 */

/** Transform types for field mapping */
export const MAPPER_TRANSFORM_TYPE = {
    TEMPLATE: 'template',
    LOOKUP: 'lookup',
    CONVERT: 'convert',
    SPLIT: 'split',
    JOIN: 'join',
    MAP: 'map',
    DATE: 'date',
    TRIM: 'trim',
    LOWERCASE: 'lowercase',
    UPPERCASE: 'uppercase',
    REPLACE: 'replace',
    EXTRACT: 'extract',
    DEFAULT: 'default',
    CONCAT: 'concat',
    MATH: 'math',
    CONDITIONAL: 'conditional',
    CUSTOM: 'custom',
} as const;
export type MapperTransformType = typeof MAPPER_TRANSFORM_TYPE[keyof typeof MAPPER_TRANSFORM_TYPE];

/** Data types for type detection */
export const DATA_TYPE = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    DATE: 'date',
    ARRAY: 'array',
    OBJECT: 'object',
    NULL: 'null',
    MIXED: 'mixed',
    LOCALIZED_STRING: 'localized-string',
    MONEY: 'money',
    ID: 'id',
    ENUM: 'enum',
    RELATION: 'relation',
    ASSET: 'asset',
    JSON: 'json',
} as const;
export type DataType = typeof DATA_TYPE[keyof typeof DATA_TYPE];

/** Boolean value mappings for conversion */
export const BOOLEAN_MAPPINGS: Record<string, boolean> = {
    yes: true,
    no: false,
    true: true,
    false: false,
    '1': true,
    '0': false,
    active: true,
    inactive: false,
    enabled: true,
    disabled: false,
};

/** Values that indicate a boolean field */
export const BOOLEAN_DETECTOR_VALUES = ['yes', 'no', 'true', 'false', '1', '0', 'active', 'inactive'];

/** Math operations for number transforms */
export const MAPPER_MATH_OPERATION = {
    ADD: 'add',
    SUBTRACT: 'subtract',
    MULTIPLY: 'multiply',
    DIVIDE: 'divide',
    ROUND: 'round',
    FLOOR: 'floor',
    CEIL: 'ceil',
    ABS: 'abs',
} as const;
export type MapperMathOperation = typeof MAPPER_MATH_OPERATION[keyof typeof MAPPER_MATH_OPERATION];

/** ISO date pattern for detection */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/** Normalization patterns */
export const SEPARATOR_PATTERN = /[-_\s]+/g;
export const CAMEL_CASE_PATTERN = /([a-z])([A-Z])/g;
