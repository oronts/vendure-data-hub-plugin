export * from './types';
export * from './helpers';
export * from './enrichment.operators';

import {
    LOOKUP_OPERATOR_DEFINITION,
    ENRICH_OPERATOR_DEFINITION,
    COALESCE_OPERATOR_DEFINITION,
    DEFAULT_OPERATOR_DEFINITION,
} from './enrichment.operators';
import { AdapterDefinition } from '../types';

export const ENRICHMENT_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    LOOKUP_OPERATOR_DEFINITION,
    ENRICH_OPERATOR_DEFINITION,
    COALESCE_OPERATOR_DEFINITION,
    DEFAULT_OPERATOR_DEFINITION,
];
