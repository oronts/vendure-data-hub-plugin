/**
 * Operator Types
 */

import { RouteConditionOperator } from '../constants/index';
import type { ComparisonOperator as SharedComparisonOperator } from '../../shared/types';

export {
    OperatorResult,
    OperatorError,
    BaseOperatorConfig,
    FieldPathConfig,
    OperatorCondition,
    SingleRecordOperatorFn,
    BatchOperatorFn,
} from '../../shared/types';

/**
 * Extended comparison operator including route conditions.
 * Superset of SharedComparisonOperator with negation/emptiness/between operators.
 *
 * Uses standardized operator names:
 * - 'ne' for not-equal (aligned with RouteConditionOperator)
 * - 'notIn' for not-in-array (aligned with RouteConditionOperator)
 *
 * @see shared/types/operator.types.ts — base ComparisonOperator (subset)
 * @see src/constants/enums.ts — RouteConditionOperator enum
 */
export type ComparisonOperator =
    | SharedComparisonOperator
    | RouteConditionOperator
    | 'notExists' | 'isNotNull'
    | 'isEmpty' | 'isNotEmpty' | 'between';

export type { AdapterDefinition, AdapterOperatorHelpers } from '../sdk/types';
export type { JsonValue, JsonObject } from '../types';
