import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

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

export const FACET_LOADER_METADATA = {
    entityType: VendureEntityType.FACET,
    name: 'Facet Loader',
    description: 'Imports facets (attributes/properties) for product categorization',
    adapterCode: 'facetUpsert',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'id', 'name'],
    requiredFields: ['name', 'code'],
} as const;
