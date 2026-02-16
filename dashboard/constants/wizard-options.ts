export const EXISTING_RECORDS_STRATEGIES = [
    { value: 'UPDATE', label: 'Update existing' },
    { value: 'REPLACE', label: 'Replace existing' },
    { value: 'SKIP', label: 'Skip duplicates' },
    { value: 'ERROR', label: 'Error on duplicate' },
] as const;

/**
 * File format constants for type-safe comparisons.
 * Use these instead of hardcoded string literals like === 'csv'.
 */
export const FILE_FORMAT = {
    CSV: 'CSV',
    JSON: 'JSON',
    XML: 'XML',
    XLSX: 'XLSX',
    NDJSON: 'NDJSON',
} as const;

/**
 * Import source type constants for type-safe comparisons.
 * Use these instead of hardcoded string literals like === 'file'.
 */
export const SOURCE_TYPE = {
    FILE: 'FILE',
    API: 'API',
    DATABASE: 'DATABASE',
    WEBHOOK: 'WEBHOOK',
    CDC: 'CDC',
} as const;

/**
 * Export destination type constants for type-safe comparisons.
 * Use these instead of hardcoded string literals like === 'file'.
 * Note: This mirrors the backend DESTINATION_TYPE from src/constants/enums.ts
 */
export const DESTINATION_TYPE = {
    FILE: 'FILE',
    DOWNLOAD: 'DOWNLOAD',
    S3: 'S3',
    FTP: 'FTP',
    SFTP: 'SFTP',
    HTTP: 'HTTP',
    EMAIL: 'EMAIL',
    WEBHOOK: 'WEBHOOK',
    LOCAL: 'LOCAL',
} as const;

/**
 * Export format type constants for type-safe comparisons.
 * Use these instead of hardcoded string literals.
 */
export const EXPORT_FORMAT = {
    CSV: 'CSV',
    JSON: 'JSON',
    XML: 'XML',
    GOOGLE_SHOPPING: 'GOOGLE_SHOPPING',
    META_CATALOG: 'META_CATALOG',
    AMAZON: 'AMAZON',
} as const;

export const NEW_RECORDS_STRATEGIES = [
    { value: 'CREATE', label: 'Create new records' },
    { value: 'SKIP', label: 'Skip new records' },
    { value: 'ERROR', label: 'Error on new record' },
] as const;

export const EXPORT_DESTINATION_TYPES = [
    { value: 'DOWNLOAD', label: 'Download' },
    { value: 'SFTP', label: 'SFTP Server' },
    { value: 'HTTP', label: 'HTTP Endpoint' },
    { value: 'S3', label: 'AWS S3' },
] as const;

export const CSV_DELIMITERS = [
    { value: ',', label: 'Comma (,)' },
    { value: ';', label: 'Semicolon (;)' },
    { value: '\t', label: 'Tab' },
    { value: '|', label: 'Pipe (|)' },
] as const;

export const FILE_ENCODINGS = [
    { value: 'utf-8', label: 'UTF-8' },
    { value: 'utf-16', label: 'UTF-16' },
    { value: 'iso-8859-1', label: 'ISO-8859-1' },
    { value: 'windows-1252', label: 'Windows-1252' },
] as const;

export const HTTP_METHODS = [
    { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' },
] as const;

export const HTTP_AUTH_TYPES = [
    { value: 'NONE', label: 'None' },
    { value: 'BASIC', label: 'Basic Auth' },
    { value: 'BEARER', label: 'Bearer Token' },
    { value: 'API_KEY', label: 'API Key' },
] as const;

/**
 * Cleanup strategy options for import wizard.
 * Use these instead of hardcoded string literals.
 */
export const CLEANUP_STRATEGIES = [
    { value: 'NONE', label: 'No cleanup' },
    { value: 'UNPUBLISH_MISSING', label: 'Unpublish missing records' },
    { value: 'DELETE_MISSING', label: 'Delete missing records' },
] as const;

/**
 * Cleanup strategy constants for type-safe comparisons.
 */
export const CLEANUP_STRATEGY = {
    NONE: 'NONE',
    UNPUBLISH_MISSING: 'UNPUBLISH_MISSING',
    DELETE_MISSING: 'DELETE_MISSING',
} as const;

export type CleanupStrategy = typeof CLEANUP_STRATEGIES[number]['value'];

/**
 * Compression options for export wizard.
 */
export const COMPRESSION_OPTIONS = [
    { value: 'NONE', label: 'None' },
    { value: 'GZIP', label: 'GZIP' },
    { value: 'ZIP', label: 'ZIP' },
] as const;

/**
 * Compression type constants for type-safe comparisons.
 */
export const COMPRESSION_TYPE = {
    NONE: 'NONE',
    GZIP: 'GZIP',
    ZIP: 'ZIP',
} as const;

export type CompressionType = typeof COMPRESSION_OPTIONS[number]['value'];

/**
 * Default values for XML format options.
 */
export const XML_DEFAULTS = {
    ROOT_ELEMENT: 'feed',
    ITEM_ELEMENT: 'item',
} as const;

/**
 * Default encoding value.
 */
export const DEFAULT_ENCODING = 'utf-8';

export const EXPORT_DEFAULTS = {
    DIRECTORY: '/exports',
    FILENAME: 'export.csv',
    SFTP_REMOTE_PATH: '/',
    HTTP_METHOD: 'POST',
    AUTH_TYPE: 'NONE',
} as const;

export const IMPORT_SOURCE_TYPES = [
    { id: 'FILE' as const, label: 'File Upload', description: 'CSV, Excel, JSON, XML' },
    { id: 'API' as const, label: 'REST API', description: 'Fetch from HTTP endpoint' },
    { id: 'DATABASE' as const, label: 'Database', description: 'Query external database' },
    { id: 'WEBHOOK' as const, label: 'Webhook', description: 'Receive push data' },
    { id: 'CDC' as const, label: 'Change Data Capture', description: 'Poll database for changes' },
] as const;

export const IMPORT_FILE_FORMATS = [
    { id: 'CSV' as const, label: 'CSV' },
    { id: 'XLSX' as const, label: 'Excel' },
    { id: 'JSON' as const, label: 'JSON' },
    { id: 'XML' as const, label: 'XML' },
] as const;

export const EXPORT_FORMAT_TYPES = [
    { id: 'CSV' as const, label: 'CSV', description: 'Comma-separated values' },
    { id: 'JSON' as const, label: 'JSON', description: 'JavaScript Object Notation' },
    { id: 'XML' as const, label: 'XML', description: 'Extensible Markup Language' },
    { id: 'GOOGLE_SHOPPING' as const, label: 'Google Shopping', description: 'Google Shopping feed format' },
    { id: 'META_CATALOG' as const, label: 'Meta Catalog', description: 'Facebook/Meta product feed' },
    { id: 'AMAZON' as const, label: 'Amazon', description: 'Amazon product feed format' },
] as const;

export type ImportSourceType = typeof IMPORT_SOURCE_TYPES[number]['id'];
export type ImportFileFormat = typeof IMPORT_FILE_FORMATS[number]['id'];
export type ExportFormatType = typeof EXPORT_FORMAT_TYPES[number]['id'];

export type ExistingRecordsStrategy = typeof EXISTING_RECORDS_STRATEGIES[number]['value'];
export type NewRecordsStrategy = typeof NEW_RECORDS_STRATEGIES[number]['value'];
export type ExportDestinationType = typeof EXPORT_DESTINATION_TYPES[number]['value'];
export type HttpAuthType = typeof HTTP_AUTH_TYPES[number]['value'];
