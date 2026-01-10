/**
 * Operator Constants
 * Definitions for transform operators, comparisons, and rules
 */

// =====================================================================
// COMPARISON OPERATORS
// =====================================================================

export interface OperatorDefinition {
    code: string;
    label: string;
    description: string;
    example?: string;
    valueType?: 'string' | 'number' | 'array' | 'regex' | 'any';
}

/**
 * Comparison operators for conditions and rules
 */
export const COMPARISON_OPERATORS: OperatorDefinition[] = [
    { code: 'eq', label: 'Equals', description: 'Equal to value', valueType: 'any' },
    { code: 'ne', label: 'Not Equals', description: 'Not equal to value', valueType: 'any' },
    { code: 'gt', label: 'Greater Than', description: 'Greater than (numeric)', valueType: 'number' },
    { code: 'lt', label: 'Less Than', description: 'Less than (numeric)', valueType: 'number' },
    { code: 'gte', label: 'Greater or Equal', description: 'Greater than or equal (numeric)', valueType: 'number' },
    { code: 'lte', label: 'Less or Equal', description: 'Less than or equal (numeric)', valueType: 'number' },
    { code: 'in', label: 'In Array', description: 'Value is contained in an array', example: '["A", "B"]', valueType: 'array' },
    { code: 'notIn', label: 'Not In Array', description: 'Value is not in array', example: '["X", "Y"]', valueType: 'array' },
    { code: 'contains', label: 'Contains', description: 'String contains substring', valueType: 'string' },
    { code: 'startsWith', label: 'Starts With', description: 'String starts with prefix', valueType: 'string' },
    { code: 'endsWith', label: 'Ends With', description: 'String ends with suffix', valueType: 'string' },
    { code: 'regex', label: 'Regex Match', description: 'String matches regular expression', example: '^SKU-\\d+$', valueType: 'regex' },
    { code: 'exists', label: 'Exists', description: 'Field exists and is not null', valueType: 'any' },
    { code: 'notExists', label: 'Not Exists', description: 'Field is null or missing', valueType: 'any' },
];

/**
 * Get operator definition by code
 */
export function getOperatorDefinition(code: string): OperatorDefinition | undefined {
    return COMPARISON_OPERATORS.find(op => op.code === code);
}

// =====================================================================
// TRANSFORM OPERATORS
// =====================================================================

export interface TransformOperatorDefinition {
    code: string;
    label: string;
    description: string;
    category: 'field' | 'record' | 'aggregate' | 'filter' | 'control';
    configFields?: string[];
}

/**
 * Transform operators for pipeline steps
 */
export const TRANSFORM_OPERATORS: TransformOperatorDefinition[] = [
    // Field operations
    { code: 'map', label: 'Map', description: 'Map fields to new names/values', category: 'field', configFields: ['mapping'] },
    { code: 'template', label: 'Template', description: 'Generate fields using templates', category: 'field', configFields: ['templates'] },
    { code: 'pick', label: 'Pick', description: 'Keep only specified fields', category: 'field', configFields: ['fields'] },
    { code: 'omit', label: 'Omit', description: 'Remove specified fields', category: 'field', configFields: ['fields'] },
    { code: 'rename', label: 'Rename', description: 'Rename field keys', category: 'field', configFields: ['renames'] },
    { code: 'default', label: 'Default', description: 'Set default values for missing fields', category: 'field', configFields: ['defaults'] },
    { code: 'coerce', label: 'Coerce', description: 'Convert field types', category: 'field', configFields: ['coercions'] },
    { code: 'flatten', label: 'Flatten', description: 'Flatten nested objects', category: 'field', configFields: ['separator', 'maxDepth'] },
    { code: 'unflatten', label: 'Unflatten', description: 'Unflatten dot-notation to nested', category: 'field', configFields: ['separator'] },
    { code: 'compute', label: 'Compute', description: 'Calculate new fields', category: 'field', configFields: ['computations'] },

    // Record operations
    { code: 'filter', label: 'Filter', description: 'Filter records by conditions', category: 'filter', configFields: ['conditions'] },
    { code: 'when', label: 'When', description: 'Conditional transformations', category: 'control', configFields: ['condition', 'then', 'else'] },
    { code: 'split', label: 'Split', description: 'Split one record into multiple', category: 'record', configFields: ['field', 'delimiter'] },
    { code: 'merge', label: 'Merge', description: 'Merge multiple records into one', category: 'record', configFields: ['key', 'strategy'] },
    { code: 'dedupe', label: 'Dedupe', description: 'Remove duplicate records', category: 'record', configFields: ['key'] },
    { code: 'sort', label: 'Sort', description: 'Sort records by field', category: 'record', configFields: ['field', 'order'] },

    // Aggregate operations
    { code: 'group', label: 'Group', description: 'Group records by key', category: 'aggregate', configFields: ['key', 'aggregations'] },
    { code: 'count', label: 'Count', description: 'Count records', category: 'aggregate', configFields: [] },
    { code: 'sum', label: 'Sum', description: 'Sum numeric field', category: 'aggregate', configFields: ['field'] },
    { code: 'avg', label: 'Average', description: 'Average numeric field', category: 'aggregate', configFields: ['field'] },
];

/**
 * Get transform operator by code
 */
export function getTransformOperator(code: string): TransformOperatorDefinition | undefined {
    return TRANSFORM_OPERATORS.find(op => op.code === code);
}

/**
 * Get transform operators by category
 */
export function getTransformOperatorsByCategory(category: TransformOperatorDefinition['category']): TransformOperatorDefinition[] {
    return TRANSFORM_OPERATORS.filter(op => op.category === category);
}

// =====================================================================
// AGGREGATION FUNCTIONS
// =====================================================================

export interface AggregationFunction {
    code: string;
    label: string;
    description: string;
    requiresField: boolean;
}

export const AGGREGATION_FUNCTIONS: AggregationFunction[] = [
    { code: 'count', label: 'Count', description: 'Count records', requiresField: false },
    { code: 'sum', label: 'Sum', description: 'Sum numeric values', requiresField: true },
    { code: 'avg', label: 'Average', description: 'Calculate average', requiresField: true },
    { code: 'min', label: 'Minimum', description: 'Find minimum value', requiresField: true },
    { code: 'max', label: 'Maximum', description: 'Find maximum value', requiresField: true },
    { code: 'first', label: 'First', description: 'Take first value', requiresField: true },
    { code: 'last', label: 'Last', description: 'Take last value', requiresField: true },
    { code: 'concat', label: 'Concatenate', description: 'Join values as string', requiresField: true },
    { code: 'collect', label: 'Collect', description: 'Collect into array', requiresField: true },
];

// =====================================================================
// COERCION TYPES
// =====================================================================

export interface CoercionType {
    code: string;
    label: string;
    description: string;
}

export const COERCION_TYPES: CoercionType[] = [
    { code: 'string', label: 'String', description: 'Convert to string' },
    { code: 'number', label: 'Number', description: 'Convert to number' },
    { code: 'integer', label: 'Integer', description: 'Convert to integer' },
    { code: 'boolean', label: 'Boolean', description: 'Convert to boolean' },
    { code: 'date', label: 'Date', description: 'Parse as date' },
    { code: 'json', label: 'JSON', description: 'Parse as JSON' },
    { code: 'array', label: 'Array', description: 'Convert to array' },
];
