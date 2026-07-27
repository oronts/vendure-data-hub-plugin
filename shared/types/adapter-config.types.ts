import type { AuthConfig, RateLimitConfig, RetryConfig } from './extractor.types';

/**
 * Typed Adapter Configuration Types
 *
 * Strongly-typed interfaces for adapter configurations to prevent
 * runtime errors through compile-time validation.
 */

/**
 * Authentication types for connections.
 * Shared between dashboard, SDK, and backend.
 */
export enum ConnectionAuthType {
    NONE = 'NONE',
    BASIC = 'BASIC',
    BEARER = 'BEARER',
    API_KEY = 'API_KEY',
    OAUTH2 = 'OAUTH2',
    HMAC = 'HMAC',
    JWT = 'JWT',
}

// EXTRACTOR CONFIGS

/** CSV Extractor - Parse uploaded files or explicit inline data */
export interface CsvExtractorConfig {
    adapterCode: 'csv';
    fileId?: string;
    csvText?: string;
    rows?: unknown[];
    delimiter?: string;
    hasHeader?: boolean;
}

/** JSON Extractor - Parse uploaded files or explicit inline data */
export interface JsonExtractorConfig {
    adapterCode: 'json';
    fileId?: string;
    jsonText?: string;
    itemsPath?: string;
}

/** XML Extractor - Parse uploaded files or explicit inline data */
export interface XmlExtractorConfig {
    adapterCode: 'xml';
    fileId?: string;
    xmlText?: string;
    recordPath?: string;
    attributePrefix?: string;
}

/** Excel Extractor - Parse uploaded workbooks */
export interface XlsxExtractorConfig {
    adapterCode: 'xlsx';
    fileId: string;
    sheetName?: string | number;
    hasHeader?: boolean;
}

/** HTTP API Extractor - Fetch data from HTTP/REST APIs with pagination support */
export interface HttpApiExtractorConfig {
    adapterCode: 'httpApi';
    /** API endpoint URL (or path if using connection) */
    url: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body (for POST/PUT/PATCH) */
    body?: Record<string, unknown>;
    /** Connection code for base URL and auth */
    connectionCode?: string;
    /** Response data path (JSON path to records array) */
    dataPath?: string;
    /** Pagination configuration */
    pagination?: {
        type: 'NONE' | 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK_HEADER';
        /** For offset pagination: offset parameter name */
        offsetParam?: string;
        /** For offset/cursor/page: limit parameter name */
        limitParam?: string;
        /** Records per page */
        limit?: number;
        /** For cursor pagination: cursor parameter name */
        cursorParam?: string;
        /** For cursor pagination: path to cursor in response */
        cursorPath?: string;
        /** For cursor pagination: path to hasMore flag */
        hasMorePath?: string;
        /** For page pagination: page parameter name */
        pageParam?: string;
        /** For page pagination: page size parameter name */
        pageSizeParam?: string;
        /** Maximum pages to fetch (safety limit) */
        maxPages?: number;
    };
    rateLimit?: RateLimitConfig;
    retry?: RetryConfig;
    auth?: AuthConfig;
    timeoutMs?: number;
}

/** GraphQL Extractor - Query GraphQL APIs */
export interface GraphqlExtractorConfig {
    adapterCode: 'graphql';
    /** GraphQL endpoint URL */
    url: string;
    /** GraphQL query */
    query: string;
    /** Query variables */
    variables?: Record<string, unknown>;
    /** Request headers */
    headers?: Record<string, string>;
    /** Full response path to the extracted records. */
    dataPath?: string;
    connectionCode?: string;
    auth?: AuthConfig;
    pagination?: {
        type: 'NONE' | 'OFFSET' | 'CURSOR' | 'RELAY';
        limit?: number;
        maxPages?: number;
        offsetVariable?: string;
        limitVariable?: string;
        cursorVariable?: string;
        pageInfoPath?: string;
        hasNextPagePath?: string;
        endCursorPath?: string;
        totalCountPath?: string;
    };
    timeoutMs?: number;
    operationName?: string;
    includeExtensions?: boolean;
}

/** Vendure Query Extractor - Query Vendure entities */
export interface VendureQueryExtractorConfig {
    adapterCode: 'vendureQuery';
    /** Entity to query */
    entity: 'PRODUCT' | 'PRODUCT_VARIANT' | 'CUSTOMER' | 'ORDER' | 'COLLECTION' | 'FACET' | 'FACET_VALUE' | 'PROMOTION' | 'ASSET';
    /** Relations to load */
    relations?: string[];
    /** Structured filter conditions */
    filters?: Array<{
        field: string;
        operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'contains';
        value: unknown;
    }>;
    includeFields?: string[];
    excludeFields?: string[];
    channelCodes?: string[];
    languageCode?: string;
    flattenTranslations?: boolean;
    where?: Record<string, unknown>;
    /** Batch size for pagination */
    batchSize?: number;
    /** Sort field */
    sortBy?: string;
    /** Sort direction */
    sortOrder?: 'ASC' | 'DESC';
}

/** Database Extractor - Query SQL databases */
export interface DatabaseExtractorConfig {
    adapterCode: 'database';
    /** Connection code */
    connectionCode: string;
    /** SQL query */
    query: string;
    /** Query parameters */
    params?: unknown[];
}

/** CDC Extractor - Poll for database changes via timestamp or version column */
export interface CdcExtractorConfig {
    adapterCode: 'cdc';
    /** Database type */
    databaseType: 'POSTGRESQL' | 'MYSQL';
    /** Connection code */
    connectionCode: string;
    /** Table to poll */
    table: string;
    /** Column used to detect changes */
    trackingColumn: string;
    /** Tracking type */
    trackingType: 'TIMESTAMP' | 'VERSION';
    /** Primary key column */
    primaryKey: string;
    /** Specific columns to select */
    columns?: string[];
    /** Batch size */
    batchSize?: number;
    /** Track soft-deletes */
    includeDeletes?: boolean;
    /** Delete timestamp column */
    deleteColumn?: string;
}

/** Generic config for custom extractor adapters */
export interface GenericExtractorConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all extractor configs */
export type TypedExtractorConfig =
    | CsvExtractorConfig
    | JsonExtractorConfig
    | XlsxExtractorConfig
    | XmlExtractorConfig
    | HttpApiExtractorConfig
    | GraphqlExtractorConfig
    | VendureQueryExtractorConfig
    | DatabaseExtractorConfig
    | CdcExtractorConfig
    | GenericExtractorConfig;

// LOADER CONFIGS


export interface CreateDuplicateHandlingConfig {
    /** When CREATE finds an existing record, skip it instead of failing the record. */
    skipDuplicates?: boolean;
}
/** Product Upsert Loader */
export interface ProductUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'productUpsert';
    /** Channel code */
    channel?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Conflict strategy: SOURCE_WINS (default), VENDURE_WINS, or MERGE */
    conflictStrategy?: 'SOURCE_WINS' | 'VENDURE_WINS' | 'MERGE';
    /** Field containing product name */
    nameField?: string;
    /** Field containing slug */
    slugField?: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing product enabled/published flag */
    enabledField?: string;
    /** Record field containing channel codes (array or comma-separated) for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing translations array or object map for multi-language support.
     *  Array format: [{ languageCode: 'en', name: '...', slug?: '...', description?: '...' }, ...]
     *  Object map: { en: { name, slug?, description? }, de: { ... } } */
    translationsField?: string;
    /** Field containing SKU */
    skuField?: string;
    /** Field containing price in major units (e.g., 19.99) */
    priceField?: string;
    /** Field containing a currency-to-major-unit price map (e.g., { USD: 19.99, EUR: 17.50 }) */
    priceByCurrencyField?: string;
    /** Field containing stock quantity */
    stockField?: string;
    /** Field containing stock by location map */
    stockByLocationField?: string;
    /** Track inventory flag */
    trackInventory?: string | boolean;
    /** Tax category name */
    taxCategoryName?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Whether to create/update variants alongside the product (default: true). Set to false when variants are handled by a separate variantUpsert step. */
    createVariants?: boolean;
    /** Record field containing facet value codes or objects with a code property (default: facetValueCodes) */
    facetValuesField?: string;
    /** How to handle product facet values on update */
    facetValuesMode?: FacetValuesMode;
    /** How to handle product assets on update */
    assetsMode?: AssetsMode;
    /** Record field containing an array of product asset URLs (default: assetUrls) */
    assetsField?: string;
    /** How to handle product featured asset on update */
    featuredAssetMode?: FeaturedAssetMode;
    /** Record field containing the product featured asset URL (default: featuredAssetUrl) */
    featuredAssetField?: string;
}

/** Variant Upsert Loader */
export interface VariantUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'variantUpsert';
    /** Channel code */
    channel?: string;
    /** Field containing SKU */
    skuField?: string;
    /** Field containing variant name */
    nameField?: string;
    /** Field containing variant enabled/published flag (defaults to "enabled") */
    enabledField?: string;
    /** Record field containing channel codes (array or comma-separated) for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing translations array or object map for multi-language support.
     *  Array format: [{ languageCode: 'en', name: '...' }, ...]
     *  Object map: { en: { name: '...' }, de: { name: '...' } } */
    translationsField?: string;
    /** Field containing price (major units, auto-converted to minor) */
    priceField?: string;
    /** Field containing price map by currency code (object, e.g. { USD: 19.99, EUR: 17.50 }) */
    priceByCurrencyField?: string;
    /** Field containing stock on hand */
    stockField?: string;
    /** Field containing stock by location map (object, e.g. { "Warehouse A": 100, "Warehouse B": 50 }) */
    stockByLocationField?: string;
    /** Tax category name */
    taxCategoryName?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Field containing option group→value pairs (object, e.g. { size: 'S', color: 'Blue' }). Auto-creates option groups and assigns them to the parent product. */
    optionGroupsField?: string;
    /** Field containing pre-existing Vendure option IDs (array, e.g. [1, 2, 3]). Passed directly without lookup. */
    optionIdsField?: string;
    /** Field containing option codes (array, e.g. ['size-s', 'color-blue']). Resolved to IDs by code lookup. */
    optionCodesField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE.
     *  UPSERT: update existing or create new (record must contain productSlug, productId, or productName for creation).
     *  CREATE: create new variants; existing variants skip only when skipDuplicates is true, otherwise fail.
     *  UPDATE: only update existing variants, skip missing. */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** How to handle variant facet values on update */
    facetValuesMode?: FacetValuesMode;
    /** How to handle variant assets on update */
    assetsMode?: AssetsMode;
    /** Record field containing an array of variant asset URLs (default: assetUrls) */
    assetsField?: string;
    /** How to handle variant featured asset on update */
    featuredAssetMode?: FeaturedAssetMode;
    /** Record field containing the variant featured asset URL (default: featuredAssetUrl) */
    featuredAssetField?: string;
    /** How to handle variant options on update */
    optionsMode?: OptionsMode;
}

// NESTED ENTITY MODE TYPES

/** How to handle customer addresses on update */
export type AddressesMode = 'UPSERT_BY_MATCH' | 'REPLACE_ALL' | 'APPEND_ONLY' | 'SKIP';

/** How to handle facet values on product/variant update */
export type FacetValuesMode = 'REPLACE_ALL' | 'MERGE' | 'REMOVE' | 'SKIP';

/** How to handle order lines on order update */
export type LinesMode = 'REPLACE_ALL' | 'MERGE_BY_SKU' | 'APPEND_ONLY' | 'UPDATE_BY_ID' | 'SKIP';

/** How to handle assets (product/variant/collection) */
export type AssetsMode = 'UPSERT_BY_URL' | 'REPLACE_ALL' | 'APPEND_ONLY' | 'SKIP';

/** How to handle featured asset (product/variant) */
export type FeaturedAssetMode = 'UPSERT_BY_URL' | 'REPLACE' | 'SKIP';

/** How to handle variant options */
export type OptionsMode = 'REPLACE_ALL' | 'MERGE' | 'SKIP';

/** How to handle collection filters */
export type FiltersMode = 'REPLACE_ALL' | 'MERGE' | 'SKIP';

/** How to handle promotion conditions */
export type ConditionsMode = 'REPLACE_ALL' | 'MERGE' | 'SKIP';

/** How to handle promotion actions */
export type ActionsMode = 'REPLACE_ALL' | 'MERGE' | 'SKIP';

/** How to handle customer groups */
export type GroupsMode = 'ADD' | 'SET';

/** Customer Upsert Loader */
export interface CustomerUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'customerUpsert';
    /** Field containing email (required) */
    emailField: string;
    /** Field containing first name */
    firstNameField?: string;
    /** Field containing last name */
    lastNameField?: string;
    /** Field containing phone */
    phoneNumberField?: string;
    /** Field containing addresses array */
    addressesField?: string;
    /** How to handle customer addresses on update */
    addressesMode?: AddressesMode;
    /** Comma-separated fields to match existing addresses (for UPSERT_BY_MATCH mode) */
    addressMatchFields?: string;
    /** Field containing group codes */
    groupsField?: string;
    /** Groups mode */
    groupsMode?: GroupsMode;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Stock Adjust Loader */
export interface StockAdjustLoaderConfig {
    adapterCode: 'stockAdjust';
    /** Field containing SKU (required) */
    skuField: string;
    /** Field containing stock by location map */
    stockByLocationField?: string;
    /** Field containing quantity */
    quantityField?: string;
    /** Use absolute values (not delta) */
    absolute?: boolean;
}

/** REST POST Loader */
export interface RestPostLoaderConfig {
    adapterCode: 'restPost';
    /** Full endpoint URL (required) */
    endpoint: string;
    /** HTTP method */
    method: 'POST' | 'PUT' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** Auth type */
    auth?: 'NONE' | 'BEARER' | 'BASIC' | 'HMAC';
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
    /** HMAC secret code */
    hmacSecretCode?: string;
    /** HMAC header name */
    hmacHeader?: string;
    /** HMAC payload template */
    hmacPayloadTemplate?: string;
    /** Batch mode: single record or array */
    batchMode?: 'single' | 'array';
    /** Max records per batch */
    maxBatchSize?: number;
    /** Number of retries */
    retries?: number;
    /** Delay between retries (ms) */
    retryDelayMs?: number;
    /** Maximum delay between retries (ms) */
    maxRetryDelayMs?: number;
    /** Exponential retry multiplier */
    backoffMultiplier?: number;
    /** Request timeout (ms) */
    timeoutMs?: number;
}

/** Order Upsert Loader */
export interface OrderUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'orderUpsert';
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Lookup fields for matching existing orders */
    lookupFields?: string;
    /** Field containing order code */
    codeField?: string;
    /** Field containing customer email */
    customerEmailField?: string;
    /** Field containing order lines array */
    linesField?: string;
    /** How to handle order lines on update */
    linesMode?: LinesMode;
    /** Field to match order lines by (for MERGE_BY_SKU and UPDATE_BY_ID modes, default: 'sku') */
    linesMatchBy?: string;
    /** Field containing shipping address */
    shippingAddressField?: string;
    /** Field containing billing address */
    billingAddressField?: string;
    /** Field containing shipping method code */
    shippingMethodCodeField?: string;
    /** Payment method code */
    paymentMethodCode?: string;
    /** Field containing payment method code */
    paymentMethodCodeField?: string;
    /** Target state */
    state?: string;
    /** Field containing state */
    stateField?: string;
    /** Field containing order placed at date */
    orderPlacedAtField?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
}

/** Order Note Loader */
export interface OrderNoteLoaderConfig {
    adapterCode: 'orderNote';
    /** Field containing order code */
    orderCodeField?: string;
    /** Field containing order ID */
    orderIdField?: string;
    /** Field containing note text */
    noteField: string;
    /** Mark as private note */
    isPrivate?: boolean;
}

/** Order Transition Loader */
export interface OrderTransitionLoaderConfig {
    adapterCode: 'orderTransition';
    /** Field containing order ID */
    orderIdField?: string;
    /** Field containing order code */
    orderCodeField?: string;
    /** Target state */
    state: string;
}

/** Collection Upsert Loader */
export interface CollectionUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'collectionUpsert';
    /** Channel code */
    channel?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing name */
    nameField?: string;
    /** Field containing slug */
    slugField?: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing parent slug */
    parentSlugField?: string;
    /** Apply collection filters after upsert */
    applyFilters?: boolean;
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
    /** Field containing isPrivate flag */
    isPrivateField?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** How to handle collection assets on update */
    assetsMode?: AssetsMode;
    /** How to handle collection filters on update */
    filtersMode?: FiltersMode;
}

/** Asset Attach Loader */
export interface AssetAttachLoaderConfig {
    adapterCode: 'assetAttach';
    /** Entity type to attach asset to */
    entity: 'PRODUCT' | 'COLLECTION';
    /** Field containing entity slug */
    slugField: string;
    /** Field containing asset ID */
    assetIdField: string;
}

/** Apply Coupon Loader */
export interface ApplyCouponLoaderConfig {
    adapterCode: 'applyCoupon';
    /** Field containing order ID */
    orderIdField?: string;
    /** Field containing order code */
    orderCodeField?: string;
    /** Field containing coupon code */
    couponField: string;
}

/** Promotion Upsert Loader */
export interface PromotionUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'promotionUpsert';
    /** Field containing coupon code (required) */
    codeField: string;
    /** Field containing name */
    nameField?: string;
    /** Field containing enabled flag */
    enabledField?: string;
    /** Field containing starts at date */
    startsAtField?: string;
    /** Field containing ends at date */
    endsAtField?: string;
    /** Field containing per-customer usage limit */
    perCustomerUsageLimitField?: string;
    /** Field containing conditions */
    conditionsField?: string;
    /** How to handle promotion conditions on update */
    conditionsMode?: ConditionsMode;
    /** Field containing actions. Creation requires at least one valid action. */
    actionsField: string;
    /** How to handle promotion actions on update */
    actionsMode?: ActionsMode;
    /** Channel code */
    channel?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
    /** Field containing promotion description */
    descriptionField?: string;
}

/** GraphQL Mutation Loader */
export interface GraphqlMutationLoaderConfig {
    adapterCode: 'graphqlMutation';
    /** GraphQL endpoint URL (required) */
    endpoint: string;
    /** GraphQL mutation string (required) */
    mutation: string;
    /** Variable mapping: { "input.name": "productName" } (required) */
    variableMapping: Record<string, string>;
    /** Request headers */
    headers?: Record<string, string>;
    /** Auth preset */
    auth?: 'NONE' | 'BEARER' | 'BASIC';
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
    /** Batch mode */
    batchMode?: 'single' | 'batch';
    /** Max records per batch */
    maxBatchSize?: number;
    /** Number of retries */
    retries?: number;
    /** Delay between retries (ms) */
    retryDelayMs?: number;
    /** Maximum delay between retries (ms) */
    maxRetryDelayMs?: number;
    /** Exponential retry multiplier */
    backoffMultiplier?: number;
    /** Request timeout (ms) */
    timeoutMs?: number;
}

/** Facet Upsert Loader */
export interface FacetUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'facetUpsert';
    /** Field containing facet code (required) */
    codeField: string;
    /** Field containing facet name (required) */
    nameField: string;
    /** Field containing private flag */
    privateField?: string;
    /** Channel code */
    channel?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
}

/** Facet Value Upsert Loader */
export interface FacetValueUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'facetValueUpsert';
    /** Field containing parent facet code (required) */
    facetCodeField: string;
    /** Field containing value code (required) */
    codeField: string;
    /** Field containing value name (required) */
    nameField: string;
    /** Channel code */
    channel?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
}

/** Asset Import Loader */
export interface AssetImportLoaderConfig {
    adapterCode: 'assetImport';
    /** Field containing source URL to download (required) */
    sourceUrlField: string;
    /** Field containing target filename */
    filenameField?: string;
    /** Field containing asset name */
    nameField?: string;
    /** Field containing tags (array) */
    tagsField?: string;
    /** Channel code */
    channel?: string;
}

/** Tax Rate Upsert Loader */
export interface TaxRateUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'taxRateUpsert';
    /** Field containing tax rate name (required) */
    nameField: string;
    /** Field containing tax rate percentage 0-100 (required) */
    valueField: string;
    /** Field containing enabled flag */
    enabledField?: string;
    /** Field containing tax category code/name (required) */
    taxCategoryCodeField: string;
    /** Field containing tax category ID (alternative) */
    taxCategoryIdField?: string;
    /** Field containing zone code/name (required) */
    zoneCodeField: string;
    /** Field containing zone ID (alternative) */
    zoneIdField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Payment Method Upsert Loader */
export interface PaymentMethodUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'paymentMethodUpsert';
    /** Field containing payment method name (required) */
    nameField: string;
    /** Field containing unique code (required) */
    codeField: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing enabled flag */
    enabledField?: string;
    /** Field containing handler config { code, args } (required) */
    handlerField: string;
    /** Field containing eligibility checker config { code, args } */
    checkerField?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
}

/** Channel Upsert Loader */
export interface ChannelUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'channelUpsert';
    /** Field containing unique channel code (required) */
    codeField: string;
    /** Field containing channel token */
    tokenField?: string;
    /** Field containing default language code (required) */
    defaultLanguageCodeField: string;
    /** Field containing available language codes (array) */
    availableLanguageCodesField?: string;
    /** Field containing default currency code (required) */
    defaultCurrencyCodeField: string;
    /** Field containing available currency codes (array) */
    availableCurrencyCodesField?: string;
    /** Field containing prices-include-tax flag */
    pricesIncludeTaxField?: string;
    /** Field containing default tax zone code */
    defaultTaxZoneCodeField?: string;
    /** Field containing default shipping zone code */
    defaultShippingZoneCodeField?: string;
    /** Field containing seller ID (for multi-vendor) */
    sellerIdField?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Shipping Method Upsert Loader */
export interface ShippingMethodUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'shippingMethodUpsert';
    /** Field containing display name (required) */
    nameField: string;
    /** Field containing unique code (required) */
    codeField: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing fulfillment handler code (required) */
    fulfillmentHandlerField: string;
    /** Field containing calculator config { code, args } (required) */
    calculatorField: string;
    /** Field containing eligibility checker config { code, args } */
    checkerField?: string;
    /** Field containing custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
    /** Field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Field containing channel codes for per-record channel assignment */
    channelsField?: string;
}

/** Customer Group Upsert Loader */
export interface CustomerGroupUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'customerGroupUpsert';
    /** Field containing group name (required) */
    nameField: string;
    /** Field containing customer email addresses (array) */
    customerEmailsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Stock Location Upsert Loader */
export interface StockLocationUpsertLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'stockLocationUpsert';
    /** Field containing stock location name (required) */
    nameField: string;
    /** Field containing location description */
    descriptionField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Inventory Adjust Loader */
export interface InventoryAdjustLoaderConfig extends CreateDuplicateHandlingConfig {
    adapterCode: 'inventoryAdjust';
    /** Field containing variant SKU (required) */
    skuField: string;
    /** Field containing stock on hand quantity (required) */
    stockOnHandField: string;
    /** Field containing stock location name */
    stockLocationNameField?: string;
    /** Field containing stock location ID (alternative) */
    stockLocationIdField?: string;
    /** Field containing adjustment reason */
    reasonField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: 'UPSERT' | 'CREATE' | 'UPDATE';
}

/** Entity Deletion Loader - Delete entities */
export interface EntityDeletionLoaderConfig {
    adapterCode: 'entityDeletion';
    /** Entity type to delete (default: 'product') */
    entityType?: 'product' | 'variant' | 'collection' | 'promotion' | 'shipping-method' | 'customer' | 'payment-method' | 'facet' | 'facet-value' | 'customer-group' | 'tax-rate' | 'asset' | 'stock-location';
    /** Record field containing the identifier to match (default depends on entity type) */
    identifierField?: string;
    /** How to match the entity (default depends on entity type) */
    matchBy?: 'slug' | 'sku' | 'id' | 'code' | 'email' | 'name';
    /** Delete variants when deleting a product (default: true) */
    cascadeVariants?: boolean;
    /** Channel code */
    channel?: string;
}

/** Generic config for custom loader adapters */
export interface GenericLoaderConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all loader configs */
export type TypedLoaderConfig =
    | ProductUpsertLoaderConfig
    | VariantUpsertLoaderConfig
    | CustomerUpsertLoaderConfig
    | OrderUpsertLoaderConfig
    | StockAdjustLoaderConfig
    | RestPostLoaderConfig
    | GraphqlMutationLoaderConfig
    | OrderNoteLoaderConfig
    | OrderTransitionLoaderConfig
    | CollectionUpsertLoaderConfig
    | AssetAttachLoaderConfig
    | AssetImportLoaderConfig
    | ApplyCouponLoaderConfig
    | PromotionUpsertLoaderConfig
    | FacetUpsertLoaderConfig
    | FacetValueUpsertLoaderConfig
    | TaxRateUpsertLoaderConfig
    | PaymentMethodUpsertLoaderConfig
    | ChannelUpsertLoaderConfig
    | ShippingMethodUpsertLoaderConfig
    | CustomerGroupUpsertLoaderConfig
    | StockLocationUpsertLoaderConfig
    | InventoryAdjustLoaderConfig
    | EntityDeletionLoaderConfig
    | GenericLoaderConfig;

// EXPORTER CONFIGS

/** CSV Export */
export interface CsvExportConfig {
    adapterCode: 'csvExport';
    /** Local output directory when destinationType is omitted. */
    path?: string;
    filenamePattern?: string;
    /** Include header row */
    includeHeader?: boolean;
    /** Column delimiter */
    delimiter?: ',' | ';' | '\t' | '|';
    /** Neutralize spreadsheet formulas by default; PRESERVE keeps exact values for machine consumers. */
    formulaMode?: 'SPREADSHEET_SAFE' | 'PRESERVE';
    /** Columns configuration */
    columns?: Array<{ field: string; header?: string }>;
    /** Encoding */
    encoding?: 'UTF_8' | 'UTF_16' | 'ISO_8859_1';
    /** Connection code for remote upload */
    connectionCode?: string;
}

/** JSON Export */
export interface JsonExportConfig {
    adapterCode: 'jsonExport';
    /** Local output directory when destinationType is omitted. */
    path?: string;
    filenamePattern?: string;
    /** Format */
    format?: 'JSON' | 'NDJSON';
    /** Pretty print */
    pretty?: boolean;
    /** Connection code for remote upload */
    connectionCode?: string;
}

/** XML Export */
export interface XmlExportConfig {
    adapterCode: 'xmlExport';
    /** Local output directory when destinationType is omitted. */
    path?: string;
    filenamePattern?: string;
    /** Root element name */
    rootElement?: string;
    /** Item element name */
    itemElement?: string;
    /** Include XML declaration */
    declaration?: boolean;
    /** Connection code for remote upload */
    connectionCode?: string;
}

/** Generic config for custom exporter adapters */
export interface GenericExporterConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all exporter configs */
export type TypedExporterConfig =
    | CsvExportConfig
    | JsonExportConfig
    | XmlExportConfig
    | GenericExporterConfig;

// FEED CONFIGS

/** Localization controls shared by built-in feed generators. */
export interface FeedLocalizationConfig {
    /** Translation language to flatten into the record. */
    languageCode?: string;
    /** Record field containing the translations array. */
    translationsField?: string;
    /** Retain only records assigned to this channel code. */
    channelCode?: string;
}

/** Field-path overrides shared by the built-in commerce feed handlers. */
export interface CommerceFeedFieldMappingConfig extends FeedLocalizationConfig {
    titleField?: string;
    descriptionField?: string;
    priceField?: string;
    priceUnit?: 'MINOR' | 'MAJOR';
    imageField?: string;
    brandField?: string;
}

/** Google Merchant Feed */
export interface GoogleMerchantFeedConfig extends CommerceFeedFieldMappingConfig {
    adapterCode: 'googleMerchant';
    /** Output file path (required) */
    outputPath: string;
    /** Currency ISO code (required) */
    currency: string;
    /** Field path for the product URL */
    linkField?: string;
    /** Field path for UPC, EAN, or GTIN */
    gtinField?: string;
    /** Field path for availability */
    availabilityField?: string;
    /** Store URL (required) */
    storeUrl: string;
}

/** Meta (Facebook) Catalog Feed */
export interface MetaCatalogFeedConfig extends CommerceFeedFieldMappingConfig {
    adapterCode: 'metaCatalog';
    /** Output file path (required) */
    outputPath: string;
    /** Currency ISO code (required) */
    currency: string;
    /** Field path for the product URL */
    linkField?: string;
    /** Field path for availability */
    availabilityField?: string;
}

/** Amazon Feed */
export interface AmazonFeedConfig extends CommerceFeedFieldMappingConfig {
    adapterCode: 'amazonFeed';
    /** Output file path (required) */
    outputPath: string;
    /** Currency ISO code (required) */
    currency: string;
    /** Field path for UPC, EAN, or GTIN */
    gtinField?: string;
}

/** Custom Feed */
export interface CustomFeedConfig extends FeedLocalizationConfig {
    adapterCode: 'customFeed';
    /** Output file path (required) */
    outputPath: string;
    /** Feed format (required) */
    format: 'XML' | 'CSV' | 'JSON' | 'TSV';
    /** Field mapping (required) */
    fieldMapping: Record<string, string>;
}

/** Generic config for custom feed adapters */
export interface GenericFeedConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all feed configs */
export type TypedFeedConfig =
    | GoogleMerchantFeedConfig
    | MetaCatalogFeedConfig
    | AmazonFeedConfig
    | CustomFeedConfig
    | GenericFeedConfig;

// ROUTE CONFIGS

/** Route/Branch Config */
export interface RouteConfig {
    /** Branches with conditions */
    branches: Array<{
        name: string;
        when: Array<{
            field: string;
            cmp: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'matches' | 'regex' | 'isNull' | 'exists' | 'in' | 'notIn';
            value: unknown;
        }>;
    }>;
    /** Default branch if no conditions match */
    defaultBranch?: string;
}

// PERMISSION MAPPINGS

/** Loader adapter codes that require UpdateCatalog permission */
export type UpdateCatalogLoaders = 'productUpsert' | 'variantUpsert' | 'stockAdjust' | 'collectionUpsert' | 'assetAttach' | 'assetImport' | 'facetUpsert' | 'facetValueUpsert' | 'stockLocationUpsert' | 'inventoryAdjust' | 'entityDeletion';

/** Loader adapter codes that require UpdateCustomer permission */
export type UpdateCustomerLoaders = 'customerUpsert' | 'customerGroupUpsert';

/** Loader adapter codes that require UpdateOrder permission */
export type UpdateOrderLoaders = 'orderUpsert' | 'orderNote' | 'orderTransition' | 'applyCoupon';

/** Loader adapter codes that require UpdatePromotion permission */
export type UpdatePromotionLoaders = 'promotionUpsert';

/** Loader adapter codes that require UpdateSettings permission */
export type UpdateSettingsLoaders = 'taxRateUpsert' | 'paymentMethodUpsert' | 'channelUpsert';

/** Loader adapter codes that require UpdateShippingMethod permission */
export type UpdateShippingMethodLoaders = 'shippingMethodUpsert';

/** Loader adapter codes that require UpdateDataHubSettings permission */
export type UpdateDataHubSettingsLoaders = 'restPost' | 'graphqlMutation';

/** All loader adapter codes */
export type LoaderAdapterCode =
    | UpdateCatalogLoaders
    | UpdateCustomerLoaders
    | UpdateOrderLoaders
    | UpdatePromotionLoaders
    | UpdateSettingsLoaders
    | UpdateShippingMethodLoaders
    | UpdateDataHubSettingsLoaders;
