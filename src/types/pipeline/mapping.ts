/**
 * Field Mapping Types
 */

import { JsonValue } from '../common';
import { FilterOperator } from './filter';

export interface FieldMapping {
    /** Source field path (dot notation for nested) */
    source: string;

    /** Target field path */
    target: string;

    /** Chain of transforms to apply */
    transforms?: Transform[];

    /** Is this field required? */
    required?: boolean;

    /** Default value if source is empty */
    defaultValue?: JsonValue;

    /** Human-readable description */
    description?: string;

    /** Conditional mapping - only apply if condition is true */
    condition?: MappingCondition;
}

export interface MappingCondition {
    field: string;
    operator: FilterOperator;
    value: JsonValue;
}

// TRANSFORMS

export type TransformType =
    // String transforms
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
    // Number transforms
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
    // Date transforms
    | 'PARSE_DATE'
    | 'FORMAT_DATE'
    | 'NOW'
    // Boolean transforms
    | 'PARSE_BOOLEAN'
    | 'NEGATE'
    // Type conversion
    | 'TO_STRING'
    | 'TO_NUMBER'
    | 'TO_BOOLEAN'
    | 'TO_ARRAY'
    | 'TO_JSON'
    | 'PARSE_JSON'
    // Lookup transforms
    | 'LOOKUP'
    | 'MAP'
    // Conditional transforms
    | 'IF_ELSE'
    | 'COALESCE'
    | 'DEFAULT'
    // Array transforms
    | 'FIRST'
    | 'LAST'
    | 'NTH'
    | 'FILTER'
    | 'MAP_ARRAY'
    | 'FLATTEN'
    // Custom
    | 'EXPRESSION';

export interface Transform {
    type: TransformType;
    config?: TransformConfig;
}

export interface TransformConfig {
    // TRUNCATE, PAD
    length?: number;

    // PAD
    padChar?: string;
    padPosition?: 'LEFT' | 'RIGHT';

    // REPLACE, REGEX_REPLACE
    search?: string;
    replacement?: string;
    global?: boolean;

    // REGEX_EXTRACT
    pattern?: string;
    group?: number;

    // SPLIT
    delimiter?: string;
    index?: number;

    // JOIN, CONCAT
    separator?: string;
    fields?: string[];

    // TEMPLATE
    template?: string;

    // ROUND, MATH
    precision?: number;
    operation?: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE';
    operand?: number;

    // PARSE_DATE, FORMAT_DATE
    inputFormat?: string;
    outputFormat?: string;
    timezone?: string;

    // PARSE_BOOLEAN
    trueValues?: string[];
    falseValues?: string[];

    // LOOKUP
    table?: string;
    fromField?: string;
    toField?: string;
    lookupType?: 'VENDURE_ENTITY' | 'CUSTOM_TABLE';
    entityType?: string;

    // MAP
    values?: Record<string, JsonValue>;
    defaultValue?: JsonValue;
    caseSensitive?: boolean;

    // IF_ELSE
    condition?: string;
    thenValue?: JsonValue;
    elseValue?: JsonValue;

    // NTH
    position?: number;

    // FILTER, MAP_ARRAY, EXPRESSION
    expression?: string;
}
