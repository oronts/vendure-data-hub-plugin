/**
 * Field Mapping Types
 *
 * Types for field mapping, transformation, and data conversion operations.
 */

import { JsonValue } from './json.types';

/** Type of field transformation to apply */
export type FieldTransformType =
    | 'NONE'
    | 'UPPERCASE'
    | 'LOWERCASE'
    | 'TRIM'
    | 'CAPITALIZE'
    | 'TITLECASE'
    | 'TO_NUMBER'
    | 'TO_STRING'
    | 'TO_BOOLEAN'
    | 'TO_DATE'
    | 'TO_ARRAY'
    | 'FLATTEN'
    | 'SLUGIFY'
    | 'STRIP_HTML'
    | 'ENCODE_HTML'
    | 'DECODE_HTML'
    | 'PARSE_JSON'
    | 'STRINGIFY'
    | 'BASE64_ENCODE'
    | 'BASE64_DECODE'
    | 'MD5'
    | 'SHA256'
    | 'SPLIT'
    | 'JOIN'
    | 'REPLACE'
    | 'TEMPLATE'
    | 'CUSTOM';

/** Mathematical operation for numeric transformations */
export type MathOperation = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'MODULO' | 'POWER';

/**
 * Options for field transformation operations
 */
export interface TransformOptions {
    delimiter?: string;
    pattern?: string;
    replacement?: string;
    global?: boolean;
    template?: string;
    format?: string;
    timezone?: string;
    index?: number;
    group?: number;
    fields?: string[];
    precision?: number;
    operation?: MathOperation;
    operand?: number;
    defaultValue?: JsonValue;
    caseSensitive?: boolean;
    condition?: string;
    thenValue?: JsonValue;
    elseValue?: JsonValue;
}

/**
 * Field transformation configuration
 */
export interface FieldTransform {
    /** Type of transformation */
    type: FieldTransformType;
    /** Options for the transformation */
    options?: TransformOptions;
    /** Custom expression for complex transformations */
    expression?: string;
}

/** Extended transform type for pipeline operators */
export type TransformType =
    | 'TRIM'
    | 'LOWERCASE'
    | 'UPPERCASE'
    | 'SLUGIFY'
    | 'TRUNCATE'
    | 'PAD'
    | 'REPLACE'
    | 'REGEX_REPLACE'
    | 'REGEX_EXTRACT'
    | 'SPLIT'
    | 'JOIN'
    | 'CONCAT'
    | 'TEMPLATE'
    | 'STRIP_HTML'
    | 'ESCAPE_HTML'
    | 'TITLE_CASE'
    | 'SENTENCE_CASE'
    | 'PARSE_NUMBER'
    | 'PARSE_INT'
    | 'PARSE_FLOAT'
    | 'ROUND'
    | 'FLOOR'
    | 'CEIL'
    | 'ABS'
    | 'TO_CENTS'
    | 'FROM_CENTS'
    | 'MATH'
    | 'PARSE_DATE'
    | 'FORMAT_DATE'
    | 'NOW'
    | 'PARSE_BOOLEAN'
    | 'NEGATE'
    | 'TO_STRING'
    | 'TO_NUMBER'
    | 'TO_BOOLEAN'
    | 'TO_ARRAY'
    | 'TO_JSON'
    | 'PARSE_JSON'
    | 'LOOKUP'
    | 'MAP'
    | 'IF_ELSE'
    | 'COALESCE'
    | 'DEFAULT'
    | 'FIRST'
    | 'LAST'
    | 'NTH'
    | 'FILTER'
    | 'MAP_ARRAY'
    | 'FLATTEN'
    | 'EXPRESSION';

/** Position for padding operations */
export type PadPosition = 'LEFT' | 'RIGHT';

/** Type of lookup source */
export type LookupType = 'VENDURE_ENTITY' | 'VALUE_MAP' | 'EXTERNAL';

/**
 * Configuration options for transform operations.
 * Different transforms use different subsets of these options.
 */
export interface TransformConfig {
    /** Target length for truncate/pad operations */
    length?: number;
    /** Character to use for padding */
    padChar?: string;
    /** Position to pad (LEFT or RIGHT) */
    padPosition?: PadPosition;
    /** String to search for in replace operations */
    search?: string;
    /** Replacement string for replace operations */
    replacement?: string;
    /** Whether to replace all occurrences */
    global?: boolean;
    /** Regex pattern for pattern-based operations */
    pattern?: string;
    /** Regex capture group to extract */
    group?: number;
    /** Delimiter for split/join operations */
    delimiter?: string;
    /** Index for array element access */
    index?: number;
    /** Separator for join operations */
    separator?: string;
    /** Fields to include in concatenation */
    fields?: string[];
    /** Template string with placeholders */
    template?: string;
    /** Decimal precision for numeric operations */
    precision?: number;
    /** Math operation type */
    operation?: MathOperation;
    /** Operand for math operations */
    operand?: number;
    /** Input date/time format */
    inputFormat?: string;
    /** Output date/time format */
    outputFormat?: string;
    /** Timezone for date operations */
    timezone?: string;
    /** Values to interpret as true */
    trueValues?: string[];
    /** Values to interpret as false */
    falseValues?: string[];
    /** Lookup table name */
    table?: string;
    /** Field to match in lookup */
    fromField?: string;
    /** Field to return from lookup */
    toField?: string;
    /** Type of lookup source */
    lookupType?: LookupType;
    /** Entity type for Vendure lookups */
    entityType?: string;
    /** Static lookup values */
    values?: Record<string, JsonValue>;
    /** Default value if lookup fails */
    defaultValue?: JsonValue;
    /** Whether comparisons are case-sensitive */
    caseSensitive?: boolean;
    /** Condition for IF_ELSE transform */
    condition?: string;
    /** Value when condition is true */
    thenValue?: JsonValue;
    /** Value when condition is false */
    elseValue?: JsonValue;
    /** Position for NTH operation */
    position?: number;
    /** Custom expression */
    expression?: string;
}

/**
 * A transform operation with its configuration
 */
export interface Transform {
    /** Type of transform */
    type: TransformType;
    /** Transform configuration */
    config?: TransformConfig;
}

/**
 * Condition for conditional field mapping
 */
export interface MappingCondition {
    /** Field to evaluate */
    field: string;
    /** Comparison operator */
    operator: string;
    /** Value to compare against */
    value: JsonValue;
}

/**
 * Mapping definition for a single field
 */
export interface FieldMapping {
    /** Source field path (dot notation supported) */
    source: string;
    /** Target field path */
    target: string;
    /** Single transform to apply */
    transform?: FieldTransform | FieldTransformType;
    /** Chain of transforms to apply in order */
    transforms?: Transform[];
    /** Default value if source is missing */
    defaultValue?: JsonValue;
    /** Whether this mapping is required */
    required?: boolean;
    /** Condition for applying this mapping */
    condition?: string | MappingCondition;
    /** Description of this mapping */
    description?: string;
}

/**
 * Configuration for a complete mapping operation
 */
export interface MappingConfig {
    /** Field mappings to apply */
    mappings: FieldMapping[];
    /** Include unmapped fields in output */
    passthrough?: boolean;
    /** Preserve null values instead of omitting */
    preserveNulls?: boolean;
    /** Prefix to add to all target fields */
    targetPrefix?: string;
    /** Fields to exclude from output */
    exclude?: readonly string[];
    /** Flatten nested objects */
    flatten?: boolean;
    /** Prefix for flattened field names */
    flattenPrefix?: string;
}

/**
 * Result of a mapping operation
 */
export interface MappingResult {
    /** Whether mapping succeeded */
    success: boolean;
    /** Mapped data */
    data: Record<string, JsonValue>;
    /** Errors that occurred */
    errors: MappingError[];
    /** Warnings (non-fatal issues) */
    warnings: string[];
}

/**
 * Error that occurred during mapping
 */
export interface MappingError {
    /** Field that caused the error */
    field: string;
    /** Error message */
    message: string;
    /** Value that caused the error */
    value?: JsonValue;
}
