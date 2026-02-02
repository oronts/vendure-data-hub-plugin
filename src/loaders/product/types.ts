import { ID, Product } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface ProductInput extends InputRecord {
    /** Display name for the product */
    name: string;
    /** URL-friendly identifier (auto-generated if not provided) */
    slug?: string;
    /** Product description (HTML supported) */
    description?: string;
    /** Whether the product is published */
    enabled?: boolean;
    /** Array of facet value codes to assign */
    facetValueCodes?: string[];
    /** URLs of images to attach */
    assetUrls?: string[];
    /** URL of the featured/main image */
    featuredAssetUrl?: string;
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Product;
}

export const PRODUCT_LOADER_METADATA = {
    entityType: VendureEntityType.PRODUCT,
    name: 'Product Loader',
    description: 'Imports products with slug-based lookup, facets, and assets',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['slug', 'id', 'customFields.externalId'],
    requiredFields: ['name'],
} as const;
