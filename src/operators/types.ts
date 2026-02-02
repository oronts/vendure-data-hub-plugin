/**
 * Operator Types
 */

import { RouteConditionOperator } from '../constants/index';

export {
    OperatorResult,
    OperatorError,
    BaseOperatorConfig,
    FieldPathConfig,
    OperatorCondition,
    SingleRecordOperatorFn,
    BatchOperatorFn,
    ComparisonOperator as SharedComparisonOperator,
} from '../../shared/types';

/**
 * Extended comparison operator including route conditions
 *
 * Uses standardized operator names:
 * - 'ne' for not-equal (aligned with RouteConditionOperator)
 * - 'notIn' for not-in-array (aligned with RouteConditionOperator)
 */
export type ComparisonOperator =
    | RouteConditionOperator
    | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
    | 'in' | 'notIn' | 'contains' | 'notContains'
    | 'startsWith' | 'endsWith' | 'regex' | 'matches'
    | 'exists' | 'notExists' | 'isNull' | 'isNotNull'
    | 'isEmpty' | 'isNotEmpty' | 'between';

export { RouteConditionOperator } from '../constants/index';
export type { AdapterDefinition, OperatorHelpers } from '../sdk/types';
export type { JsonValue, JsonObject } from '../types';
