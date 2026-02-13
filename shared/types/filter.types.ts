/**
 * Filter Types
 *
 * Types for filtering records in pipeline processing.
 * Comparison operator values are camelCase (serialized to DB, changing requires migration).
 */

/**
 * Comparison operators for filter conditions
 *
 * Values are camelCase (serialized to DB, changing requires migration)
 */
export type FilterOperator =
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'notIn'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'regex'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'exists'
    | 'notExists';

/** Logical operators for combining filter conditions */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Filter action determining what happens to matching records
 *
 * Uses SCREAMING_SNAKE_CASE as per naming convention for status values
 */
export type FilterAction = 'KEEP' | 'DROP';

/**
 * Single filter condition comparing a field to a value
 */
export interface FilterCondition {
    /** Field path to evaluate (supports dot notation for nested fields) */
    field: string;
    /** Comparison operator to apply */
    operator: FilterOperator;
    /** Value to compare against (optional for unary operators like exists) */
    value?: unknown;
    /** Whether string comparisons should be case-insensitive */
    caseInsensitive?: boolean;
}

/**
 * Group of filter conditions combined with a logical operator
 */
export interface FilterGroup {
    /** Logical operator to combine conditions */
    logic: LogicalOperator;
    /** Nested conditions or groups */
    conditions: Array<FilterCondition | FilterGroup>;
}

/**
 * Complete filter configuration for a pipeline step
 */
export interface FilterConfig {
    /** Top-level conditions or groups */
    conditions: Array<FilterCondition | FilterGroup>;
    /** Default logical operator for top-level conditions */
    defaultLogic?: LogicalOperator;
    /** Action to take when filter matches (KEEP or DROP) */
    action?: FilterAction;
}

/**
 * Type guard to check if a value is a FilterGroup
 */
export function isFilterGroup(value: FilterCondition | FilterGroup): value is FilterGroup {
    return 'logic' in value && 'conditions' in value && Array.isArray((value as FilterGroup).conditions);
}

/**
 * Type guard to check if a value is a FilterCondition
 */
export function isFilterCondition(value: FilterCondition | FilterGroup): value is FilterCondition {
    return 'field' in value && 'operator' in value;
}
