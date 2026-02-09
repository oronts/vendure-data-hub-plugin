/**
 * Adapter domain enums - Adapter types, categories, and entity definitions
 */

/**
 * Adapter types in the pipeline
 */
export const AdapterType = {
    EXTRACTOR: "EXTRACTOR",
    OPERATOR: "OPERATOR",
    LOADER: "LOADER",
    VALIDATOR: "VALIDATOR",
    ENRICHER: "ENRICHER",
    EXPORTER: "EXPORTER",
    FEED: "FEED",
    SINK: "SINK",
    TRIGGER: "TRIGGER",
    ROUTER: "ROUTER",
} as const;
export type AdapterType = typeof AdapterType[keyof typeof AdapterType];

/**
 * Adapter categories for organization
 */
export const AdapterCategory = {
    DATA_SOURCE: "DATA_SOURCE",
    TRANSFORMATION: "TRANSFORMATION",
    FILTERING: "FILTERING",
    ENRICHMENT: "ENRICHMENT",
    AGGREGATION: "AGGREGATION",
    CONVERSION: "CONVERSION",
    CATALOG: "CATALOG",
    CUSTOMERS: "CUSTOMERS",
    ORDERS: "ORDERS",
    INVENTORY: "INVENTORY",
    PROMOTIONS: "PROMOTIONS",
    ASSETS: "ASSETS",
    EXTERNAL: "EXTERNAL",
    UTILITY: "UTILITY",
} as const;
export type AdapterCategory = typeof AdapterCategory[keyof typeof AdapterCategory];

/**
 * Extractor category types for organization and filtering
 * Maps to GraphQL DataHubExtractorCategory
 */
export const ExtractorCategory = {
    DATA_SOURCE: "DATA_SOURCE",
    FILE_SYSTEM: "FILE_SYSTEM",
    CLOUD_STORAGE: "CLOUD_STORAGE",
    DATABASE: "DATABASE",
    API: "API",
    WEBHOOK: "WEBHOOK",
    VENDURE: "VENDURE",
    CUSTOM: "CUSTOM",
} as const;
export type ExtractorCategory = typeof ExtractorCategory[keyof typeof ExtractorCategory];

/**
 * Specialized feed formats for product exports
 * Maps to GraphQL DataHubFeedFormat
 */
export const FeedFormat = {
    GOOGLE_SHOPPING: "GOOGLE_SHOPPING",
    META_CATALOG: "META_CATALOG",
    AMAZON: "AMAZON",
    PINTEREST: "PINTEREST",
    TIKTOK: "TIKTOK",
    BING_SHOPPING: "BING_SHOPPING",
    CSV: "CSV",
    JSON: "JSON",
    XML: "XML",
    CUSTOM: "CUSTOM",
} as const;
export type FeedFormat = typeof FeedFormat[keyof typeof FeedFormat];

/**
 * Record operation types for data processing
 * Maps to GraphQL DataHubRecordOperation
 */
export enum RecordOperationType {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    SKIP = 'SKIP',
}

/**
 * Vendure entity types for data extraction
 */
export const VendureEntityType = {
    PRODUCT: "PRODUCT",
    PRODUCT_VARIANT: "PRODUCT_VARIANT",
    CUSTOMER: "CUSTOMER",
    CUSTOMER_GROUP: "CUSTOMER_GROUP",
    ORDER: "ORDER",
    COLLECTION: "COLLECTION",
    FACET: "FACET",
    FACET_VALUE: "FACET_VALUE",
    PROMOTION: "PROMOTION",
    ASSET: "ASSET",
    SHIPPING_METHOD: "SHIPPING_METHOD",
    PAYMENT_METHOD: "PAYMENT_METHOD",
    TAX_CATEGORY: "TAX_CATEGORY",
    TAX_RATE: "TAX_RATE",
    COUNTRY: "COUNTRY",
    ZONE: "ZONE",
    CHANNEL: "CHANNEL",
    TAG: "TAG",
    STOCK_LOCATION: "STOCK_LOCATION",
    INVENTORY: "INVENTORY",
} as const;
export type VendureEntityType = typeof VendureEntityType[keyof typeof VendureEntityType];

