export * from './types';
export * from './helpers';
export * from './map.operator';
export * from './set.operator';
export * from './remove.operator';
export * from './rename.operator';
export * from './copy.operator';
export * from './template.operator';
export * from './hash.operator';
export * from './uuid.operator';

import { MAP_OPERATOR_DEFINITION } from './map.operator';
import { SET_OPERATOR_DEFINITION } from './set.operator';
import { REMOVE_OPERATOR_DEFINITION } from './remove.operator';
import { RENAME_OPERATOR_DEFINITION } from './rename.operator';
import { COPY_OPERATOR_DEFINITION } from './copy.operator';
import { TEMPLATE_OPERATOR_DEFINITION } from './template.operator';
import { HASH_OPERATOR_DEFINITION } from './hash.operator';
import { UUID_OPERATOR_DEFINITION } from './uuid.operator';
import { AdapterDefinition } from '../types';

export const DATA_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    MAP_OPERATOR_DEFINITION,
    SET_OPERATOR_DEFINITION,
    REMOVE_OPERATOR_DEFINITION,
    RENAME_OPERATOR_DEFINITION,
    COPY_OPERATOR_DEFINITION,
    TEMPLATE_OPERATOR_DEFINITION,
    HASH_OPERATOR_DEFINITION,
    UUID_OPERATOR_DEFINITION,
];
