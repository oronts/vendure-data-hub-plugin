export * from './types';
export * from './helpers';
export * from './date.operators';

import {
    DATE_FORMAT_OPERATOR_DEFINITION,
    DATE_PARSE_OPERATOR_DEFINITION,
    DATE_ADD_OPERATOR_DEFINITION,
    DATE_DIFF_OPERATOR_DEFINITION,
    NOW_OPERATOR_DEFINITION,
} from './date.operators';
import { AdapterDefinition } from '../types';

export const DATE_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    DATE_FORMAT_OPERATOR_DEFINITION,
    DATE_PARSE_OPERATOR_DEFINITION,
    DATE_ADD_OPERATOR_DEFINITION,
    DATE_DIFF_OPERATOR_DEFINITION,
    NOW_OPERATOR_DEFINITION,
];
