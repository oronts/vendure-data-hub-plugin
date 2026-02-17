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

/** CSV Extractor - Parse CSV files */
export interface CsvExtractorConfig {
    adapterCode: 'csv';
    /** Path to CSV file or connection-relative path */
    csvPath?: string;
    /** Column delimiter (default: ',') */
    delimiter?: string;
    /** First row contains headers (default: true) */
    hasHeader?: boolean;
    /** Skip first N rows */
    skipRows?: number;
    /** Encoding (default: 'utf-8') */
    encoding?: string;
    /** Connection code for remote files */
    connectionCode?: string;
}

/** JSON Extractor - Parse JSON files/arrays */
export interface JsonExtractorConfig {
    adapterCode: 'json';
    /** Path to JSON file */
    jsonPath?: string;
    /** JSONPath expression to extract records */
    itemsPath?: string;
    /** Connection code for remote files */
    connectionCode?: string;
}

/** Excel Extractor - Parse Excel files */
export interface ExcelExtractorConfig {
    adapterCode: 'excel';
    /** Path to Excel file */
    excelPath?: string;
    /** Sheet name or index */
    sheet?: string | number;
    /** First row contains headers */
    hasHeader?: boolean;
    /** Connection code for remote files */
    connectionCode?: string;
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
        /** For page pagination: records per page */
        pageSize?: number;
        /** Maximum pages to fetch (safety limit) */
        maxPages?: number;
    };
    /** GraphQL query (if using GraphQL) */
    graphqlQuery?: string;
    /** GraphQL variables */
    graphqlVariables?: Record<string, unknown>;
}

/** GraphQL Extractor - Query GraphQL APIs */
export interface GraphqlExtractorConfig {
    adapterCode: 'graphql';
    /** GraphQL endpoint URL */
    endpoint: string;
    /** GraphQL query */
    query: string;
    /** Query variables */
    variables?: Record<string, unknown>;
    /** Request headers */
    headers?: Record<string, string>;
    /** Field containing items (for arrays) */
    itemsField?: string;
    /** Connection-style: edges field */
    edgesField?: string;
    /** Connection-style: node field within edge */
    nodeField?: string;
    /** Cursor pagination variable name */
    cursorVar?: string;
    /** Field containing next cursor */
    nextCursorField?: string;
}

/** Vendure Query Extractor - Query Vendure entities */
export interface VendureQueryExtractorConfig {
    adapterCode: 'vendureQuery';
    /** Entity to query */
    entity: 'PRODUCT' | 'PRODUCT_VARIANT' | 'CUSTOMER' | 'ORDER' | 'COLLECTION' | 'FACET' | 'FACET_VALUE' | 'ASSET';
    /** Relations to load (comma-separated) */
    relations?: string;
    /** Filter conditions */
    filter?: Record<string, unknown>;
    /** Batch size for pagination */
    batchSize?: number;
    /** Sort field */
    sortBy?: string;
    /** Sort direction */
    sortOrder?: 'ASC' | 'DESC';
}

/** Webhook Extractor - Receive data via webhook */
export interface WebhookExtractorConfig {
    adapterCode: 'webhook';
    /** Expected content type */
    contentType?: 'application/json' | 'application/xml' | 'text/csv';
    /** HMAC validation secret code */
    hmacSecretCode?: string;
    /** HMAC header name */
    hmacHeader?: string;
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
    | ExcelExtractorConfig
    | HttpApiExtractorConfig
    | GraphqlExtractorConfig
    | VendureQueryExtractorConfig
    | WebhookExtractorConfig
    | DatabaseExtractorConfig
    | CdcExtractorConfig
    | GenericExtractorConfig;

// OPERATOR (TRANSFORM) CONFIGS

/** Map Operator - Field mapping/renaming */
export interface MapOperatorConfig {
    adapterCode: 'map';
    /** Mapping object: { targetField: 'sourceField' } */
    mapping: Record<string, string>;
    /** Include unmapped fields in output */
    passthrough?: boolean;
}

/** Template Operator - String templating */
export interface TemplateOperatorConfig {
    adapterCode: 'template';
    /** Template strings: { field: 'Hello {{name}}' } */
    templates: Record<string, string>;
}

/** Filter Operator - Filter records */
export interface FilterOperatorConfig {
    adapterCode: 'filter';
    /** Filter expression (JavaScript) */
    expression: string;
}

/** When Operator - Conditional transformation */
export interface WhenOperatorConfig {
    adapterCode: 'when';
    /** Condition expression */
    condition: string;
    /** Fields to set when true */
    thenSet?: Record<string, unknown>;
    /** Fields to set when false */
    elseSet?: Record<string, unknown>;
}

/** Lookup Operator - Enrich from external source */
export interface LookupOperatorConfig {
    adapterCode: 'lookup';
    /** Source type */
    sourceType: 'VENDURE' | 'HTTP' | 'STATIC';
    /** Field to match on */
    matchField: string;
    /** Fields to add from lookup */
    selectFields: string[];
    /** Entity for Vendure lookups */
    entity?: string;
    /** Endpoint for HTTP lookups */
    endpoint?: string;
    /** Static data for static lookups */
    data?: Record<string, unknown>[];
}

/** Aggregate Operator - Group and aggregate */
export interface AggregateOperatorConfig {
    adapterCode: 'aggregate';
    /** Group by fields */
    groupBy: string[];
    /** Aggregations: { field: 'sum' | 'count' | 'avg' | 'min' | 'max' } */
    aggregations: Record<string, 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first' | 'last'>;
}

/** Dedupe Operator - Remove duplicates */
export interface DedupeOperatorConfig {
    adapterCode: 'dedupe';
    /** Fields to check for duplicates */
    keyFields: string[];
    /** Keep first or last duplicate */
    keep?: 'first' | 'last';
}

/** Coerce Operator - Type coercion */
export interface CoerceOperatorConfig {
    adapterCode: 'coerce';
    /** Field type mappings */
    types: Record<string, 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'>;
}

/** Enrich Operator - Add default values */
export interface EnrichOperatorConfig {
    adapterCode: 'enrich';
    /** Default values to add if missing */
    defaults?: Record<string, unknown>;
    /** Computed values (expressions) */
    computed?: Record<string, string>;
}

/** Generic config for custom operator adapters */
export interface GenericOperatorConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all operator configs */
export type TypedOperatorConfig =
    | MapOperatorConfig
    | TemplateOperatorConfig
    | FilterOperatorConfig
    | WhenOperatorConfig
    | LookupOperatorConfig
    | AggregateOperatorConfig
    | DedupeOperatorConfig
    | CoerceOperatorConfig
    | EnrichOperatorConfig
    | GenericOperatorConfig;

// LOADER CONFIGS

/** Product Upsert Loader */
export interface ProductUpsertLoaderConfig {
    adapterCode: 'productUpsert';
    /** Channel code (required) */
    channel: string;
    /** Merge strategy */
    strategy: 'CREATE_ONLY' | 'UPDATE_ONLY' | 'SOURCE_WINS' | 'TARGET_WINS' | 'MERGE';
    /** Field containing product name */
    nameField?: string;
    /** Field containing slug */
    slugField?: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing SKU */
    skuField?: string;
    /** Field containing price */
    priceField?: string;
    /** Field containing stock quantity */
    stockField?: string;
    /** Track inventory flag */
    trackInventory?: string | boolean;
    /** Tax category name */
    taxCategoryName?: string;
}

/** Variant Upsert Loader */
export interface VariantUpsertLoaderConfig {
    adapterCode: 'variantUpsert';
    /** Channel code */
    channel?: string;
    /** Field containing SKU */
    skuField?: string;
    /** Field containing price */
    priceField?: string;
    /** Field containing stock */
    stockField?: string;
    /** Tax category name */
    taxCategoryName?: string;
}

/** Customer Upsert Loader */
export interface CustomerUpsertLoaderConfig {
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
    /** Field containing group codes */
    groupsField?: string;
    /** Groups mode */
    groupsMode?: 'add' | 'set';
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
    /** Batch mode: single record or array */
    batchMode?: 'SINGLE' | 'ARRAY';
    /** Max records per batch */
    maxBatchSize?: number;
    /** Number of retries */
    retries?: number;
    /** Delay between retries (ms) */
    retryDelayMs?: number;
    /** Request timeout (ms) */
    timeoutMs?: number;
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
export interface CollectionUpsertLoaderConfig {
    adapterCode: 'collectionUpsert';
    /** Channel code */
    channel?: string;
    /** Field containing name */
    nameField?: string;
    /** Field containing slug */
    slugField?: string;
    /** Field containing description */
    descriptionField?: string;
    /** Field containing parent slug */
    parentSlugField?: string;
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
export interface PromotionUpsertLoaderConfig {
    adapterCode: 'promotionUpsert';
    /** Field containing coupon code (required) */
    codeField: string;
    /** Field containing name */
    nameField?: string;
    /** Field containing starts at date */
    startsAtField?: string;
    /** Field containing ends at date */
    endsAtField?: string;
    /** Field containing per-customer usage limit */
    perCustomerUsageLimitField?: string;
    /** Field containing conditions */
    conditionsField?: string;
    /** Field containing actions */
    actionsField?: string;
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
    | StockAdjustLoaderConfig
    | RestPostLoaderConfig
    | OrderNoteLoaderConfig
    | OrderTransitionLoaderConfig
    | CollectionUpsertLoaderConfig
    | AssetAttachLoaderConfig
    | ApplyCouponLoaderConfig
    | PromotionUpsertLoaderConfig
    | GenericLoaderConfig;

// EXPORTER CONFIGS

/** CSV Export */
export interface CsvExportConfig {
    adapterCode: 'csvExport';
    /** Output path (required) */
    outputPath: string;
    /** Include header row */
    includeHeader?: boolean;
    /** Column delimiter */
    delimiter?: ',' | ';' | '\t' | '|';
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
    /** Output path (required) */
    outputPath: string;
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
    /** Output path (required) */
    outputPath: string;
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

/** Google Merchant Feed */
export interface GoogleMerchantFeedConfig {
    adapterCode: 'googleMerchant';
    /** Output file path (required) */
    outputPath: string;
    /** Feed format (required) */
    format: 'XML' | 'TSV';
    /** Target country ISO code (required) */
    targetCountry: string;
    /** Content language ISO code (required) */
    contentLanguage: string;
    /** Currency ISO code (required) */
    currency: string;
    /** Store URL (required) */
    storeUrl: string;
    /** Channel ID */
    channelId?: string;
    /** Include out of stock products */
    includeOutOfStock?: boolean;
    /** Store name */
    storeName?: string;
    /** Shipping info JSON */
    shippingInfo?: Record<string, unknown>;
}

/** Meta (Facebook) Catalog Feed */
export interface MetaCatalogFeedConfig {
    adapterCode: 'metaCatalog';
    /** Output file path (required) */
    outputPath: string;
    /** Feed format (required) */
    format: 'CSV' | 'XML';
    /** Currency ISO code (required) */
    currency: string;
    /** Channel ID */
    channelId?: string;
    /** Brand field path */
    brandField?: string;
    /** Category field path */
    categoryField?: string;
    /** Include variants */
    includeVariants?: boolean;
}

/** Amazon Feed */
export interface AmazonFeedConfig {
    adapterCode: 'amazonFeed';
    /** Output file path (required) */
    outputPath: string;
    /** Marketplace (required) */
    marketplace: 'US' | 'UK' | 'DE' | 'FR' | 'CA';
    /** Seller ID (required) */
    sellerId: string;
    /** Feed type */
    feedType?: 'INVENTORY' | 'PRICING' | 'PRODUCT';
}

/** Custom Feed */
export interface CustomFeedConfig {
    adapterCode: 'customFeed';
    /** Output file path (required) */
    outputPath: string;
    /** Feed format (required) */
    format: 'XML' | 'CSV' | 'JSON' | 'TSV';
    /** Field mapping (required) */
    fieldMapping: Record<string, string>;
    /** Template for item rendering */
    template?: string;
    /** Root element for XML */
    rootElement?: string;
    /** Item element for XML */
    itemElement?: string;
    /** Upload connection code */
    connectionCode?: string;
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

// VALIDATOR CONFIGS

/** Schema Validator */
export interface SchemaValidatorConfig {
    /** Schema code to validate against */
    schemaCode: string;
    /** Validation mode */
    mode?: 'STRICT' | 'LENIENT';
    /** Action on error */
    onError?: 'SKIP' | 'FAIL' | 'COLLECT';
    /** Collect errors for reporting */
    collectErrors?: boolean;
}

// ROUTE CONFIGS

/** Route/Branch Config */
export interface RouteConfig {
    /** Branches with conditions */
    branches: Array<{
        name: string;
        when: Array<{
            field: string;
            cmp: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'isNull' | 'exists' | 'in';
            value: unknown;
        }>;
    }>;
    /** Default branch if no conditions match */
    defaultBranch?: string;
}

// PERMISSION MAPPINGS

/** Loader adapter codes that require UpdateCatalog permission */
export type UpdateCatalogLoaders = 'productUpsert' | 'variantUpsert' | 'stockAdjust' | 'collectionUpsert' | 'assetAttach';

/** Loader adapter codes that require UpdateCustomer permission */
export type UpdateCustomerLoaders = 'customerUpsert';

/** Loader adapter codes that require UpdateOrder permission */
export type UpdateOrderLoaders = 'orderNote' | 'orderTransition' | 'applyCoupon';

/** Loader adapter codes that require UpdatePromotion permission */
export type UpdatePromotionLoaders = 'promotionUpsert';

/** Loader adapter codes that require UpdateDataHubSettings permission */
export type UpdateDataHubSettingsLoaders = 'restPost';

/** All loader adapter codes */
export type LoaderAdapterCode =
    | UpdateCatalogLoaders
    | UpdateCustomerLoaders
    | UpdateOrderLoaders
    | UpdatePromotionLoaders
    | UpdateDataHubSettingsLoaders;

