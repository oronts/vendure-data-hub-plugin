/**
 * Route Condition Builders
 *
 * Provides fluent builder functions for creating route conditions
 * used in pipeline route steps and operator filters. All conditions
 * use constants from `../constants.ts` for type safety.
 *
 * @module sdk/dsl/route-builder
 *
 * @example
 * ```typescript
 * import { conditions } from '@vendure/data-hub/sdk';
 *
 * const pipeline = createPipeline()
 *   .route('by-category', {
 *     branches: [
 *       { name: 'electronics', when: [conditions.eq('category', 'electronics')] },
 *       { name: 'clothing', when: [conditions.in('category', ['apparel', 'shoes'])] },
 *     ],
 *     defaultTo: 'other',
 *   })
 *   .build();
 * ```
 */

import { JsonValue } from '../../types/index';
import { RouteConditionConfig } from './step-configs';
import { ROUTE_OPERATOR } from '../constants';

// VALIDATION HELPERS

/**
 * Validates that a string is non-empty.
 * @throws Error if the string is empty or whitespace-only
 */
function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

/**
 * Validates that an array is non-empty.
 * @throws Error if the array is empty
 */
function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(`${fieldName} must be a non-empty array`);
    }
}

/**
 * Condition builder functions for creating route step configurations.
 * Each function returns a RouteConditionConfig that can be used in route branches
 * or operator filter conditions.
 */
export const conditions = {
    /**
     * Equal comparison.
     *
     * @param field - Field path to compare
     * @param value - Value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.eq('status', 'active')
     */
    eq(field: string, value: JsonValue): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EQ, value };
    },

    /**
     * Not equal comparison.
     *
     * @param field - Field path to compare
     * @param value - Value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.ne('status', 'deleted')
     */
    ne(field: string, value: JsonValue): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.NE, value };
    },

    /**
     * Greater than comparison.
     *
     * @param field - Field path to compare
     * @param value - Numeric value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.gt('price', 100)
     */
    gt(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.GT, value };
    },

    /**
     * Less than comparison.
     *
     * @param field - Field path to compare
     * @param value - Numeric value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.lt('quantity', 10)
     */
    lt(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.LT, value };
    },

    /**
     * Greater than or equal comparison.
     *
     * @param field - Field path to compare
     * @param value - Numeric value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.gte('stock', 0)
     */
    gte(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.GTE, value };
    },

    /**
     * Less than or equal comparison.
     *
     * @param field - Field path to compare
     * @param value - Numeric value to compare against
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.lte('discount', 50)
     */
    lte(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.LTE, value };
    },

    /**
     * Check if value is in array.
     *
     * @param field - Field path to check
     * @param values - Array of values to check against
     * @returns RouteConditionConfig
     * @throws Error if field is empty or values array is empty
     *
     * @example
     * conditions.in('category', ['electronics', 'computers'])
     */
    in(field: string, values: JsonValue[]): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyArray(values, 'Values');
        return { field, cmp: ROUTE_OPERATOR.IN, value: values };
    },

    /**
     * Check if value is not in array.
     *
     * @param field - Field path to check
     * @param values - Array of values to check against
     * @returns RouteConditionConfig
     * @throws Error if field is empty or values array is empty
     *
     * @example
     * conditions.notIn('status', ['deleted', 'archived'])
     */
    notIn(field: string, values: JsonValue[]): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyArray(values, 'Values');
        return { field, cmp: ROUTE_OPERATOR.NOT_IN, value: values };
    },

    /**
     * Check if string contains substring.
     *
     * @param field - Field path to check
     * @param value - Substring to search for
     * @returns RouteConditionConfig
     * @throws Error if field or value is empty
     *
     * @example
     * conditions.contains('description', 'premium')
     */
    contains(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.CONTAINS, value };
    },

    /**
     * Check if string does not contain substring.
     *
     * @param field - Field path to check
     * @param value - Substring to search for
     * @returns RouteConditionConfig
     * @throws Error if field or value is empty
     *
     * @example
     * conditions.notContains('name', 'test')
     */
    notContains(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.NOT_CONTAINS, value };
    },

    /**
     * Check if string starts with prefix.
     *
     * @param field - Field path to check
     * @param value - Prefix to check for
     * @returns RouteConditionConfig
     * @throws Error if field or value is empty
     *
     * @example
     * conditions.startsWith('sku', 'PRD-')
     */
    startsWith(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.STARTS_WITH, value };
    },

    /**
     * Check if string ends with suffix.
     *
     * @param field - Field path to check
     * @param value - Suffix to check for
     * @returns RouteConditionConfig
     * @throws Error if field or value is empty
     *
     * @example
     * conditions.endsWith('email', '@company.com')
     */
    endsWith(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.ENDS_WITH, value };
    },

    /**
     * Check if string matches pattern.
     *
     * @param field - Field path to check
     * @param pattern - Pattern to match
     * @returns RouteConditionConfig
     * @throws Error if field or pattern is empty
     *
     * @example
     * conditions.matches('code', 'A*-123')
     */
    matches(field: string, pattern: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        return { field, cmp: ROUTE_OPERATOR.MATCHES, value: pattern };
    },

    /**
     * Check if string matches regex pattern.
     *
     * @param field - Field path to check
     * @param pattern - Regex pattern
     * @returns RouteConditionConfig
     * @throws Error if field or pattern is empty
     *
     * @example
     * conditions.regex('phone', '^\\+1[0-9]{10}$')
     */
    regex(field: string, pattern: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        return { field, cmp: ROUTE_OPERATOR.REGEX, value: pattern };
    },

    /**
     * Check if field exists (is defined).
     *
     * @param field - Field path to check
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.exists('metadata.customField')
     */
    exists(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EXISTS, value: true };
    },

    /**
     * Check if field does not exist (is undefined).
     *
     * @param field - Field path to check
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.notExists('legacyField')
     */
    notExists(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EXISTS, value: false };
    },

    /**
     * Check if field is null.
     *
     * @param field - Field path to check
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.isNull('deletedAt')
     */
    isNull(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.IS_NULL, value: true };
    },

    /**
     * Check if field is not null.
     *
     * @param field - Field path to check
     * @returns RouteConditionConfig
     * @throws Error if field is empty
     *
     * @example
     * conditions.notNull('publishedAt')
     */
    notNull(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.IS_NULL, value: false };
    },
};
