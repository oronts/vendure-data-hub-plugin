import type { AdapterDefinition } from '../../../../sdk/types';
import { VendureEntityType } from '../../../../constants/enums';
import { screamingSnakeToKebab } from '../../../../../shared/utils/string-case';

export interface LoaderDefinitionRegistryEntry {
    definition: AdapterDefinition;
}

export type LoaderDefinitionEntry = [string, LoaderDefinitionRegistryEntry];

export const SKIP_DUPLICATES_FIELD = {
    key: 'skipDuplicates',
    label: 'Skip existing records on CREATE',
    type: 'boolean',
    defaultValue: false,
    description: 'When CREATE finds an existing record, skip it instead of failing the record.',
} as const;

export function toEntityCode(entityType: VendureEntityType): string {
    return screamingSnakeToKebab(entityType);
}
