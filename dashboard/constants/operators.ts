export interface OperatorDefinition {
    code: string;
    label: string;
    description: string;
    example?: string;
    valueType?: 'string' | 'number' | 'array' | 'regex' | 'any';
    noValue?: boolean;
}

/**
 * Comparison operators for filter conditions.
 * Codes are lowercase/camelCase to match backend FilterOperator and RouteConditionOperator types.
 * Standardized on 'ne' (not 'neq') and 'notIn' (not 'nin') for consistency.
 */
export const COMPARISON_OPERATORS: OperatorDefinition[] = [
    { code: 'eq', label: 'equals', description: 'Equal to value', valueType: 'any' },
    { code: 'ne', label: 'not equals', description: 'Not equal to value', valueType: 'any' },
    { code: 'gt', label: 'greater than', description: 'Greater than (numeric)', valueType: 'number' },
    { code: 'gte', label: 'greater or equal', description: 'Greater than or equal (numeric)', valueType: 'number' },
    { code: 'lt', label: 'less than', description: 'Less than (numeric)', valueType: 'number' },
    { code: 'lte', label: 'less or equal', description: 'Less than or equal (numeric)', valueType: 'number' },
    { code: 'contains', label: 'contains', description: 'String contains substring', valueType: 'string' },
    { code: 'startsWith', label: 'starts with', description: 'String starts with prefix', valueType: 'string' },
    { code: 'endsWith', label: 'ends with', description: 'String ends with suffix', valueType: 'string' },
    { code: 'in', label: 'in list', description: 'Value is contained in an array', example: '["A", "B"]', valueType: 'array' },
    { code: 'notIn', label: 'not in list', description: 'Value is not in array', example: '["X", "Y"]', valueType: 'array' },
    { code: 'isEmpty', label: 'is empty', description: 'Field is null, undefined, or empty', valueType: 'any', noValue: true },
    { code: 'isNotEmpty', label: 'is not empty', description: 'Field exists and is not empty', valueType: 'any', noValue: true },
    { code: 'exists', label: 'exists', description: 'Field exists in record', valueType: 'any', noValue: true },
    { code: 'notExists', label: 'not exists', description: 'Field does not exist in record', valueType: 'any', noValue: true },
    { code: 'regex', label: 'matches regex', description: 'String matches regular expression', example: '^SKU-\\d+$', valueType: 'regex' },
];

export interface TransformOperatorDefinition {
    code: string;
    label: string;
    description: string;
    category: 'field' | 'record' | 'aggregate' | 'filter' | 'control';
    configFields?: string[];
}

/**
 * Transform operators for pipeline steps.
 * Codes are lowercase to match operator codes in src/operators/ (JS method naming convention).
 * Note: These are distinct from TransformationType which uses SCREAMING_SNAKE_CASE for step-level types.
 */
const TRANSFORM_OPERATORS: TransformOperatorDefinition[] = [
    { code: 'map', label: 'Map', description: 'Map fields to new names/values', category: 'field', configFields: ['mapping'] },
    { code: 'template', label: 'Template', description: 'Generate fields using templates', category: 'field', configFields: ['templates'] },
    { code: 'rename', label: 'Rename', description: 'Rename field keys', category: 'field', configFields: ['renames'] },
    { code: 'typecast', label: 'Type Cast', description: 'Convert field types', category: 'field', configFields: ['coercions'] },
    { code: 'formula', label: 'Formula', description: 'Calculate new fields', category: 'field', configFields: ['computations'] },
    { code: 'filter', label: 'Filter', description: 'Filter records by conditions', category: 'filter', configFields: ['conditions'] },
    { code: 'validate', label: 'Validate', description: 'Validate data against rules', category: 'filter', configFields: ['rules'] },
    { code: 'split', label: 'Split', description: 'Split one record into multiple', category: 'record', configFields: ['field', 'delimiter'] },
    { code: 'merge', label: 'Merge', description: 'Merge multiple records into one', category: 'record', configFields: ['key', 'strategy'] },
    { code: 'dedupe', label: 'Dedupe', description: 'Remove duplicate records', category: 'record', configFields: ['key'] },
    { code: 'sort', label: 'Sort', description: 'Sort records by field', category: 'record', configFields: ['field', 'order'] },
    { code: 'aggregate', label: 'Aggregate', description: 'Group and aggregate records', category: 'aggregate', configFields: ['key', 'aggregations'] },
    { code: 'lookup', label: 'Lookup', description: 'Enrich from external source', category: 'field', configFields: ['source', 'map'] },
    { code: 'enrich', label: 'Enrich', description: 'Add or enhance data fields', category: 'field', configFields: ['enrichments'] },
    { code: 'script', label: 'Script', description: 'Execute custom transformation script', category: 'control', configFields: ['code', 'language'] },
];

