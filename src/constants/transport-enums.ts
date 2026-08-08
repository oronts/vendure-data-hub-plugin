/**
 * Domain event types emitted during pipeline execution
 */
export enum DomainEventType {
    PIPELINE_STARTED = 'PIPELINE_STARTED',
    PIPELINE_COMPLETED = 'PIPELINE_COMPLETED',
    PIPELINE_FAILED = 'PIPELINE_FAILED',
    RECORD_EXTRACTED = 'RECORD_EXTRACTED',
    RECORD_TRANSFORMED = 'RECORD_TRANSFORMED',
    RECORD_VALIDATED = 'RECORD_VALIDATED',
    RECORD_LOADED = 'RECORD_LOADED',
    RECORD_REJECTED = 'RECORD_REJECTED',
    RECORD_DEAD_LETTERED = 'RECORD_DEAD_LETTERED',
    RECORD_EXPORTED = 'RECORD_EXPORTED',
    RECORD_INDEXED = 'RECORD_INDEXED',
    FEED_GENERATED = 'FEED_GENERATED',
}

/**
 * Database types supported by the database extractor
 */
export enum DatabaseType {
    POSTGRESQL = 'POSTGRESQL',
    MYSQL = 'MYSQL',
    SQLITE = 'SQLITE',
}

/**
 * Pagination types for HTTP API extractors
 */
export enum PaginationType {
    NONE = 'NONE',
    OFFSET = 'OFFSET',
    CURSOR = 'CURSOR',
    PAGE = 'PAGE',
    LINK_HEADER = 'LINK_HEADER',
}

/**
 * Pagination types for database extractors
 */
export enum DatabasePaginationType {
    OFFSET = 'OFFSET',
    CURSOR = 'CURSOR',
}

/**
 * Pagination types for GraphQL extractors
 */
export enum GraphQLPaginationType {
    NONE = 'NONE',
    OFFSET = 'OFFSET',
    CURSOR = 'CURSOR',
    RELAY = 'RELAY',
}

/**
 * HTTP methods supported by extractors
 */
export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

/**
 * File encoding types
 */
export enum FileEncoding {
    UTF8 = 'utf-8',
    UTF16 = 'utf-16',
    ISO_8859_1 = 'iso-8859-1',
    WINDOWS_1252 = 'windows-1252',
}

/**
 * Vendure entity types for data extraction
 */
export enum VendureEntityType {
    PRODUCT = 'PRODUCT',
    PRODUCT_VARIANT = 'PRODUCT_VARIANT',
    CUSTOMER = 'CUSTOMER',
    CUSTOMER_GROUP = 'CUSTOMER_GROUP',
    ORDER = 'ORDER',
    COLLECTION = 'COLLECTION',
    FACET = 'FACET',
    FACET_VALUE = 'FACET_VALUE',
    PROMOTION = 'PROMOTION',
    ASSET = 'ASSET',
    SHIPPING_METHOD = 'SHIPPING_METHOD',
    PAYMENT_METHOD = 'PAYMENT_METHOD',
    TAX_CATEGORY = 'TAX_CATEGORY',
    TAX_RATE = 'TAX_RATE',
    COUNTRY = 'COUNTRY',
    ZONE = 'ZONE',
    CHANNEL = 'CHANNEL',
    TAG = 'TAG',
    STOCK_LOCATION = 'STOCK_LOCATION',
    INVENTORY = 'INVENTORY',
}

/**
 * Sort order for queries
 */
export enum SortOrder {
    ASC = 'ASC',
    DESC = 'DESC',
}

/**
 * Supported file formats for parsing and export
 */
export enum FileFormat {
    CSV = 'CSV',
    JSON = 'JSON',
    XML = 'XML',
    XLSX = 'XLSX',
    NDJSON = 'NDJSON',
    TSV = 'TSV',
    PARQUET = 'PARQUET',
}

/**
 * Export-specific formats (subset commonly used for exports)
 */
export type ExportFormatType = 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'PARQUET';

/**
 * Parse-specific formats (subset used for file parsing)
 */
export type ParseFormatType = 'CSV' | 'JSON' | 'XML' | 'XLSX';

