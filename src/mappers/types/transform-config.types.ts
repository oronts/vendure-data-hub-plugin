/**
 * Transform Configuration Types
 *
 * These types are shared between the FieldMapperService and the transformer modules.
 * Extracting them to a separate file breaks the circular dependency chain.
 */

import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';

/**
 * Transform types supported by the field mapper
 */
export type TransformType =
    | 'template'      // String template with ${field} placeholders
    | 'lookup'        // Lookup value in a table/map
    | 'convert'       // Type conversion (string to number, etc.)
    | 'split'         // Split string into array
    | 'join'          // Join array into string
    | 'map'           // Map values using a dictionary
    | 'date'          // Date parsing/formatting
    | 'trim'          // Trim whitespace
    | 'lowercase'     // Convert to lowercase
    | 'uppercase'     // Convert to uppercase
    | 'replace'       // String replacement
    | 'extract'       // Extract with regex
    | 'default'       // Default value if empty
    | 'concat'        // Concatenate multiple fields
    | 'math'          // Mathematical operations
    | 'conditional'   // Conditional logic
    | 'custom';       // Custom JavaScript expression

/**
 * Transform configuration
 */
export interface TransformConfig {
    type: TransformType;
    template?: string;
    lookup?: {
        table: string;
        fromField: string;
        toField: string;
        default?: JsonValue;
    };
    convert?: {
        from: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'auto';
        to: 'string' | 'number' | 'boolean' | 'date' | 'json';
        format?: string;
    };
    split?: {
        delimiter: string;
        index?: number;
        trim?: boolean;
    };
    join?: {
        delimiter: string;
        fields?: string[];
    };
    map?: {
        values: Record<string, JsonValue>;
        default?: JsonValue;
        caseSensitive?: boolean;
    };
    date?: {
        inputFormat?: string;
        outputFormat?: string;
        timezone?: string;
    };
    replace?: {
        search: string;
        replacement: string;
        regex?: boolean;
        global?: boolean;
    };
    extract?: {
        pattern: string;
        group?: number;
    };
    default?: {
        value: JsonValue;
        onlyIfEmpty?: boolean;
    };
    concat?: {
        fields: string[];
        separator?: string;
    };
    math?: {
        operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'round' | 'floor' | 'ceil' | 'abs';
        operand?: number;
        precision?: number;
    };
    conditional?: {
        condition: string;
        then: JsonValue;
        else?: JsonValue;
    };
    custom?: {
        expression: string;
    };
}

/**
 * Field mapping definition
 */
export interface FieldMapping {
    source: string;
    target: string;
    transforms?: TransformConfig[];
    required?: boolean;
    defaultValue?: JsonValue;
    description?: string;
}

/**
 * Mapping result for a single record
 */
export interface MappingResult {
    success: boolean;
    data: RecordObject;
    errors: MappingError[];
    warnings: string[];
}

export interface MappingError {
    field: string;
    message: string;
    value?: JsonValue;
}

/**
 * Lookup table for value lookups
 */
export interface LookupTable {
    name: string;
    data: RecordObject[];
    keyField: string;
}
