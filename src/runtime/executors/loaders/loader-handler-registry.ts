/**
 * Loader Handler Registry
 *
 * Single source of truth for loader adapter definitions AND handler classes.
 * Adding a new loader requires only:
 * 1. Create the handler file in this directory
 * 2. Add its entry to LOADER_HANDLER_REGISTRY below
 *
 * The plugin providers array, load.executor.ts, BUILTIN_ADAPTERS, and
 * LOADER_CODE constants all derive from this registry automatically.
 */
import { Type } from '@vendure/core';
import { AdapterDefinition } from '../../../sdk/types';
import { VendureEntityType } from '../../../constants/enums';
import { screamingSnakeToKebab } from '../../../../shared/utils/string-case';
import {
    LOAD_STRATEGY_OPTIONS,
    CONFLICT_RESOLUTION_OPTIONS,
    BOOLEAN_SELECT_OPTIONS,
    HTTP_METHOD_WRITE_OPTIONS,
    AUTH_TYPE_REST_OPTIONS,
    AUTH_TYPE_GRAPHQL_OPTIONS,
    BATCH_MODE_REST_OPTIONS,
    BATCH_MODE_GRAPHQL_OPTIONS,
    GROUPS_MODE_OPTIONS,
    ASSET_ENTITY_TYPE_OPTIONS,
} from '../../../constants/adapter-schema-options';
import { LoaderHandler } from './types';
import { ProductHandler } from './product-handler';
import { VariantHandler } from './variant-handler';
import { CustomerHandler } from './customer-handler';
import { OrderNoteHandler, ApplyCouponHandler, OrderTransitionHandler } from './order-handler';
import { StockAdjustHandler } from './inventory-handler';
import { CollectionHandler } from './collection-handler';
import { PromotionHandler } from './promotion-handler';
import { AssetAttachHandler } from './asset-handler';
import { AssetImportHandler } from './asset-import-handler';
import { FacetHandler, FacetValueHandler } from './facet-handler';
import { RestPostHandler } from './rest-handler';
import { GraphqlMutationHandler } from './graphql-mutation-handler';
import { TaxRateHandler } from './tax-rate-handler';
import { PaymentMethodHandler } from './payment-method-handler';
import { ChannelHandler } from './channel-handler';
import { ShippingMethodHandler } from './shipping-method-handler';
import { CustomerGroupHandler } from './customer-group-handler';
import { StockLocationHandler } from './stock-location-handler';
import { InventoryAdjustHandler } from './inventory-adjust-handler';

/**
 * Registry entry carrying both the handler class and its adapter definition.
 */
interface LoaderRegistryEntry {
    handler: Type<LoaderHandler>;
    definition: AdapterDefinition;
}

/**
 * Convert a VendureEntityType enum value to the kebab-case entity code
 * used by the frontend (e.g., PRODUCT_VARIANT -> 'product-variant').
 */
function toEntityCode(entityType: VendureEntityType): string {
    return screamingSnakeToKebab(entityType);
}

/**
 * Maps each loader code to its corresponding handler class and adapter definition.
 * Used by LoadExecutor for dispatch, DataHubPlugin for provider registration,
 * and BUILTIN_ADAPTERS for UI rendering.
 */
export const LOADER_HANDLER_REGISTRY = new Map<string, LoaderRegistryEntry>([
    ['productUpsert', {
        handler: ProductHandler,
        definition: {
            type: 'LOADER',
            code: 'productUpsert',
            description: 'Upsert Products and default Variants by slug/SKU. Supports channel, multi-currency prices, tax category, stock and inventory flags.',
            requires: ['UpdateCatalog'],
            icon: 'box',
            color: '#6366f1',
            entityType: toEntityCode(VendureEntityType.PRODUCT),
            patchableFields: ['slug', 'name', 'description', 'sku', 'price', 'priceByCurrency', 'stockOnHand', 'trackInventory', 'enabled', 'customFields'],
            schema: {
                fields: [
                    { key: 'channel', label: 'Channel code', type: 'string', required: true },
                    { key: 'strategy', label: 'Load strategy', type: 'select', required: true, options: LOAD_STRATEGY_OPTIONS },
                    { key: 'conflictStrategy', label: 'Conflict strategy', type: 'select', required: true, options: CONFLICT_RESOLUTION_OPTIONS },
                    { key: 'nameField', label: 'Name field (from record)', type: 'string' },
                    { key: 'slugField', label: 'Slug field (from record)', type: 'string' },
                    { key: 'descriptionField', label: 'Description field (from record)', type: 'string' },
                    { key: 'enabledField', label: 'Enabled field (from record)', type: 'string', description: 'Record field containing product enabled/published flag (defaults to "enabled")' },
                    { key: 'skuField', label: 'SKU field (from record)', type: 'string' },
                    { key: 'priceField', label: 'Price field (from record)', type: 'string' },
                    { key: 'taxCategoryName', label: 'Tax category name', type: 'string' },
                    { key: 'trackInventory', label: 'Track inventory', type: 'select', options: BOOLEAN_SELECT_OPTIONS },
                    { key: 'stockField', label: 'Stock on hand field', type: 'string' },
                    { key: 'stockByLocationField', label: 'Stock by location field (object)', type: 'string' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                    { key: 'createVariants', label: 'Create variants', type: 'boolean', description: 'Create/update a default variant alongside the product. Set to false when variants are handled by a separate variantUpsert step.' },
                ],
            },
        },
    }],
    ['variantUpsert', {
        handler: VariantHandler,
        definition: {
            type: 'LOADER',
            code: 'variantUpsert',
            description: 'Upsert ProductVariant by SKU. Supports create/update/upsert strategy, channel, prices, stock, tax, option groups, and custom fields. For creation, record must contain productSlug, productId, or productName to resolve the parent product.',
            requires: ['UpdateCatalog'],
            icon: 'package',
            color: '#14b8a6',
            entityType: toEntityCode(VendureEntityType.PRODUCT_VARIANT),
            patchableFields: ['sku', 'name', 'price', 'priceByCurrency', 'stockOnHand', 'optionGroups', 'optionIds', 'optionCodes', 'customFields'],
            schema: {
                fields: [
                    { key: 'channel', label: 'Channel code', type: 'string' },
                    { key: 'strategy', label: 'Load strategy', type: 'select', required: true, options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'skuField', label: 'SKU field (from record)', type: 'string', required: true },
                    { key: 'nameField', label: 'Name field (from record)', type: 'string' },
                    { key: 'priceField', label: 'Price field (from record)', type: 'string' },
                    { key: 'priceByCurrencyField', label: 'Price map field (object)', type: 'string' },
                    { key: 'taxCategoryName', label: 'Tax category name', type: 'string' },
                    { key: 'stockField', label: 'Stock on hand field', type: 'string' },
                    { key: 'stockByLocationField', label: 'Stock by location field (object)', type: 'string' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                    { key: 'optionGroupsField', label: 'Option groups field (object)', type: 'string', description: 'Record field containing option group→value pairs (e.g. { size: "S", color: "Blue" }). Auto-creates option groups and assigns to product.' },
                    { key: 'optionIdsField', label: 'Option IDs field (array)', type: 'string', description: 'Record field containing pre-existing Vendure option IDs (e.g. [1, 2, 3]). Passed directly without lookup.' },
                    { key: 'optionCodesField', label: 'Option codes field (array)', type: 'string', description: 'Record field containing option codes (e.g. ["size-s", "color-blue"]). Resolved to IDs by code lookup.' },
                ],
            },
        },
    }],
    ['customerUpsert', {
        handler: CustomerHandler,
        definition: {
            type: 'LOADER',
            code: 'customerUpsert',
            description: 'Upsert Customer by email or externalId; merge addresses; assign groups.',
            requires: ['UpdateCustomer'],
            icon: 'users',
            color: '#10b981',
            entityType: toEntityCode(VendureEntityType.CUSTOMER),
            patchableFields: ['email', 'firstName', 'lastName', 'phoneNumber', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'emailField', label: 'Email field', type: 'string', required: true },
                    { key: 'firstNameField', label: 'First name field', type: 'string' },
                    { key: 'lastNameField', label: 'Last name field', type: 'string' },
                    { key: 'phoneNumberField', label: 'Phone number field', type: 'string' },
                    { key: 'addressesField', label: 'Addresses array field', type: 'string' },
                    { key: 'groupsField', label: 'Group codes array field', type: 'string' },
                    { key: 'groupsMode', label: 'Groups mode', type: 'select', options: GROUPS_MODE_OPTIONS },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                ],
            },
        },
    }],
    ['orderNote', {
        handler: OrderNoteHandler,
        definition: {
            type: 'LOADER',
            code: 'orderNote',
            description: 'Attach a note to an Order by code or id.',
            requires: ['UpdateOrder'],
            icon: 'shopping-cart',
            color: '#f97316',
            entityType: toEntityCode(VendureEntityType.ORDER),
            patchableFields: ['orderId', 'orderCode', 'note', 'isPrivate'],
            schema: {
                fields: [
                    { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                    { key: 'orderIdField', label: 'Order id field', type: 'string' },
                    { key: 'noteField', label: 'Note text field', type: 'string', required: true },
                    { key: 'isPrivate', label: 'Private note', type: 'boolean' },
                ],
            },
        },
    }],
    ['stockAdjust', {
        handler: StockAdjustHandler,
        definition: {
            type: 'LOADER',
            code: 'stockAdjust',
            description: 'Adjust stock levels by SKU and stock location code map.',
            requires: ['UpdateCatalog'],
            icon: 'layers',
            color: '#0ea5e9',
            entityType: toEntityCode(VendureEntityType.INVENTORY),
            patchableFields: ['sku', 'stockByLocation'],
            schema: {
                fields: [
                    { key: 'skuField', label: 'SKU field', type: 'string', required: true },
                    { key: 'stockByLocationField', label: 'Stock by location map (code->qty)', type: 'string', required: true },
                    { key: 'absolute', label: 'Set absolute (else delta)', type: 'boolean' },
                ],
            },
        },
    }],
    ['applyCoupon', {
        handler: ApplyCouponHandler,
        definition: {
            type: 'LOADER',
            code: 'applyCoupon',
            description: 'Apply a coupon code to an Order by id/code.',
            requires: ['UpdateOrder'],
            icon: 'shopping-cart',
            color: '#f97316',
            entityType: toEntityCode(VendureEntityType.ORDER),
            patchableFields: ['orderId', 'orderCode', 'coupon'],
            schema: {
                fields: [
                    { key: 'orderIdField', label: 'Order id field', type: 'string' },
                    { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                    { key: 'couponField', label: 'Coupon code field', type: 'string', required: true },
                ],
            },
        },
    }],
    ['collectionUpsert', {
        handler: CollectionHandler,
        definition: {
            type: 'LOADER',
            code: 'collectionUpsert',
            description: 'Upsert Collection by slug/code; supports create/update/upsert strategy, channel, and custom fields.',
            requires: ['UpdateCatalog'],
            icon: 'layers',
            color: '#8b5cf6',
            entityType: toEntityCode(VendureEntityType.COLLECTION),
            patchableFields: ['slug', 'name', 'description', 'parentSlug', 'customFields'],
            schema: {
                fields: [
                    { key: 'channel', label: 'Channel code', type: 'string' },
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'slugField', label: 'Slug field', type: 'string', required: true },
                    { key: 'nameField', label: 'Name field', type: 'string', required: true },
                    { key: 'parentSlugField', label: 'Parent slug field', type: 'string' },
                    { key: 'descriptionField', label: 'Description field', type: 'string' },
                    { key: 'applyFilters', label: 'Apply filters job', type: 'boolean' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                ],
            },
        },
    }],
    ['promotionUpsert', {
        handler: PromotionHandler,
        definition: {
            type: 'LOADER',
            code: 'promotionUpsert',
            description: 'Upsert Promotion by couponCode; create/update enabled dates/actions/conditions. Supports custom fields.',
            requires: ['UpdatePromotion'],
            icon: 'zap',
            color: '#ec4899',
            entityType: toEntityCode(VendureEntityType.PROMOTION),
            patchableFields: ['code', 'name', 'enabled', 'startsAt', 'endsAt', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'codeField', label: 'Coupon code field', type: 'string', required: true },
                    { key: 'nameField', label: 'Name field', type: 'string' },
                    { key: 'enabledField', label: 'Enabled field', type: 'string' },
                    { key: 'startsAtField', label: 'Starts at field', type: 'string' },
                    { key: 'endsAtField', label: 'Ends at field', type: 'string' },
                    { key: 'conditionsField', label: 'Conditions field (JSON)', type: 'string' },
                    { key: 'actionsField', label: 'Actions field (JSON)', type: 'string' },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                ],
            },
        },
    }],
    ['orderTransition', {
        handler: OrderTransitionHandler,
        definition: {
            type: 'LOADER',
            code: 'orderTransition',
            description: 'Transition an order to a new state by id/code.',
            requires: ['UpdateOrder'],
            icon: 'shopping-cart',
            color: '#f97316',
            entityType: toEntityCode(VendureEntityType.ORDER),
            patchableFields: ['orderId', 'orderCode', 'state', 'note'],
            schema: {
                fields: [
                    { key: 'orderIdField', label: 'Order id field', type: 'string' },
                    { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                    { key: 'state', label: 'Target state', type: 'string', required: true },
                ],
            },
        },
    }],
    ['assetAttach', {
        handler: AssetAttachHandler,
        definition: {
            type: 'LOADER',
            code: 'assetAttach',
            description: 'Attach existing Asset (by id) as featured asset to a Product/Collection by slug.',
            requires: ['UpdateCatalog'],
            icon: 'file',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.ASSET),
            patchableFields: ['source', 'name', 'description', 'focalPoint'],
            schema: {
                fields: [
                    { key: 'entity', label: 'Entity type', type: 'select', required: true, options: ASSET_ENTITY_TYPE_OPTIONS },
                    { key: 'slugField', label: 'Slug field', type: 'string', required: true },
                    { key: 'assetIdField', label: 'Asset ID field', type: 'string', required: true },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                ],
            },
        },
    }],
    ['assetImport', {
        handler: AssetImportHandler,
        definition: {
            type: 'LOADER',
            code: 'assetImport',
            description: 'Import Asset from URL. Downloads file and creates asset in Vendure.',
            requires: ['UpdateCatalog'],
            icon: 'download',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.ASSET),
            patchableFields: ['source', 'name', 'description', 'focalPoint'],
            schema: {
                fields: [
                    { key: 'sourceUrlField', label: 'Source URL field', type: 'string', required: true },
                    { key: 'filenameField', label: 'Filename field', type: 'string' },
                    { key: 'nameField', label: 'Name field', type: 'string' },
                    { key: 'tagsField', label: 'Tags field (array)', type: 'string' },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                ],
            },
        },
    }],
    ['facetUpsert', {
        handler: FacetHandler,
        definition: {
            type: 'LOADER',
            code: 'facetUpsert',
            description: 'Upsert Facet by code; create or update facet. Supports custom fields.',
            requires: ['UpdateCatalog'],
            icon: 'filter',
            color: '#3b82f6',
            entityType: toEntityCode(VendureEntityType.FACET),
            patchableFields: ['code', 'name', 'translations', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'codeField', label: 'Code field', type: 'string', required: true },
                    { key: 'nameField', label: 'Name field', type: 'string', required: true },
                    { key: 'privateField', label: 'Private field', type: 'string' },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                ],
            },
        },
    }],
    ['facetValueUpsert', {
        handler: FacetValueHandler,
        definition: {
            type: 'LOADER',
            code: 'facetValueUpsert',
            description: 'Upsert FacetValue by code; requires facet to exist. Supports custom fields.',
            requires: ['UpdateCatalog'],
            icon: 'filter',
            color: '#3b82f6',
            entityType: toEntityCode(VendureEntityType.FACET_VALUE),
            patchableFields: ['code', 'name', 'facetCode', 'translations', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'facetCodeField', label: 'Facet code field', type: 'string', required: true },
                    { key: 'codeField', label: 'Value code field', type: 'string', required: true },
                    { key: 'nameField', label: 'Value name field', type: 'string', required: true },
                    { key: 'channel', label: 'Channel code', type: 'string' },
                    { key: 'customFieldsField', label: 'Custom fields field (object)', type: 'string', description: 'Record field containing custom field values (defaults to "customFields")' },
                ],
            },
        },
    }],
    ['restPost', {
        handler: RestPostHandler,
        definition: {
            type: 'LOADER',
            code: 'restPost',
            description: 'POST/PUT records to an external REST endpoint. Supports auth and per-record POST or array batch.',
            requires: ['UpdateDataHubSettings'],
            icon: 'globe',
            color: '#8b5cf6',
            patchableFields: ['*'],
            schema: {
                fields: [
                    { key: 'endpoint', label: 'Endpoint', type: 'string', required: true },
                    { key: 'method', label: 'Method', type: 'select', required: true, options: HTTP_METHOD_WRITE_OPTIONS },
                    { key: 'headers', label: 'Headers (JSON)', type: 'json' },
                    { key: 'auth', label: 'Auth preset', type: 'select', options: AUTH_TYPE_REST_OPTIONS },
                    { key: 'bearerTokenSecretCode', label: 'Bearer token secret code', type: 'string' },
                    { key: 'basicSecretCode', label: 'Basic auth secret code', type: 'string' },
                    { key: 'hmacSecretCode', label: 'HMAC secret code', type: 'string' },
                    { key: 'hmacHeader', label: 'HMAC header name', type: 'string' },
                    { key: 'hmacPayloadTemplate', label: 'HMAC payload template', type: 'string', description: 'e.g. ${method}:${path}:${timestamp}' },
                    { key: 'batchMode', label: 'Batch mode', type: 'select', options: BATCH_MODE_REST_OPTIONS },
                    { key: 'maxBatchSize', label: 'Max batch size (array mode)', type: 'number', description: 'Chunk size when batchMode=array' },
                    { key: 'retries', label: 'Retries', type: 'number', description: 'Number of retries for failed requests' },
                    { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number', description: 'Delay between retries' },
                    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', description: 'Request timeout in milliseconds' },
                ],
            },
        },
    }],
    ['graphqlMutation', {
        handler: GraphqlMutationHandler,
        definition: {
            type: 'LOADER',
            code: 'graphqlMutation',
            description: 'Send records as GraphQL mutations to an external API endpoint. Supports variable mapping, auth, batching, and retries.',
            requires: ['UpdateDataHubSettings'],
            icon: 'code',
            color: '#e11d48',
            patchableFields: ['*'],
            schema: {
                fields: [
                    { key: 'endpoint', label: 'Endpoint URL', type: 'string', required: true },
                    { key: 'mutation', label: 'GraphQL mutation', type: 'code', required: true, description: 'The GraphQL mutation string (e.g. mutation CreateProduct($input: ProductInput!) { createProduct(input: $input) { id } })' },
                    { key: 'variableMapping', label: 'Variable mapping (JSON)', type: 'json', required: true, description: 'Maps GraphQL variable paths to record field paths (e.g. {"input.name": "productName", "input.sku": "sku"})' },
                    { key: 'headers', label: 'Headers (JSON)', type: 'json' },
                    { key: 'auth', label: 'Auth preset', type: 'select', options: AUTH_TYPE_GRAPHQL_OPTIONS },
                    { key: 'bearerTokenSecretCode', label: 'Bearer token secret code', type: 'string' },
                    { key: 'basicSecretCode', label: 'Basic auth secret code', type: 'string' },
                    { key: 'batchMode', label: 'Batch mode', type: 'select', options: BATCH_MODE_GRAPHQL_OPTIONS },
                    { key: 'maxBatchSize', label: 'Max batch size', type: 'number', description: 'Chunk size when batchMode=batch' },
                    { key: 'retries', label: 'Retries', type: 'number', description: 'Number of retries for failed requests' },
                    { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number', description: 'Delay between retries' },
                    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', description: 'Request timeout in milliseconds' },
                ],
            },
        },
    }],
    ['taxRateUpsert', {
        handler: TaxRateHandler,
        definition: {
            type: 'LOADER',
            code: 'taxRateUpsert',
            description: 'Upsert TaxRate by name; resolves tax category and zone by code.',
            requires: ['UpdateSettings'],
            icon: 'settings',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.TAX_RATE),
            patchableFields: ['name', 'value', 'enabled', 'taxCategoryCode', 'zoneCode', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing tax rate name' },
                    { key: 'valueField', label: 'Value field', type: 'string', required: true, description: 'Field containing tax rate percentage (0-100)' },
                    { key: 'enabledField', label: 'Enabled field', type: 'string', description: 'Field indicating if rate is active' },
                    { key: 'taxCategoryCodeField', label: 'Tax category code field', type: 'string', required: true, description: 'Field containing tax category code/name' },
                    { key: 'taxCategoryIdField', label: 'Tax category ID field', type: 'string', description: 'Alternative: field containing tax category ID' },
                    { key: 'zoneCodeField', label: 'Zone code field', type: 'string', required: true, description: 'Field containing zone code/name' },
                    { key: 'zoneIdField', label: 'Zone ID field', type: 'string', description: 'Alternative: field containing zone ID' },
                ],
            },
        },
    }],
    ['paymentMethodUpsert', {
        handler: PaymentMethodHandler,
        definition: {
            type: 'LOADER',
            code: 'paymentMethodUpsert',
            description: 'Upsert PaymentMethod by code; configure handler and eligibility checker.',
            requires: ['UpdateSettings'],
            icon: 'settings',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.PAYMENT_METHOD),
            patchableFields: ['name', 'code', 'description', 'enabled', 'handler', 'checker', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing payment method name' },
                    { key: 'codeField', label: 'Code field', type: 'string', required: true, description: 'Field containing unique payment method code' },
                    { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field containing description shown to customers' },
                    { key: 'enabledField', label: 'Enabled field', type: 'string', description: 'Field indicating if method is active' },
                    { key: 'handlerField', label: 'Handler field', type: 'string', required: true, description: 'Field containing handler config { code, args }' },
                    { key: 'checkerField', label: 'Checker field', type: 'string', description: 'Field containing eligibility checker config { code, args }' },
                ],
            },
        },
    }],
    ['channelUpsert', {
        handler: ChannelHandler,
        definition: {
            type: 'LOADER',
            code: 'channelUpsert',
            description: 'Upsert Channel by code; configure currencies, languages, and zones.',
            requires: ['UpdateSettings'],
            icon: 'settings',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.CHANNEL),
            patchableFields: ['code', 'token', 'defaultLanguageCode', 'defaultCurrencyCode', 'pricesIncludeTax', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'codeField', label: 'Code field', type: 'string', required: true, description: 'Field containing unique channel code' },
                    { key: 'tokenField', label: 'Token field', type: 'string', description: 'Field containing channel token (auto-generated if not provided)' },
                    { key: 'defaultLanguageCodeField', label: 'Default language code field', type: 'string', required: true, description: 'Field containing default language (e.g., "en")' },
                    { key: 'availableLanguageCodesField', label: 'Available languages field', type: 'string', description: 'Field containing array of language codes' },
                    { key: 'defaultCurrencyCodeField', label: 'Default currency code field', type: 'string', required: true, description: 'Field containing default currency (e.g., "USD")' },
                    { key: 'availableCurrencyCodesField', label: 'Available currencies field', type: 'string', description: 'Field containing array of currency codes' },
                    { key: 'pricesIncludeTaxField', label: 'Prices include tax field', type: 'string', description: 'Field indicating if prices include tax' },
                    { key: 'defaultTaxZoneCodeField', label: 'Default tax zone code field', type: 'string', description: 'Field containing default tax zone code' },
                    { key: 'defaultShippingZoneCodeField', label: 'Default shipping zone code field', type: 'string', description: 'Field containing default shipping zone code' },
                    { key: 'sellerIdField', label: 'Seller ID field', type: 'string', description: 'Field containing seller ID (for multi-vendor)' },
                ],
            },
        },
    }],
    ['shippingMethodUpsert', {
        handler: ShippingMethodHandler,
        definition: {
            type: 'LOADER',
            code: 'shippingMethodUpsert',
            description: 'Upsert ShippingMethod by code; configure calculator, checker, and fulfillment handler.',
            requires: ['UpdateShippingMethod'],
            icon: 'settings',
            color: '#64748b',
            entityType: toEntityCode(VendureEntityType.SHIPPING_METHOD),
            patchableFields: ['name', 'code', 'description', 'fulfillmentHandler', 'calculator', 'checker', 'customFields'],
            schema: {
                fields: [
                    { key: 'strategy', label: 'Load strategy', type: 'select', options: LOAD_STRATEGY_OPTIONS, description: 'UPSERT: create or update. CREATE: only create new. UPDATE: only update existing.' },
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing shipping method display name' },
                    { key: 'codeField', label: 'Code field', type: 'string', required: true, description: 'Field containing unique shipping method code' },
                    { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field containing description shown to customers' },
                    { key: 'fulfillmentHandlerField', label: 'Fulfillment handler field', type: 'string', required: true, description: 'Field containing fulfillment handler code (e.g., "manual-fulfillment")' },
                    { key: 'calculatorField', label: 'Calculator field', type: 'string', required: true, description: 'Field containing calculator config { code, args }' },
                    { key: 'checkerField', label: 'Checker field', type: 'string', description: 'Field containing eligibility checker config { code, args }' },
                ],
            },
        },
    }],
    ['customerGroupUpsert', {
        handler: CustomerGroupHandler,
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
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing unique customer group name' },
                    { key: 'customerEmailsField', label: 'Customer emails field', type: 'string', description: 'Field containing array of customer email addresses to add' },
                ],
            },
        },
    }],
    ['stockLocationUpsert', {
        handler: StockLocationHandler,
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
                    { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing stock location name' },
                    { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field containing location description' },
                ],
            },
        },
    }],
    ['inventoryAdjust', {
        handler: InventoryAdjustHandler,
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
                    { key: 'skuField', label: 'SKU field', type: 'string', required: true, description: 'Field containing the product variant SKU' },
                    { key: 'stockOnHandField', label: 'Stock on hand field', type: 'string', required: true, description: 'Field containing the new absolute stock level' },
                    { key: 'stockLocationNameField', label: 'Stock location name field', type: 'string', description: 'Field containing stock location name (uses default if not specified)' },
                    { key: 'stockLocationIdField', label: 'Stock location ID field', type: 'string', description: 'Field containing stock location ID (alternative to name)' },
                    { key: 'reasonField', label: 'Reason field', type: 'string', description: 'Field containing the adjustment reason' },
                ],
            },
        },
    }],
]);

/** All loader adapter definitions, auto-derived from the registry */
export const LOADER_ADAPTERS: AdapterDefinition[] =
    Array.from(LOADER_HANDLER_REGISTRY.values()).map(e => e.definition);

/** All loader handler classes, for use as NestJS providers */
export const LOADER_HANDLER_PROVIDERS: Type<LoaderHandler>[] = [...new Set(
    Array.from(LOADER_HANDLER_REGISTRY.values()).map(e => e.handler),
)];

/**
 * Auto-derived loader code constants from registry keys.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'productUpsert' -> LOADER_CODE.PRODUCT_UPSERT = 'productUpsert'
 */
export const LOADER_CODE = Object.fromEntries(
    Array.from(LOADER_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;
