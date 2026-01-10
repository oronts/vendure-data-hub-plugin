/**
 * Filter Types
 */

import { JsonValue } from '../common';

export type FilterOperator =
    | 'EQ'
    | 'NE'
    | 'GT'
    | 'GTE'
    | 'LT'
    | 'LTE'
    | 'IN'
    | 'NOT_IN'
    | 'CONTAINS'
    | 'NOT_CONTAINS'
    | 'STARTS_WITH'
    | 'ENDS_WITH'
    | 'MATCHES'
    | 'EXISTS'
    | 'NOT_EXISTS'
    | 'EMPTY'
    | 'NOT_EMPTY';

export interface FilterCondition {
    field: string;
    operator: FilterOperator;
    value?: JsonValue;
    logic?: 'AND' | 'OR';
    conditions?: FilterCondition[];
}
