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
    /** Field containing existing customer group names */
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

