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
 * Codes are camelCase to match backend FilterOperator and RouteConditionOperator types.
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

export function getOperatorDefinition(code: string): OperatorDefinition | undefined {
    return COMPARISON_OPERATORS.find(op => op.code === code);
}

export interface TransformOperatorDefinition {
    code: string;
    label: string;
    description: string;
    category: 'field' | 'record' | 'aggregate' | 'filter' | 'control';
    configFields?: string[];
}

/**
 * Transform operators for pipeline steps.
 * Codes are camelCase to match operator codes in src/operators/ (JS method naming convention).
 * Note: These are distinct from TransformationType which uses SCREAMING_SNAKE_CASE for step-level types.
 */
export const TRANSFORM_OPERATORS: TransformOperatorDefinition[] = [
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

export function getTransformOperator(code: string): TransformOperatorDefinition | undefined {
    return TRANSFORM_OPERATORS.find(op => op.code === code);
}

export function getTransformOperatorsByCategory(category: TransformOperatorDefinition['category']): TransformOperatorDefinition[] {
    return TRANSFORM_OPERATORS.filter(op => op.category === category);
}

export interface AggregationFunctionOption {
    code: string;
    label: string;
    description: string;
    requiresField: boolean;
}

/**
 * Aggregation function options for aggregate operators.
 * Used by aggregate step configuration UI.
 */
export const AGGREGATION_FUNCTIONS: AggregationFunctionOption[] = [
    { code: 'count', label: 'Count', description: 'Count records', requiresField: false },
    { code: 'sum', label: 'Sum', description: 'Sum numeric values', requiresField: true },
    { code: 'avg', label: 'Average', description: 'Calculate average', requiresField: true },
    { code: 'min', label: 'Minimum', description: 'Find minimum value', requiresField: true },
    { code: 'max', label: 'Maximum', description: 'Find maximum value', requiresField: true },
    { code: 'first', label: 'First', description: 'Take first value', requiresField: true },
    { code: 'last', label: 'Last', description: 'Take last value', requiresField: true },
    { code: 'concat', label: 'Concat', description: 'Join values as string', requiresField: true },
    { code: 'unique', label: 'Unique', description: 'Get unique values', requiresField: true },
];

export interface CoercionType {
    code: string;
    label: string;
    description: string;
}

/**
 * Type coercion options for typecast operators.
 * Used by typecast step configuration UI.
 */
export const COERCION_TYPES: CoercionType[] = [
    { code: 'string', label: 'String', description: 'Convert to string' },
    { code: 'number', label: 'Number', description: 'Convert to number' },
    { code: 'integer', label: 'Integer', description: 'Convert to integer' },
    { code: 'boolean', label: 'Boolean', description: 'Convert to boolean' },
    { code: 'date', label: 'Date', description: 'Parse as date' },
    { code: 'json', label: 'JSON', description: 'Parse as JSON' },
    { code: 'array', label: 'Array', description: 'Convert to array' },
];

export interface FormulaFunction {
    name: string;
    description: string;
}

export interface FormulaFunctionCategory {
    category: string;
    functions: FormulaFunction[];
}

/**
 * Formula function definitions grouped by category.
 * Used by formula step configuration UI to display available functions.
 */
export const FORMULA_FUNCTIONS: FormulaFunctionCategory[] = [
    { category: 'Math', functions: [
        { name: 'round(value, decimals?)', description: 'Round number to decimals' },
        { name: 'floor(value)', description: 'Round down to integer' },
        { name: 'ceil(value)', description: 'Round up to integer' },
        { name: 'abs(value)', description: 'Absolute value' },
        { name: 'min(a, b)', description: 'Minimum of two values' },
        { name: 'max(a, b)', description: 'Maximum of two values' },
    ]},
    { category: 'String', functions: [
        { name: 'upper(text)', description: 'Convert to uppercase' },
        { name: 'lower(text)', description: 'Convert to lowercase' },
        { name: 'trim(text)', description: 'Remove whitespace' },
        { name: 'concat(a, b, ...)', description: 'Join strings' },
        { name: 'substring(text, start, length?)', description: 'Extract substring' },
        { name: 'replace(text, find, replace)', description: 'Replace text' },
        { name: 'split(text, delimiter)', description: 'Split into array' },
    ]},
    { category: 'Date', functions: [
        { name: 'now()', description: 'Current timestamp' },
        { name: 'formatDate(date, format)', description: 'Format date string' },
        { name: 'parseDate(text, format)', description: 'Parse date from string' },
        { name: 'addDays(date, days)', description: 'Add days to date' },
    ]},
    { category: 'Logic', functions: [
        { name: 'if(condition, then, else)', description: 'Conditional value' },
        { name: 'coalesce(a, b, ...)', description: 'First non-null value' },
        { name: 'isNull(value)', description: 'Check if null' },
        { name: 'isEmpty(value)', description: 'Check if empty' },
    ]},
    { category: 'Conversion', functions: [
        { name: 'toNumber(value)', description: 'Convert to number' },
        { name: 'toString(value)', description: 'Convert to string' },
        { name: 'toBoolean(value)', description: 'Convert to boolean' },
        { name: 'toArray(value)', description: 'Wrap in array' },
    ]},
];
