import type { EntityFieldSchema } from '../../types';
import { VendureEntityType } from '../../constants/enums';
import { ASSET_AND_CUSTOM_FIELD_SCHEMA_FIELDS } from '../shared-field-schemas';

export const PRODUCT_VARIANT_FIELD_SCHEMA: EntityFieldSchema = {
    entityType: VendureEntityType.PRODUCT_VARIANT,
    fields: [
        {
            key: 'sku',
            label: 'SKU',
            type: 'string',
            required: true,
            lookupable: true,
            description: 'Unique stock keeping unit',
            example: 'PROD-001-BLK-L',
        },
        {
            key: 'name',
            label: 'Variant Name',
            type: 'string',
            translatable: true,
            description: 'Display name for the variant',
        },
        {
            key: 'price',
            label: 'Price',
            type: 'number',
            required: true,
            description: 'Price in major units (e.g., 19.99)',
            example: 19.99,
        },
        {
            key: 'productName',
            label: 'Product Name',
            type: 'string',
            description: 'Name of the parent product (used to find or create it)',
        },
        {
            key: 'productSlug',
            label: 'Product Slug',
            type: 'string',
            description: 'Stable parent product slug',
        },
        {
            key: 'productId',
            label: 'Product ID',
            type: 'string',
            description: 'Stable parent product ID',
        },
        {
            key: 'stockOnHand',
            label: 'Stock On Hand',
            type: 'number',
            description: 'Stock quantity at Vendure’s default stock location',
            example: 100,
        },
        {
            key: 'trackInventory',
            label: 'Track Inventory',
            type: 'boolean',
            description: 'Whether to track stock levels',
        },
        {
            key: 'taxCategoryId',
            label: 'Tax Category ID',
            type: 'string',
            description: 'Stable Vendure TaxCategory ID',
        },
        {
            key: 'taxCategoryCode',
            label: 'Tax Category Code',
            type: 'string',
            description: 'Code stored in the TaxCategory customFields.code field',
        },
        {
            key: 'facetValueCodes',
            label: 'Facet Values',
            type: 'array',
            description: 'Array of facet value codes to assign',
            example: ['color-black', 'size-large'],
        },
        {
            key: 'optionCodes',
            label: 'Options',
            type: 'array',
            description: 'Exact Vendure ProductOption codes',
            example: ['black', 'large'],
        },
        ...ASSET_AND_CUSTOM_FIELD_SCHEMA_FIELDS,
    ],
};
