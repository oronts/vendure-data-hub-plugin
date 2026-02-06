/**
 * Transform Configuration Types for Mappers
 *
 * These are mapper-specific types, distinct from shared/types/mapping.types.ts.
 * Uses Mapper prefix to avoid naming conflicts.
 */

import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';

export type {
    FieldMapping as SharedFieldMapping,
    MappingResult as SharedMappingResult,
    MappingError as SharedMappingError,
} from '../../../shared/types';

export type MapperTransformType =
    | 'template'
    | 'lookup'
    | 'convert'
    | 'split'
    | 'join'
    | 'map'
    | 'date'
    | 'trim'
    | 'lowercase'
    | 'uppercase'
    | 'replace'
    | 'extract'
    | 'default'
    | 'concat'
    | 'math'
    | 'conditional'
    | 'custom';

export interface MapperTransformConfig {
    type: MapperTransformType;
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

export interface MapperFieldMapping {
    source: string;
    target: string;
    transforms?: MapperTransformConfig[];
    required?: boolean;
    defaultValue?: JsonValue;
    description?: string;
}

export interface MapperMappingResult {
    success: boolean;
    data: RecordObject;
    errors: MapperMappingError[];
    warnings: string[];
}

export interface MapperMappingError {
    field: string;
    message: string;
    value?: JsonValue;
}

export interface MapperLookupTable {
    name: string;
    data: RecordObject[];
    keyField: string;
}
