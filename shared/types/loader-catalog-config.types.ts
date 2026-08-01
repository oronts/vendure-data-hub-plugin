import type {
    ActionsMode,
    AssetsMode,
    ConditionsMode,
    CreateDuplicateHandlingConfig,
    FiltersMode,
} from './loader-core-config.types';

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

