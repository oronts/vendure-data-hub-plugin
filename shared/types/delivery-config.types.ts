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
