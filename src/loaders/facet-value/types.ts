import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface FacetValueInput extends InputRecord {
    /** Display name for the facet value (e.g., "Red", "Large", "Nike") */
    name: string;
    /** Unique identifier code within the facet (lowercase, no spaces) */
    code: string;
    /** Code of the parent facet this value belongs to */
    facetCode: string;
    /** ID of the parent facet (alternative to facetCode) */
    facetId?: string | number;
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export const FACET_VALUE_LOADER_METADATA = {
    entityType: VendureEntityType.FACET_VALUE,
    name: 'Facet Value Loader',
    description: 'Imports facet values (attribute options) with parent facet resolution',
    adapterCode: 'facetValueUpsert',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'id'],
    requiredFields: ['name', 'code', 'facetCode'],
} as const;
