import { JsonValue } from '../../types/index';
import { RouteConditionConfig } from './step-configs';

export type RouteConditionOp =
    | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
    | 'in' | 'notIn'
    | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'matches' | 'regex'
    | 'exists' | 'isNull';

export const conditions = {
    eq(field: string, value: JsonValue): RouteConditionConfig {
        return { field, cmp: 'eq', value };
    },
    ne(field: string, value: JsonValue): RouteConditionConfig {
        return { field, cmp: 'ne', value };
    },
    gt(field: string, value: number): RouteConditionConfig {
        return { field, cmp: 'gt', value };
    },
    lt(field: string, value: number): RouteConditionConfig {
        return { field, cmp: 'lt', value };
    },
    gte(field: string, value: number): RouteConditionConfig {
        return { field, cmp: 'gte', value };
    },
    lte(field: string, value: number): RouteConditionConfig {
        return { field, cmp: 'lte', value };
    },
    in(field: string, values: JsonValue[]): RouteConditionConfig {
        return { field, cmp: 'in', value: values };
    },
    notIn(field: string, values: JsonValue[]): RouteConditionConfig {
        return { field, cmp: 'notIn', value: values };
    },
    contains(field: string, value: string): RouteConditionConfig {
        return { field, cmp: 'contains', value };
    },
    notContains(field: string, value: string): RouteConditionConfig {
        return { field, cmp: 'notContains', value };
    },
    startsWith(field: string, value: string): RouteConditionConfig {
        return { field, cmp: 'startsWith', value };
    },
    endsWith(field: string, value: string): RouteConditionConfig {
        return { field, cmp: 'endsWith', value };
    },
    matches(field: string, pattern: string): RouteConditionConfig {
        return { field, cmp: 'matches', value: pattern };
    },
    regex(field: string, pattern: string): RouteConditionConfig {
        return { field, cmp: 'regex', value: pattern };
    },
    exists(field: string): RouteConditionConfig {
        return { field, cmp: 'exists', value: true };
    },
    notExists(field: string): RouteConditionConfig {
        return { field, cmp: 'exists', value: false };
    },
    isNull(field: string): RouteConditionConfig {
        return { field, cmp: 'isNull', value: true };
    },
    notNull(field: string): RouteConditionConfig {
        return { field, cmp: 'isNull', value: false };
    },
};
