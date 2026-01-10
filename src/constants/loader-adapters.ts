/**
 * Loader adapter definitions - Vendure entity loaders
 */
import { AdapterDefinition } from '../sdk/types';

export const LOADER_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'loader',
        code: 'productUpsert',
        description: 'Upsert Products and default Variants by slug/SKU. Supports channel, multi-currency prices, tax category, stock and inventory flags.',
        requires: ['UpdateCatalog'],
        schema: {
            fields: [
                { key: 'channel', label: 'Channel code', type: 'string', required: true },
                { key: 'strategy', label: 'Load strategy', type: 'select', required: true, options: [
                    { value: 'create', label: 'Create only' },
                    { value: 'update', label: 'Update only' },
                    { value: 'upsert', label: 'Create or Update' },
                ] },
                { key: 'conflictResolution', label: 'Conflict resolution', type: 'select', required: true, options: [
                    { value: 'source-wins', label: 'Source wins (overwrite)' },
                    { value: 'vendure-wins', label: 'Vendure wins (keep existing)' },
                    { value: 'merge', label: 'Merge (combine fields)' },
                ] },
                { key: 'nameField', label: 'Name field (from record)', type: 'string' },
                { key: 'slugField', label: 'Slug field (from record)', type: 'string' },
                { key: 'descriptionField', label: 'Description field (from record)', type: 'string' },
                { key: 'skuField', label: 'SKU field (from record)', type: 'string' },
                { key: 'priceField', label: 'Price field (from record)', type: 'string' },
                { key: 'taxCategoryName', label: 'Tax category name', type: 'string' },
                { key: 'trackInventory', label: 'Track inventory', type: 'select', options: [
                    { value: 'true', label: 'true' },
                    { value: 'false', label: 'false' },
                ] },
                { key: 'stockField', label: 'Stock on hand field', type: 'string' },
                { key: 'stockByLocationField', label: 'Stock by location field (object)', type: 'string' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'variantUpsert',
        description: 'Upsert ProductVariant by SKU. Supports channel, prices, stock, tax.',
        requires: ['UpdateCatalog'],
        schema: {
            fields: [
                { key: 'channel', label: 'Channel code', type: 'string' },
                { key: 'skuField', label: 'SKU field (from record)', type: 'string', required: true },
                { key: 'nameField', label: 'Name field (from record)', type: 'string' },
                { key: 'priceField', label: 'Price field (from record)', type: 'string' },
                { key: 'priceByCurrencyField', label: 'Price map field (object)', type: 'string' },
                { key: 'taxCategoryName', label: 'Tax category name', type: 'string' },
                { key: 'stockField', label: 'Stock on hand field', type: 'string' },
                { key: 'stockByLocationField', label: 'Stock by location field (object)', type: 'string' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'customerUpsert',
        description: 'Upsert Customer by email or externalId; merge addresses; assign groups.',
        requires: ['UpdateCustomer'],
        schema: {
            fields: [
                { key: 'emailField', label: 'Email field', type: 'string', required: true },
                { key: 'firstNameField', label: 'First name field', type: 'string' },
                { key: 'lastNameField', label: 'Last name field', type: 'string' },
                { key: 'phoneNumberField', label: 'Phone number field', type: 'string' },
                { key: 'addressesField', label: 'Addresses array field', type: 'string' },
                { key: 'groupsField', label: 'Group codes array field', type: 'string' },
                { key: 'groupsMode', label: 'Groups mode', type: 'select', options: [
                    { value: 'add', label: 'Add' },
                    { value: 'set', label: 'Set (replace)' },
                ] },
            ],
        },
    },
    {
        type: 'loader',
        code: 'orderNote',
        description: 'Attach a note to an Order by code or id.',
        requires: ['UpdateOrder'],
        schema: {
            fields: [
                { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                { key: 'orderIdField', label: 'Order id field', type: 'string' },
                { key: 'noteField', label: 'Note text field', type: 'string', required: true },
                { key: 'isPrivate', label: 'Private note', type: 'boolean' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'stockAdjust',
        description: 'Adjust stock levels by SKU and stock location code map.',
        requires: ['UpdateCatalog'],
        schema: {
            fields: [
                { key: 'skuField', label: 'SKU field', type: 'string', required: true },
                { key: 'stockByLocationField', label: 'Stock by location map (code->qty)', type: 'string', required: true },
                { key: 'absolute', label: 'Set absolute (else delta)', type: 'boolean' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'applyCoupon',
        description: 'Apply a coupon code to an Order by id/code.',
        requires: ['UpdateOrder'],
        schema: {
            fields: [
                { key: 'orderIdField', label: 'Order id field', type: 'string' },
                { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                { key: 'couponField', label: 'Coupon code field', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'loader',
        code: 'collectionUpsert',
        description: 'Upsert Collection by slug/code; assign to channel.',
        requires: ['UpdateCatalog'],
        schema: {
            fields: [
                { key: 'channel', label: 'Channel code', type: 'string' },
                { key: 'slugField', label: 'Slug field', type: 'string', required: true },
                { key: 'nameField', label: 'Name field', type: 'string', required: true },
                { key: 'parentSlugField', label: 'Parent slug field', type: 'string' },
                { key: 'descriptionField', label: 'Description field', type: 'string' },
                { key: 'applyFilters', label: 'Apply filters job', type: 'boolean' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'promotionUpsert',
        description: 'Upsert Promotion by couponCode; create/update enabled dates/actions/conditions.',
        requires: ['UpdatePromotion'],
        schema: {
            fields: [
                { key: 'codeField', label: 'Coupon code field', type: 'string', required: true },
                { key: 'nameField', label: 'Name field', type: 'string' },
                { key: 'enabledField', label: 'Enabled field', type: 'string' },
                { key: 'startsAtField', label: 'Starts at field', type: 'string' },
                { key: 'endsAtField', label: 'Ends at field', type: 'string' },
                { key: 'conditionsField', label: 'Conditions field (JSON)', type: 'string' },
                { key: 'actionsField', label: 'Actions field (JSON)', type: 'string' },
                { key: 'channel', label: 'Channel code', type: 'string' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'orderTransition',
        description: 'Transition an order to a new state by id/code.',
        requires: ['UpdateOrder'],
        schema: {
            fields: [
                { key: 'orderIdField', label: 'Order id field', type: 'string' },
                { key: 'orderCodeField', label: 'Order code field', type: 'string' },
                { key: 'state', label: 'Target state', type: 'string', required: true },
            ],
        },
    },
    {
        type: 'loader',
        code: 'assetAttach',
        description: 'Attach existing Asset (by id) as featured asset to a Product/Collection by slug.',
        requires: ['UpdateCatalog'],
        schema: {
            fields: [
                { key: 'entity', label: 'Entity type', type: 'select', required: true, options: [
                    { value: 'product', label: 'Product' },
                    { value: 'collection', label: 'Collection' },
                ] },
                { key: 'slugField', label: 'Slug field', type: 'string', required: true },
                { key: 'assetIdField', label: 'Asset ID field', type: 'string', required: true },
                { key: 'channel', label: 'Channel code', type: 'string' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'restPost',
        description: 'POST/PUT records to an external REST endpoint. Supports auth and per-record POST or array batch.',
        requires: ['UpdateDataHubSettings'],
        schema: {
            fields: [
                { key: 'endpoint', label: 'Endpoint', type: 'string', required: true },
                { key: 'method', label: 'Method', type: 'select', required: true, options: [
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                ] },
                { key: 'headers', label: 'Headers (JSON)', type: 'json' },
                { key: 'auth', label: 'Auth preset', type: 'select', options: [
                    { value: 'none', label: 'none' },
                    { value: 'bearer', label: 'bearer' },
                    { value: 'basic', label: 'basic' },
                    { value: 'hmac', label: 'hmac' },
                ] },
                { key: 'bearerTokenSecretCode', label: 'Bearer token secret code', type: 'string' },
                { key: 'basicSecretCode', label: 'Basic auth secret code', type: 'string' },
                { key: 'hmacSecretCode', label: 'HMAC secret code', type: 'string' },
                { key: 'hmacHeader', label: 'HMAC header name', type: 'string' },
                { key: 'hmacPayloadTemplate', label: 'HMAC payload template', type: 'string', description: 'e.g. ${method}:${path}:${timestamp}' },
                { key: 'batchMode', label: 'Batch mode', type: 'select', options: [
                    { value: 'single', label: 'single (one per request)' },
                    { value: 'array', label: 'array (batch in an array)' },
                ] },
                { key: 'maxBatchSize', label: 'Max batch size (array mode)', type: 'number', description: 'Chunk size when batchMode=array' },
                { key: 'retries', label: 'Retries', type: 'number', description: 'Number of retries for failed requests' },
                { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number', description: 'Delay between retries' },
                { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', description: 'Request timeout in milliseconds' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'taxRateUpsert',
        description: 'Upsert TaxRate by name; resolves tax category and zone by code.',
        requires: ['UpdateSettings'],
        schema: {
            fields: [
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
    {
        type: 'loader',
        code: 'paymentMethodUpsert',
        description: 'Upsert PaymentMethod by code; configure handler and eligibility checker.',
        requires: ['UpdateSettings'],
        schema: {
            fields: [
                { key: 'nameField', label: 'Name field', type: 'string', required: true, description: 'Field containing payment method name' },
                { key: 'codeField', label: 'Code field', type: 'string', required: true, description: 'Field containing unique payment method code' },
                { key: 'descriptionField', label: 'Description field', type: 'string', description: 'Field containing description shown to customers' },
                { key: 'enabledField', label: 'Enabled field', type: 'string', description: 'Field indicating if method is active' },
                { key: 'handlerField', label: 'Handler field', type: 'string', required: true, description: 'Field containing handler config { code, args }' },
                { key: 'checkerField', label: 'Checker field', type: 'string', description: 'Field containing eligibility checker config { code, args }' },
            ],
        },
    },
    {
        type: 'loader',
        code: 'channelUpsert',
        description: 'Upsert Channel by code; configure currencies, languages, and zones.',
        requires: ['UpdateSettings'],
        schema: {
            fields: [
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
];
