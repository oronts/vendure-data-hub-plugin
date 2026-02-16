import { JsonValue } from '../../types/index';
import { RouteConditionConfig } from './step-configs';
import { ROUTE_OPERATOR } from '../constants';
import { validateNonEmptyString, validateNonEmptyArray } from './validation-helpers';

export const conditions = {
    /** `conditions.eq('status', 'active')` */
    eq(field: string, value: JsonValue): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EQ, value };
    },

    /** `conditions.ne('status', 'deleted')` */
    ne(field: string, value: JsonValue): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.NE, value };
    },

    /** `conditions.gt('price', 100)` */
    gt(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.GT, value };
    },

    /** `conditions.lt('quantity', 10)` */
    lt(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.LT, value };
    },

    /** `conditions.gte('stock', 0)` */
    gte(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.GTE, value };
    },

    /** `conditions.lte('discount', 50)` */
    lte(field: string, value: number): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.LTE, value };
    },

    /** `conditions.in('category', ['electronics', 'computers'])` */
    in(field: string, values: JsonValue[]): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyArray(values, 'Values');
        return { field, cmp: ROUTE_OPERATOR.IN, value: values };
    },

    /** `conditions.notIn('status', ['deleted', 'archived'])` */
    notIn(field: string, values: JsonValue[]): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyArray(values, 'Values');
        return { field, cmp: ROUTE_OPERATOR.NOT_IN, value: values };
    },

    /** `conditions.contains('description', 'premium')` */
    contains(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.CONTAINS, value };
    },

    /** `conditions.notContains('name', 'test')` */
    notContains(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.NOT_CONTAINS, value };
    },

    /** `conditions.startsWith('sku', 'PRD-')` */
    startsWith(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.STARTS_WITH, value };
    },

    /** `conditions.endsWith('email', '@company.com')` */
    endsWith(field: string, value: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(value, 'Value');
        return { field, cmp: ROUTE_OPERATOR.ENDS_WITH, value };
    },

    /** `conditions.matches('code', 'A*-123')` */
    matches(field: string, pattern: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        return { field, cmp: ROUTE_OPERATOR.MATCHES, value: pattern };
    },

    /** `conditions.regex('phone', '^\\+1[0-9]{10}$')` */
    regex(field: string, pattern: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        return { field, cmp: ROUTE_OPERATOR.REGEX, value: pattern };
    },

    /** `conditions.exists('metadata.customField')` */
    exists(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EXISTS, value: true };
    },

    /** `conditions.notExists('legacyField')` */
    notExists(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.EXISTS, value: false };
    },

    /** `conditions.isNull('deletedAt')` */
    isNull(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.IS_NULL, value: true };
    },

    /** `conditions.notNull('publishedAt')` */
    notNull(field: string): RouteConditionConfig {
        validateNonEmptyString(field, 'Field');
        return { field, cmp: ROUTE_OPERATOR.IS_NULL, value: false };
    },
};
