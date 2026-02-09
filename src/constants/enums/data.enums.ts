/**
 * Data domain enums - File formats, database types, field types, and data source definitions
 */

/**
 * Supported file formats for parsing and export
 */
export const FileFormat = {
    CSV: "CSV",
    JSON: "JSON",
    XML: "XML",
    XLSX: "XLSX",
    NDJSON: "NDJSON",
    TSV: "TSV",
    PARQUET: "PARQUET",
} as const;
export type FileFormat = typeof FileFormat[keyof typeof FileFormat];

/**
 * File format type (lowercase string literal union matching FileFormat enum values)
 */
export type FileFormatType = 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'TSV' | 'PARQUET';

/**
 * Export-specific formats (subset commonly used for exports)
 */
export type ExportFormatType = 'CSV' | 'JSON' | 'XML' | 'XLSX' | 'NDJSON' | 'PARQUET';

/**
 * Parse-specific formats (subset used for file parsing)
 */
export type ParseFormatType = 'CSV' | 'JSON' | 'XML' | 'XLSX';

/**
 * Database types supported by the database extractor
 */
export enum DatabaseType {
    POSTGRESQL = 'postgresql',
    MYSQL = 'mysql',
    SQLITE = 'sqlite',
    MSSQL = 'mssql',
    ORACLE = 'oracle',
}

/**
 * Pagination types for HTTP API extractors
 */
export const PaginationType = {
    NONE: "NONE",
    OFFSET: "OFFSET",
    CURSOR: "CURSOR",
    PAGE: "PAGE",
    LINK_HEADER: "LINK_HEADER",
} as const;
export type PaginationType = typeof PaginationType[keyof typeof PaginationType];

/**
 * Pagination types for database extractors
 */
export enum DatabasePaginationType {
    OFFSET = 'offset',
    CURSOR = 'cursor',
}

/**
 * Pagination types for GraphQL extractors
 */
export enum GraphQLPaginationType {
    NONE = 'none',
    OFFSET = 'offset',
    CURSOR = 'cursor',
    RELAY = 'relay',
}

/**
 * Pagination strategies for REST sources
 */
export enum RestPaginationStrategy {
    OFFSET = 'offset',
    CURSOR = 'cursor',
    PAGE = 'page',
    LINK = 'link',
}

/**
 * Pagination styles for GraphQL sources
 */
export enum GraphQLPaginationStyle {
    RELAY = 'relay',
    OFFSET = 'offset',
    CURSOR = 'cursor',
}

/**
 * HTTP methods supported by extractors
 */
export const HttpMethod = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE",
} as const;
export type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];

/**
 * File encoding types
 */
export const FileEncoding = {
    UTF8: "UTF_8",
    UTF16: "UTF_16",
    ISO_8859_1: "ISO_8859_1",
    WINDOWS_1252: "WINDOWS_1252",
} as const;
export type FileEncoding = typeof FileEncoding[keyof typeof FileEncoding];

/**
 * Sort order for queries
 */
export enum SortOrder {
    ASC = 'ASC',
    DESC = 'DESC',
}

/**
 * Source service types (implementation-level)
 */
export type DataSourceType =
    | 'local-file'
    | 'remote-file'
    | 'rest-api'
    | 'graphql-api'
    | 'sql-database'
    | 'ftp'
    | 'sftp'
    | 's3'
    | 'webhook';

/**
 * Field types for entity schema definitions
 *
 * Values use SCREAMING_SNAKE_CASE to match type conventions
 */
export enum FieldType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
}

/**
 * Date format constants for date parsing and formatting operations
 */
export const DATE_FORMAT = {
    ISO_DATE: 'YYYY-MM-DD',
    EU_SLASH: 'DD/MM/YYYY',
    EU_DOT: 'DD.MM.YYYY',
    US_DATE: 'MM/DD/YYYY',
    ISO_DATETIME: 'YYYY-MM-DDTHH:mm:ss',
    ISO_DATETIME_Z: 'YYYY-MM-DDTHH:mm:ssZ',
} as const;
export type DateFormat = typeof DATE_FORMAT[keyof typeof DATE_FORMAT];

/**
 * Math operations for numeric transforms
 */
export const MathOperation = {
    ADD: "ADD",
    SUBTRACT: "SUBTRACT",
    MULTIPLY: "MULTIPLY",
    DIVIDE: "DIVIDE",
    MODULO: "MODULO",
    POWER: "POWER",
} as const;
export type MathOperation = typeof MathOperation[keyof typeof MathOperation];

/**
 * Pad position for string padding
 */
export const PadPosition = {
    LEFT: "LEFT",
    RIGHT: "RIGHT",
} as const;
export type PadPosition = typeof PadPosition[keyof typeof PadPosition];

/**
 * Lookup types for record lookups
 */
export const LookupType = {
    VENDURE_ENTITY: "VENDURE_ENTITY",
    VALUE_MAP: "VALUE_MAP",
    EXTERNAL: "EXTERNAL",
} as const;
export type LookupType = typeof LookupType[keyof typeof LookupType];

/**
 * Filter action types
 *
 * Values use SCREAMING_SNAKE_CASE to match GraphQL enum conventions
 */
export const FilterAction = {
    KEEP: "KEEP",
    DROP: "DROP",
} as const;
export type FilterAction = typeof FilterAction[keyof typeof FilterAction];

