export * from './types';
export * from './helpers';
export * from './operator-runtime-registry';
export * from './data';
export * from './string';
export * from './logic';
export * from './enrichment';
export * from './aggregation';
export * from './numeric';
export * from './date';
export * from './json/json.operators';
export * from './validation';
export * from './script';
export * from './file';

import { AdapterDefinition } from './types';
import { OPERATOR_REGISTRY } from './operator-runtime-registry';
import type { OptionValue } from '../constants/enum-metadata';

/** Auto-derived from OPERATOR_REGISTRY -- no manual maintenance needed. */
export const ALL_OPERATOR_DEFINITIONS: AdapterDefinition[] = Object.values(OPERATOR_REGISTRY).map(
    entry => entry.definition,
);

/** Auto-derived from OPERATOR_REGISTRY: operators flagged as field transforms for the export wizard. */
export const FIELD_TRANSFORM_TYPES: OptionValue[] = Object.entries(OPERATOR_REGISTRY)
    .filter(([, entry]) => entry.definition.fieldTransform === true)
    .map(([code, entry]) => ({
        value: code,
        label: entry.definition.name ?? code.charAt(0).toUpperCase() + code.slice(1).replace(/([A-Z])/g, ' $1'),
        category: entry.definition.categoryLabel,
    }));
