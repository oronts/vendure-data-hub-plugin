/**
 * Transform Configuration Types for Mappers
 */

import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';

export type {
    FieldMapping as SharedFieldMapping,
    MappingResult as SharedMappingResult,
    MappingError as SharedMappingError,
} from '../../../shared/types';

export type TransformType =
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

export interface FieldMapping {
    source: string;
    target: string;
    transforms?: TransformConfig[];
    required?: boolean;
    defaultValue?: JsonValue;
    description?: string;
}

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

export interface LookupTable {
    name: string;
    data: RecordObject[];
    keyField: string;
}
