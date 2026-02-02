import { ID, Collection } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface CollectionFilterInput {
    /** Filter handler code */
    code: string;
    /** Arguments for the filter */
    args: Record<string, unknown>;
}

export interface CollectionInput extends InputRecord {
    /** Display name for the collection */
    name: string;
    /** URL-friendly identifier (auto-generated if not provided) */
    slug?: string;
    /** Collection description (HTML supported) */
    description?: string;
    /** Slug of parent collection (for hierarchy) */
    parentSlug?: string;
    /** ID of parent collection */
    parentId?: string;
    /** Sort order within parent (0 = first) */
    position?: number;
    /** Whether collection is hidden from customers */
    isPrivate?: boolean;
    /** URLs of images to attach */
    assetUrls?: string[];
    /** URL of the featured/main image */
    featuredAssetUrl?: string;
    /** Filter rules for automatic product assignment */
    filters?: CollectionFilterInput[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ConfigurableOperationInput {
    code: string;
    arguments: Array<{ name: string; value: string }>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Collection;
}

export const COLLECTION_LOADER_METADATA = {
    entityType: VendureEntityType.COLLECTION,
    name: 'Collection Loader',
    description: 'Imports collections/categories with hierarchical structure support',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['slug', 'id', 'name', 'customFields.externalId'],
    requiredFields: ['name'],
} as const;
