import { VendureEntityType } from "../../../../constants/enums";
import { LOAD_STRATEGY_OPTIONS } from "../../../../constants/adapter-schema-options";
import { LoaderDefinitionEntry, SKIP_DUPLICATES_FIELD, toEntityCode } from "./loader-registry.shared";

export const OPERATIONS_LOADER_DEFINITIONS: LoaderDefinitionEntry[] = [
    ['customerGroupUpsert', {
        definition: {
            type: 'LOADER',
            code: 'customerGroupUpsert',
            description: 'Upsert CustomerGroup by name; assign customers by email.',
            requires: ['UpdateCustomer'],
            icon: 'users',
            color: '#10b981',
            entityType: toEntityCode(VendureEntityType.CUSTOMER_GROUP),
            patchableFields: ['name', 'customerEmailAddresses', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    SKIP_DUPLICATES_FIELD,
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing unique customer group name' },
                    { key: 'customerEmailsField', label: 'Customer emails field', type: 'string', description: 'Field containing array of customer email addresses to add' },
                ],
            },
        },
    }],
    ['stockLocationUpsert', {
        definition: {
            type: 'LOADER',
            code: 'stockLocationUpsert',
            description: 'Upsert StockLocation by name; manage inventory locations and warehouses.',
            requires: ['UpdateCatalog'],
            icon: 'layers',
            color: '#0ea5e9',
            entityType: toEntityCode(VendureEntityType.STOCK_LOCATION),
            patchableFields: ['name', 'description', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    SKIP_DUPLICATES_FIELD,
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing stock location name' },
                    { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field containing location description' },
                ],
            },
        },
    }],
    ['inventoryAdjust', {
        definition: {
            type: 'LOADER',
            code: 'inventoryAdjust',
            description: 'Adjust stock levels for product variants by SKU. Supports stock location targeting.',
            requires: ['UpdateCatalog'],
            icon: 'layers',
            color: '#0ea5e9',
            entityType: toEntityCode(VendureEntityType.INVENTORY),
            patchableFields: ['sku', 'stockOnHand', 'stockByLocation'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    SKIP_DUPLICATES_FIELD,
                    { key: 'skuField', label: 'SKU field', type: 'string', required: true, description: 'Field containing the product variant SKU' },
                    { key: 'stockOnHandField', label: 'Stock on hand field', type: 'string', required: true, description: 'Field containing the new absolute stock level' },
                    { key: 'stockLocationNameField', label: 'Stock location name field', type: 'string', description: 'Field containing stock location name (uses the oldest location in the active channel if omitted)' },
                    { key: 'stockLocationIdField', label: 'Stock location ID field', type: 'string', description: 'Field containing stock location ID (alternative to name)' },
                    { key: 'reasonField', label: 'Reason field', type: 'string', description: 'Field containing the adjustment reason' },
                ],
            },
        },
    }],
    ['entityDeletion', {
        definition: {
            type: 'LOADER',
            code: 'entityDeletion',
            description: 'Delete entities (Product, Variant, Collection, Promotion, ShippingMethod, Customer, PaymentMethod, Facet, FacetValue, CustomerGroup, TaxRate, Asset, StockLocation) by slug, SKU, code, email, name, or ID.',
            requires: ['UpdateCatalog'],
            icon: 'trash-2',
            color: '#ef4444',
            entityType: toEntityCode(VendureEntityType.PRODUCT),
            patchableFields: ['slug', 'sku', 'id', 'code', 'email'],
            schema: {
                fields: [
                    { key: 'entityType', label: 'Entity type', type: 'select', options: [
                        { value: 'product', label: 'Product' },
                        { value: 'variant', label: 'Product Variant' },
                        { value: 'collection', label: 'Collection' },
                        { value: 'promotion', label: 'Promotion' },
                        { value: 'shipping-method', label: 'Shipping Method' },
                        { value: 'customer', label: 'Customer' },
                        { value: 'payment-method', label: 'Payment Method' },
                        { value: 'facet', label: 'Facet' },
                        { value: 'facet-value', label: 'Facet Value' },
                        { value: 'customer-group', label: 'Customer Group' },
                        { value: 'tax-rate', label: 'Tax Rate' },
                        { value: 'asset', label: 'Asset' },
                        { value: 'stock-location', label: 'Stock Location' },
                    ], description: 'Type of entity to delete (default: product)' },
                    { key: 'identifierField', label: 'Identifier field', type: 'string', description: 'Record field containing the identifier to match (default depends on entity type)' },
                    { key: 'matchBy', label: 'Match by', type: 'select', options: [
                        { value: 'slug', label: 'Slug' },
                        { value: 'sku', label: 'SKU' },
                        { value: 'id', label: 'ID' },
                        { value: 'code', label: 'Code' },
                        { value: 'email', label: 'Email' },
                        { value: 'name', label: 'Name' },
                    ], description: 'How to find the entity (default: slug for products, sku for variants, code for promotions/shipping methods, email for customers, name for groups/tax rates/assets/stock locations)' },
                    { key: 'cascadeVariants', label: 'Cascade delete variants', type: 'boolean', description: 'Delete all variants when deleting a product (default: true)' },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                ],
            },
        },
    }],
];
