import { ID, ProductVariant } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface ProductVariantInput extends InputRecord {
    /** Stock keeping unit - primary identifier */
    sku: string;
    /** Display name for the variant */
    name?: string;
    /** Price in cents (e.g., 1999 = $19.99) */
    price: number;
    /** Name of the parent product (for auto-creation) */
    productName?: string;
    /** URL slug of the parent product */
    productSlug?: string;
    /** ID of the parent product */
    productId?: string;
    /** Available inventory quantity */
    stockOnHand?: number;
    /** Whether to track stock levels */
    trackInventory?: boolean;
    /** Tax category code or name */
    taxCategoryCode?: string;
    /** Array of facet value codes to assign */
    facetValueCodes?: string[];
    /** Array of product option codes */
    optionCodes?: string[];
    /** URLs of images to attach */
    assetUrls?: string[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: ProductVariant;
}

/**
 * Default product name used when auto-creating a product for orphan variants
 */
export const DEFAULT_PRODUCT_NAME = 'Imported Product';

export const PRODUCT_VARIANT_LOADER_METADATA = {
    entityType: VendureEntityType.PRODUCT_VARIANT,
    name: 'Product Variant Loader',
    description: 'Imports product variants with SKU-based lookup, prices, stock, and options',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['sku', 'id', 'customFields.externalId'],
    requiredFields: ['sku', 'price'],
} as const;
