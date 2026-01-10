import { ID, Facet } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';

export interface FacetInput extends InputRecord {
    /** Display name for the facet (e.g., "Color", "Size", "Brand") */
    name: string;
    /** Unique identifier code (lowercase, no spaces) */
    code: string;
    /** If true, facet is not visible to customers */
    isPrivate?: boolean;
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Facet;
}

export const FACET_LOADER_METADATA = {
    entityType: 'Facet' as const,
    name: 'Facet Loader',
    description: 'Imports facets (attributes/properties) for product categorization',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'id', 'name'],
    requiredFields: ['name', 'code'],
} as const;
