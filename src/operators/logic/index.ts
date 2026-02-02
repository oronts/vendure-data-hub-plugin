export * from './types';
export * from './helpers';
export {
    WHEN_OPERATOR_DEFINITION,
    IF_THEN_ELSE_OPERATOR_DEFINITION,
    SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION,
    whenOperator,
    ifThenElseOperator,
    switchOperator,
    deltaFilterOperator,
} from './logic.operators';

import {
    WHEN_OPERATOR_DEFINITION,
    IF_THEN_ELSE_OPERATOR_DEFINITION,
    SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION,
} from './logic.operators';
import { AdapterDefinition } from '../types';

export const LOGIC_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    WHEN_OPERATOR_DEFINITION,
    IF_THEN_ELSE_OPERATOR_DEFINITION,
    SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION,
];
