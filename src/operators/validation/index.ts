export * from './types';
export * from './helpers';
export * from './validation.operators';

import {
    VALIDATE_REQUIRED_OPERATOR_DEFINITION,
    VALIDATE_FORMAT_OPERATOR_DEFINITION,
} from './validation.operators';
import { AdapterDefinition } from '../types';

export const VALIDATION_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    VALIDATE_REQUIRED_OPERATOR_DEFINITION,
    VALIDATE_FORMAT_OPERATOR_DEFINITION,
];
