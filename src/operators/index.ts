export * from './types';
export * from './helpers';
export * from './operator-runtime-registry';
export * from './data';
export { DATA_OPERATOR_DEFINITIONS } from './data';

export * from './string';
export { STRING_OPERATOR_DEFINITIONS } from './string';

export {
    WhenOperatorConfig,
    IfThenElseOperatorConfig,
    SwitchOperatorConfig,
    DeltaFilterOperatorConfig,
    SwitchCase,
    evaluateCondition,
    evaluateSwitch,
    filterRecords,
    applyIfThenElse,
    applySwitch,
    calculateRecordHash,
    WHEN_OPERATOR_DEFINITION,
    IF_THEN_ELSE_OPERATOR_DEFINITION,
    SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION,
    whenOperator,
    ifThenElseOperator,
    switchOperator,
    deltaFilterOperator,
    LOGIC_OPERATOR_DEFINITIONS,
} from './logic';

export * from './enrichment';
export { ENRICHMENT_OPERATOR_DEFINITIONS } from './enrichment';

export * from './aggregation';
export { AGGREGATION_OPERATOR_DEFINITIONS } from './aggregation';

export * from './numeric';
export { NUMERIC_OPERATOR_DEFINITIONS } from './numeric';

export * from './date';
export { DATE_OPERATOR_DEFINITIONS } from './date';

export * from './json';
export { JSON_OPERATOR_DEFINITIONS } from './json';

export * from './validation';
export { VALIDATION_OPERATOR_DEFINITIONS } from './validation';

export * from './script';
export { SCRIPT_OPERATOR_DEFINITION } from './script';

import { AdapterDefinition } from './types';
import { DATA_OPERATOR_DEFINITIONS } from './data';
import { STRING_OPERATOR_DEFINITIONS } from './string';
import { LOGIC_OPERATOR_DEFINITIONS } from './logic';
import { ENRICHMENT_OPERATOR_DEFINITIONS } from './enrichment';
import { AGGREGATION_OPERATOR_DEFINITIONS } from './aggregation';
import { NUMERIC_OPERATOR_DEFINITIONS } from './numeric';
import { DATE_OPERATOR_DEFINITIONS } from './date';
import { JSON_OPERATOR_DEFINITIONS } from './json';
import { VALIDATION_OPERATOR_DEFINITIONS } from './validation';
import { SCRIPT_OPERATOR_DEFINITION } from './script';

export const SCRIPT_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    SCRIPT_OPERATOR_DEFINITION,
];

export const ALL_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    ...DATA_OPERATOR_DEFINITIONS,
    ...STRING_OPERATOR_DEFINITIONS,
    ...LOGIC_OPERATOR_DEFINITIONS,
    ...ENRICHMENT_OPERATOR_DEFINITIONS,
    ...AGGREGATION_OPERATOR_DEFINITIONS,
    ...NUMERIC_OPERATOR_DEFINITIONS,
    ...DATE_OPERATOR_DEFINITIONS,
    ...JSON_OPERATOR_DEFINITIONS,
    ...VALIDATION_OPERATOR_DEFINITIONS,
    ...SCRIPT_OPERATOR_DEFINITIONS,
];

export const OPERATOR_DEFINITIONS_BY_CATEGORY = {
    data: DATA_OPERATOR_DEFINITIONS,
    string: STRING_OPERATOR_DEFINITIONS,
    logic: LOGIC_OPERATOR_DEFINITIONS,
    enrichment: ENRICHMENT_OPERATOR_DEFINITIONS,
    aggregation: AGGREGATION_OPERATOR_DEFINITIONS,
    numeric: NUMERIC_OPERATOR_DEFINITIONS,
    date: DATE_OPERATOR_DEFINITIONS,
    json: JSON_OPERATOR_DEFINITIONS,
    validation: VALIDATION_OPERATOR_DEFINITIONS,
    script: SCRIPT_OPERATOR_DEFINITIONS,
} as const;
