/**
 * Type-Safe Pipeline Configuration
 *
 * Provides strongly-typed interfaces for pipeline configurations to prevent
 * runtime errors through compile-time validation.
 *
 * Usage:
 * ```typescript
 * import { createStep, createPipeline, ExtractorConfigs, LoaderConfigs } from './typed-config';
 *
 * const extractStep = createStep('EXTRACT', 'csv', {
 *     csvPath: '/data/products.csv',  // TypeScript knows required fields
 *     delimiter: ',',
 *     hasHeader: true,
 * });
 * ```
 */

import { StepType } from '../constants/index';

// EXTRACTOR CONFIGS - Each extractor has specific required/optional fields

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

/** REST API Extractor - Fetch from HTTP endpoints */
export interface RestExtractorConfig {
    adapterCode: 'rest';
    /** Full URL or path (if connectionCode used) */
    endpoint: string;
    /** HTTP method */
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** Query parameters */
    query?: Record<string, string>;
    /** Request body (for POST/PUT) */
    body?: Record<string, unknown>;
    /** Connection code */
    connectionCode?: string;
    /** Field containing array of items in response */
    itemsField?: string;
    /** Pagination: page query parameter name */
    pageParam?: string;
    /** Pagination: field for next page indicator */
    nextPageField?: string;
    /** Max pages to fetch */
    maxPages?: number;
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code (format: user:pass) */
    basicSecretCode?: string;
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
    adapterCode: 'vendure-query';
    /** Entity to query */
    entity: 'Product' | 'ProductVariant' | 'Customer' | 'Order' | 'Collection' | 'Facet' | 'FacetValue' | 'Asset';
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

/**
 * Generic config for user-registered/custom extractor adapters.
 * Use this when registering your own extractor adapter.
 */
export interface GenericExtractorConfig {
    /** Your custom adapter code */
    adapterCode: string;
    /** Any additional config properties */
    [key: string]: unknown;
}

/** Union of all extractor configs */
export type TypedExtractorConfig =
    | CsvExtractorConfig
    | JsonExtractorConfig
    | ExcelExtractorConfig
    | RestExtractorConfig
    | GraphqlExtractorConfig
    | VendureQueryExtractorConfig
    | WebhookExtractorConfig
    | DatabaseExtractorConfig
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
    sourceType: 'vendure' | 'http' | 'static';
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
    /** Field type mappings: { field: 'string' | 'number' | 'boolean' | 'date' } */
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

/**
 * Generic config for user-registered/custom operator adapters.
 * Use this when registering your own operator adapter.
 */
export interface GenericOperatorConfig {
    /** Your custom adapter code */
    adapterCode: string;
    /** Any additional config properties */
    [key: string]: unknown;
}

/** Union of all operator configs */
export type OperatorConfig =
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

// LOADER CONFIGS - WITH REQUIRED PERMISSIONS

/** Product Upsert Loader - Requires: UpdateCatalog */
export interface ProductUpsertLoaderConfig {
    adapterCode: 'productUpsert';
    /** Channel code (required) */
    channel: string;
    /** Merge strategy */
    strategy: 'create-only' | 'update-only' | 'source-wins' | 'target-wins' | 'merge';
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

/** Variant Upsert Loader - Requires: UpdateCatalog */
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

/** Customer Upsert Loader - Requires: UpdateCustomer */
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
    groupsMode?: 'replace' | 'add' | 'remove';
}

/** Stock Adjust Loader - Requires: UpdateCatalog */
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

/** REST POST Loader - Requires: UpdateDataHubSettings */
export interface RestPostLoaderConfig {
    adapterCode: 'restPost';
    /** Full endpoint URL (required) */
    endpoint: string;
    /** HTTP method */
    method: 'POST' | 'PUT' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** Auth type */
    auth?: 'none' | 'bearer' | 'basic' | 'hmac';
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
    /** HMAC secret code */
    hmacSecretCode?: string;
    /** HMAC header name */
    hmacHeader?: string;
    /** Batch mode: single record or array */
    batchMode?: 'single' | 'array';
    /** Max records per batch */
    maxBatchSize?: number;
    /** Number of retries */
    retries?: number;
    /** Delay between retries (ms) */
    retryDelayMs?: number;
    /** Request timeout (ms) */
    timeoutMs?: number;
}

/** Order Note Loader - Requires: UpdateOrder */
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

/** Order Transition Loader - Requires: UpdateOrder */
export interface OrderTransitionLoaderConfig {
    adapterCode: 'orderTransition';
    /** Field containing order ID */
    orderIdField?: string;
    /** Field containing order code */
    orderCodeField?: string;
    /** Target state */
    toState: string;
}

/** Collection Upsert Loader - Requires: UpdateCatalog */
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

/** Asset Attach Loader - Requires: UpdateCatalog */
export interface AssetAttachLoaderConfig {
    adapterCode: 'assetAttach';
    /** Entity type to attach asset to */
    entity: 'Product' | 'Collection';
    /** Field containing entity slug */
    entitySlugField: string;
    /** Field containing asset ID */
    assetIdField: string;
}

/** Apply Coupon Loader - Requires: UpdateOrder */
export interface ApplyCouponLoaderConfig {
    adapterCode: 'applyCoupon';
    /** Field containing order ID */
    orderIdField?: string;
    /** Field containing order code */
    orderCodeField?: string;
    /** Field containing coupon code */
    couponCodeField: string;
}

/** Promotion Upsert Loader - Requires: UpdatePromotion */
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

/**
 * Generic config for user-registered/custom loader adapters.
 * Use this when registering your own loader adapter.
 */
export interface GenericLoaderConfig {
    /** Your custom adapter code */
    adapterCode: string;
    /** Any additional config properties */
    [key: string]: unknown;
}

/** Union of all loader configs */
export type LoaderConfig =
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
    encoding?: 'utf-8' | 'utf-16' | 'iso-8859-1';
    /** Connection code for remote upload */
    connectionCode?: string;
}

/** JSON Export */
export interface JsonExportConfig {
    adapterCode: 'jsonExport';
    /** Output path (required) */
    outputPath: string;
    /** Format */
    format?: 'json' | 'ndjson';
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

/**
 * Generic config for user-registered/custom exporter adapters.
 * Use this when registering your own exporter adapter.
 */
export interface GenericExporterConfig {
    /** Your custom adapter code */
    adapterCode: string;
    /** Any additional config properties */
    [key: string]: unknown;
}

/** Union of all exporter configs */
export type ExporterConfig =
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
    format: 'xml' | 'tsv';
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
    format: 'csv' | 'xml';
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
    feedType?: 'inventory' | 'pricing' | 'product';
}

/** Custom Feed */
export interface CustomFeedConfig {
    adapterCode: 'customFeed';
    /** Output file path (required) */
    outputPath: string;
    /** Feed format (required) */
    format: 'xml' | 'csv' | 'json' | 'tsv';
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

/**
 * Generic config for user-registered/custom feed adapters.
 * Use this when registering your own feed adapter.
 */
export interface GenericFeedConfig {
    /** Your custom adapter code */
    adapterCode: string;
    /** Any additional config properties */
    [key: string]: unknown;
}

/** Union of all feed configs */
export type FeedConfig =
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
    mode?: 'strict' | 'lenient';
    /** Action on error */
    onError?: 'skip' | 'fail' | 'collect';
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
            cmp: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'isNull' | 'exists' | 'in';
            value: unknown;
        }>;
    }>;
    /** Default branch if no conditions match */
    defaultBranch?: string;
}

// PERMISSION MAPPINGS - Which loaders require which permissions

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
export type LoaderAdapterCode = UpdateCatalogLoaders | UpdateCustomerLoaders | UpdateOrderLoaders | UpdatePromotionLoaders | UpdateDataHubSettingsLoaders;

/** Map loader adapter code to required permission */
export const LOADER_PERMISSIONS: Record<LoaderAdapterCode, string> = {
    productUpsert: 'UpdateCatalog',
    variantUpsert: 'UpdateCatalog',
    stockAdjust: 'UpdateCatalog',
    collectionUpsert: 'UpdateCatalog',
    assetAttach: 'UpdateCatalog',
    customerUpsert: 'UpdateCustomer',
    orderNote: 'UpdateOrder',
    orderTransition: 'UpdateOrder',
    applyCoupon: 'UpdateOrder',
    promotionUpsert: 'UpdatePromotion',
    restPost: 'UpdateDataHubSettings',
};

// TYPED STEP DEFINITIONS

/** Base step properties */
interface BaseStep {
    key: string;
    name?: string;
    async?: boolean;
    concurrency?: number;
}

/** Extract step with typed config */
export interface TypedExtractStep extends BaseStep {
    type: typeof StepType.EXTRACT;
    config: TypedExtractorConfig;
}

/** Transform step with typed config */
export interface TypedTransformStep extends BaseStep {
    type: typeof StepType.TRANSFORM;
    config: OperatorConfig;
}

/** Validate step with typed config */
export interface TypedValidateStep extends BaseStep {
    type: typeof StepType.VALIDATE;
    config: SchemaValidatorConfig;
}

/** Enrich step with typed config */
export interface TypedEnrichStep extends BaseStep {
    type: typeof StepType.ENRICH;
    config: EnrichOperatorConfig;
}

/** Route step with typed config */
export interface TypedRouteStep extends BaseStep {
    type: typeof StepType.ROUTE;
    config: RouteConfig;
}

/** Load step with typed config */
export interface TypedLoadStep extends BaseStep {
    type: typeof StepType.LOAD;
    config: LoaderConfig;
}

/** Export step with typed config */
export interface TypedExportStep extends BaseStep {
    type: typeof StepType.EXPORT;
    config: ExporterConfig;
}

/** Feed step with typed config */
export interface TypedFeedStep extends BaseStep {
    type: typeof StepType.FEED;
    config: FeedConfig;
}

/** Union of all typed steps */
export type TypedStep =
    | TypedExtractStep
    | TypedTransformStep
    | TypedValidateStep
    | TypedEnrichStep
    | TypedRouteStep
    | TypedLoadStep
    | TypedExportStep
    | TypedFeedStep;

// HELPER FUNCTIONS

/**
 * Create a typed extract step
 */
export function extractStep<T extends TypedExtractorConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedExtractStep {
    return {
        key,
        type: StepType.EXTRACT,
        config,
        ...options,
    };
}

/**
 * Create a typed transform step
 */
export function transformStep<T extends OperatorConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedTransformStep {
    return {
        key,
        type: StepType.TRANSFORM,
        config,
        ...options,
    };
}

/**
 * Create a typed validate step
 */
export function validateStep(
    key: string,
    config: SchemaValidatorConfig,
    options?: Omit<BaseStep, 'key'>
): TypedValidateStep {
    return {
        key,
        type: StepType.VALIDATE,
        config,
        ...options,
    };
}

/**
 * Create a typed load step
 */
export function loadStep<T extends LoaderConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedLoadStep {
    return {
        key,
        type: StepType.LOAD,
        config,
        ...options,
    };
}

/**
 * Create a typed route step
 */
export function routeStep(
    key: string,
    config: RouteConfig,
    options?: Omit<BaseStep, 'key'>
): TypedRouteStep {
    return {
        key,
        type: StepType.ROUTE,
        config,
        ...options,
    };
}

/**
 * Create a typed export step
 */
export function exportStep<T extends ExporterConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedExportStep {
    return {
        key,
        type: StepType.EXPORT,
        config,
        ...options,
    };
}

/**
 * Create a typed feed step
 */
export function feedStep<T extends FeedConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedFeedStep {
    return {
        key,
        type: StepType.FEED,
        config,
        ...options,
    };
}

/**
 * Derive required permissions from steps
 */
export function deriveRequiredPermissions(steps: TypedStep[]): string[] {
    const permissions = new Set<string>();

    for (const step of steps) {
        if (step.type === StepType.LOAD) {
            const adapterCode = (step.config as LoaderConfig).adapterCode;
            const permission = LOADER_PERMISSIONS[adapterCode as LoaderAdapterCode];
            if (permission) {
                permissions.add(permission);
            }
        }
    }

    return Array.from(permissions);
}

/**
 * Derive writes declarations from steps
 */
export function deriveWrites(steps: TypedStep[]): Array<'catalog' | 'customers' | 'orders' | 'inventory' | 'promotions' | 'custom'> {
    const writes = new Set<'catalog' | 'customers' | 'orders' | 'inventory' | 'promotions' | 'custom'>();

    for (const step of steps) {
        if (step.type === StepType.LOAD) {
            const adapterCode = (step.config as LoaderConfig).adapterCode;
            switch (adapterCode) {
                case 'productUpsert':
                case 'variantUpsert':
                case 'collectionUpsert':
                case 'assetAttach':
                    writes.add('catalog');
                    break;
                case 'stockAdjust':
                    writes.add('inventory');
                    break;
                case 'customerUpsert':
                    writes.add('customers');
                    break;
                case 'orderNote':
                case 'orderTransition':
                case 'applyCoupon':
                    writes.add('orders');
                    break;
                case 'promotionUpsert':
                    writes.add('promotions');
                    break;
                case 'restPost':
                    writes.add('custom');
                    break;
            }
        }
    }

    return Array.from(writes);
}

/**
 * Create capabilities from steps (auto-derives permissions and writes)
 */
export function deriveCapabilities(steps: TypedStep[]): {
    requires: string[];
    writes: Array<'catalog' | 'customers' | 'orders' | 'inventory' | 'promotions' | 'custom'>;
} {
    return {
        requires: deriveRequiredPermissions(steps),
        writes: deriveWrites(steps),
    };
}

// EXPORT NAMESPACES FOR EASY IMPORTS

export const Extractors = {
    csv: (config: Omit<CsvExtractorConfig, 'adapterCode'>): CsvExtractorConfig => ({ adapterCode: 'csv', ...config }),
    json: (config: Omit<JsonExtractorConfig, 'adapterCode'>): JsonExtractorConfig => ({ adapterCode: 'json', ...config }),
    excel: (config: Omit<ExcelExtractorConfig, 'adapterCode'>): ExcelExtractorConfig => ({ adapterCode: 'excel', ...config }),
    rest: (config: Omit<RestExtractorConfig, 'adapterCode'>): RestExtractorConfig => ({ adapterCode: 'rest', ...config }),
    graphql: (config: Omit<GraphqlExtractorConfig, 'adapterCode'>): GraphqlExtractorConfig => ({ adapterCode: 'graphql', ...config }),
    vendureQuery: (config: Omit<VendureQueryExtractorConfig, 'adapterCode'>): VendureQueryExtractorConfig => ({ adapterCode: 'vendure-query', ...config }),
    webhook: (config: Omit<WebhookExtractorConfig, 'adapterCode'>): WebhookExtractorConfig => ({ adapterCode: 'webhook', ...config }),
    database: (config: Omit<DatabaseExtractorConfig, 'adapterCode'>): DatabaseExtractorConfig => ({ adapterCode: 'database', ...config }),
    /** Use for user-registered custom extractor adapters */
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericExtractorConfig => ({ adapterCode, ...config }),
};

export const Operators = {
    map: (config: Omit<MapOperatorConfig, 'adapterCode'>): MapOperatorConfig => ({ adapterCode: 'map', ...config }),
    template: (config: Omit<TemplateOperatorConfig, 'adapterCode'>): TemplateOperatorConfig => ({ adapterCode: 'template', ...config }),
    filter: (config: Omit<FilterOperatorConfig, 'adapterCode'>): FilterOperatorConfig => ({ adapterCode: 'filter', ...config }),
    when: (config: Omit<WhenOperatorConfig, 'adapterCode'>): WhenOperatorConfig => ({ adapterCode: 'when', ...config }),
    lookup: (config: Omit<LookupOperatorConfig, 'adapterCode'>): LookupOperatorConfig => ({ adapterCode: 'lookup', ...config }),
    aggregate: (config: Omit<AggregateOperatorConfig, 'adapterCode'>): AggregateOperatorConfig => ({ adapterCode: 'aggregate', ...config }),
    dedupe: (config: Omit<DedupeOperatorConfig, 'adapterCode'>): DedupeOperatorConfig => ({ adapterCode: 'dedupe', ...config }),
    coerce: (config: Omit<CoerceOperatorConfig, 'adapterCode'>): CoerceOperatorConfig => ({ adapterCode: 'coerce', ...config }),
    enrich: (config: Omit<EnrichOperatorConfig, 'adapterCode'>): EnrichOperatorConfig => ({ adapterCode: 'enrich', ...config }),
    /** Use for user-registered custom operator adapters */
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericOperatorConfig => ({ adapterCode, ...config }),
};

export const Loaders = {
    productUpsert: (config: Omit<ProductUpsertLoaderConfig, 'adapterCode'>): ProductUpsertLoaderConfig => ({ adapterCode: 'productUpsert', ...config }),
    variantUpsert: (config: Omit<VariantUpsertLoaderConfig, 'adapterCode'>): VariantUpsertLoaderConfig => ({ adapterCode: 'variantUpsert', ...config }),
    customerUpsert: (config: Omit<CustomerUpsertLoaderConfig, 'adapterCode'>): CustomerUpsertLoaderConfig => ({ adapterCode: 'customerUpsert', ...config }),
    stockAdjust: (config: Omit<StockAdjustLoaderConfig, 'adapterCode'>): StockAdjustLoaderConfig => ({ adapterCode: 'stockAdjust', ...config }),
    restPost: (config: Omit<RestPostLoaderConfig, 'adapterCode'>): RestPostLoaderConfig => ({ adapterCode: 'restPost', ...config }),
    orderNote: (config: Omit<OrderNoteLoaderConfig, 'adapterCode'>): OrderNoteLoaderConfig => ({ adapterCode: 'orderNote', ...config }),
    orderTransition: (config: Omit<OrderTransitionLoaderConfig, 'adapterCode'>): OrderTransitionLoaderConfig => ({ adapterCode: 'orderTransition', ...config }),
    collectionUpsert: (config: Omit<CollectionUpsertLoaderConfig, 'adapterCode'>): CollectionUpsertLoaderConfig => ({ adapterCode: 'collectionUpsert', ...config }),
    assetAttach: (config: Omit<AssetAttachLoaderConfig, 'adapterCode'>): AssetAttachLoaderConfig => ({ adapterCode: 'assetAttach', ...config }),
    applyCoupon: (config: Omit<ApplyCouponLoaderConfig, 'adapterCode'>): ApplyCouponLoaderConfig => ({ adapterCode: 'applyCoupon', ...config }),
    promotionUpsert: (config: Omit<PromotionUpsertLoaderConfig, 'adapterCode'>): PromotionUpsertLoaderConfig => ({ adapterCode: 'promotionUpsert', ...config }),
    /** Use for user-registered custom loader adapters */
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericLoaderConfig => ({ adapterCode, ...config }),
};

export const Exporters = {
    csv: (config: Omit<CsvExportConfig, 'adapterCode'>): CsvExportConfig => ({ adapterCode: 'csvExport', ...config }),
    json: (config: Omit<JsonExportConfig, 'adapterCode'>): JsonExportConfig => ({ adapterCode: 'jsonExport', ...config }),
    xml: (config: Omit<XmlExportConfig, 'adapterCode'>): XmlExportConfig => ({ adapterCode: 'xmlExport', ...config }),
    /** Use for user-registered custom exporter adapters */
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericExporterConfig => ({ adapterCode, ...config }),
};

export const Feeds = {
    googleMerchant: (config: Omit<GoogleMerchantFeedConfig, 'adapterCode'>): GoogleMerchantFeedConfig => ({ adapterCode: 'googleMerchant', ...config }),
    metaCatalog: (config: Omit<MetaCatalogFeedConfig, 'adapterCode'>): MetaCatalogFeedConfig => ({ adapterCode: 'metaCatalog', ...config }),
    amazon: (config: Omit<AmazonFeedConfig, 'adapterCode'>): AmazonFeedConfig => ({ adapterCode: 'amazonFeed', ...config }),
    /** Built-in customizable feed (uses the 'customFeed' adapter) */
    customFeed: (config: Omit<CustomFeedConfig, 'adapterCode'>): CustomFeedConfig => ({ adapterCode: 'customFeed', ...config }),
    /** Use for user-registered custom feed adapters */
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericFeedConfig => ({ adapterCode, ...config }),
};
