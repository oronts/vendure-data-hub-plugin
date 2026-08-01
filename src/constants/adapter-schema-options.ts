/**
 * Shared select option arrays for adapter schema definitions.
 *
 * Import these constants in handler registry files (loader-handler-registry.ts, extractor-handler-registry.ts, etc.)
 * to avoid duplicating option arrays across multiple adapter definitions.
 */
import { LoadStrategy, ConflictStrategy, FileFormat, FileEncoding, HttpMethod, PaginationType, QueueType, VendureEntityType, DatabaseType, DatabasePaginationType, GraphQLPaginationType, SortOrder } from './enums';
import { ConnectionAuthType } from '../../shared/types/adapter-config.types';
import { LOAD_STRATEGY_METADATA, CONFLICT_STRATEGY_METADATA } from './enum-metadata';

/** Load strategy select options for loader adapter schemas (auto-derived from metadata; excludes delete strategies) */
export const LOAD_STRATEGY_OPTIONS = [LoadStrategy.CREATE, LoadStrategy.UPDATE, LoadStrategy.UPSERT]
    .map(value => ({ value, label: LOAD_STRATEGY_METADATA[value].label }));

/** Conflict resolution select options for loader adapter schemas (auto-derived from metadata; excludes MANUAL_QUEUE) */
export const CONFLICT_RESOLUTION_OPTIONS = [ConflictStrategy.SOURCE_WINS, ConflictStrategy.VENDURE_WINS, ConflictStrategy.MERGE]
    .map(value => ({ value, label: CONFLICT_STRATEGY_METADATA[value].label }));

// ---------------------------------------------------------------------------
// FILE_FORMAT_METADATA: single source of truth for every file format.
// To add a new format: add ONE entry here (and optionally a parser).
// All option arrays, icon maps, color maps, extension maps, and MIME maps
// are auto-derived below.
// ---------------------------------------------------------------------------

export interface FileFormatMetadataEntry {
    /** Human-readable label */
    label: string;
    /** Lucide icon name (kebab-case) */
    icon: string;
    /** Hex color for UI badges */
    color: string;
    /** File extensions WITHOUT leading dot (e.g. ['csv', 'tsv']) */
    extensions: string[];
    /** MIME types accepted for this format */
    mimeTypes: string[];
    /**
     * Whether this format is parseable for import/extract (has a parser).
     * Formats like TSV, NDJSON, PARQUET are export-only or alias-parsed.
     */
    parseable: boolean;
}

export const FILE_FORMAT_METADATA: Record<string, FileFormatMetadataEntry> = {
    [FileFormat.CSV]: {
        label: 'CSV',
        icon: 'file-text',
        color: '#3b82f6',
        extensions: ['csv', 'tsv'],
        mimeTypes: ['text/csv', 'text/plain', 'application/csv'],
        parseable: true,
    },
    [FileFormat.JSON]: {
        label: 'JSON',
        icon: 'file-json',
        color: '#eab308',
        extensions: ['json', 'jsonl', 'ndjson'],
        mimeTypes: ['application/json', 'text/json'],
        parseable: true,
    },
    [FileFormat.XML]: {
        label: 'XML',
        icon: 'file',
        color: '#f97316',
        extensions: ['xml'],
        mimeTypes: ['application/xml', 'text/xml'],
        parseable: true,
    },
    [FileFormat.XLSX]: {
        label: 'Excel (XLSX)',
        icon: 'file-spreadsheet',
        color: '#22c55e',
        extensions: ['xlsx', 'xls'],
        mimeTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ],
        parseable: true,
    },
    [FileFormat.NDJSON]: {
        label: 'NDJSON',
        icon: 'file-json',
        color: '#eab308',
        extensions: ['ndjson', 'jsonl'],
        mimeTypes: ['application/x-ndjson'],
        parseable: false,
    },
    [FileFormat.TSV]: {
        label: 'TSV',
        icon: 'file-text',
        color: '#3b82f6',
        extensions: ['tsv'],
        mimeTypes: ['text/tab-separated-values'],
        parseable: false,
    },
    [FileFormat.PARQUET]: {
        label: 'Parquet',
        icon: 'file',
        color: '#8b5cf6',
        extensions: ['parquet'],
        mimeTypes: ['application/vnd.apache.parquet'],
        parseable: false,
    },
};

// ---------------------------------------------------------------------------
// Auto-derived constants from FILE_FORMAT_METADATA
// ---------------------------------------------------------------------------

/** File format select options with auto-detect (only parseable formats shown for import) */
export const FILE_FORMAT_OPTIONS = [
    { value: '', label: 'Auto-detect' },
    ...Object.entries(FILE_FORMAT_METADATA)
        .filter(([, meta]) => meta.parseable)
        .map(([value, meta]) => ({ value, label: meta.label })),
];


/** Single-source metadata for auth types, each type declares which scopes it belongs to */
const AUTH_TYPE_METADATA: Record<string, { label: string; scopes: string[] }> = {
    [ConnectionAuthType.NONE]:    { label: 'None',    scopes: ['rest', 'graphql', 'destination'] },
    [ConnectionAuthType.BEARER]:  { label: 'Bearer',  scopes: ['rest', 'graphql', 'destination'] },
    [ConnectionAuthType.BASIC]:   { label: 'Basic',   scopes: ['rest', 'graphql', 'destination'] },
    [ConnectionAuthType.HMAC]:    { label: 'HMAC',    scopes: ['rest'] },
    [ConnectionAuthType.API_KEY]: { label: 'API Key', scopes: ['destination'] },
};

const authTypesByScope = (scope: string) =>
    Object.entries(AUTH_TYPE_METADATA)
        .filter(([, m]) => m.scopes.includes(scope))
        .map(([value, m]) => ({ value, label: m.label }));

/** Auth type select options: NONE, BEARER, BASIC, HMAC (for REST loader) */
export const AUTH_TYPE_REST_OPTIONS = authTypesByScope('rest');

/** Auth type select options: NONE, BEARER, BASIC (for GraphQL loader) */
export const AUTH_TYPE_GRAPHQL_OPTIONS = authTypesByScope('graphql');

/** Single-source metadata for HTTP methods, each method declares which scopes it belongs to */
const HTTP_METHOD_METADATA: Record<string, { label: string; scopes: string[] }> = {
    [HttpMethod.GET]:    { label: 'GET',    scopes: ['all', 'extract', 'enrich'] },
    [HttpMethod.POST]:   { label: 'POST',   scopes: ['all', 'extract', 'write', 'export', 'enrich'] },
    [HttpMethod.PUT]:    { label: 'PUT',    scopes: ['all', 'extract', 'write', 'export'] },
    [HttpMethod.PATCH]:  { label: 'PATCH',  scopes: ['all', 'extract', 'export'] },
    [HttpMethod.DELETE]: { label: 'DELETE', scopes: ['all'] },
};

const httpMethodsByScope = (scope: string) =>
    Object.entries(HTTP_METHOD_METADATA)
        .filter(([, m]) => m.scopes.includes(scope))
        .map(([value, m]) => ({ value, label: m.label }));

/** HTTP method select options for extractors (all methods) */
export const HTTP_METHOD_ALL_OPTIONS = httpMethodsByScope('all');

/** HTTP method select options for extractors (GET, POST, PUT, PATCH, no DELETE) */
export const HTTP_METHOD_EXTRACT_OPTIONS = httpMethodsByScope('extract');

/** HTTP method select options for loaders (write operations: POST, PUT) */
export const HTTP_METHOD_WRITE_OPTIONS = httpMethodsByScope('write');

/** HTTP method select options for exporters/sinks (POST, PUT, PATCH) */
export const HTTP_METHOD_EXPORT_OPTIONS = httpMethodsByScope('export');

/** HTTP method select options for GET/POST only (enrichment operators, HTTP lookups) */
export const HTTP_METHOD_GET_POST_OPTIONS = httpMethodsByScope('enrich');

/** Auth type select options for HTTP destinations: NONE, BASIC, BEARER, API_KEY (auto-derived from AUTH_TYPE_METADATA) */
export const AUTH_TYPE_HTTP_DESTINATION_OPTIONS = authTypesByScope('destination');

/** Pagination type options for HTTP extractors */
export const PAGINATION_TYPE_OPTIONS = [
    { value: PaginationType.NONE, label: 'None' },
    { value: PaginationType.OFFSET, label: 'Offset' },
    { value: PaginationType.CURSOR, label: 'Cursor' },
    { value: PaginationType.PAGE, label: 'Page Number' },
    { value: PaginationType.LINK_HEADER, label: 'Link Header' },
];

/** CSV delimiter select options */
export const CSV_DELIMITER_OPTIONS = [
    { value: ',', label: 'Comma (,)' },
    { value: ';', label: 'Semicolon (;)' },
    { value: '\t', label: 'Tab' },
    { value: '|', label: 'Pipe (|)' },
];

export const CSV_FORMULA_MODE_OPTIONS = [
    { value: 'SPREADSHEET_SAFE', label: 'Spreadsheet-safe' },
    { value: 'PRESERVE', label: 'Preserve values' },
] as const;

/** Boolean select options (string values for schema forms) */
export const BOOLEAN_SELECT_OPTIONS = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
];

/** File encoding select options for export adapters */
export const FILE_ENCODING_OPTIONS = [
    { value: FileEncoding.UTF8, label: 'UTF-8' },
    { value: FileEncoding.UTF16, label: 'UTF-16' },
    { value: FileEncoding.ISO_8859_1, label: 'ISO-8859-1' },
];

/** JSON export format options (JSON array vs NDJSON line-delimited) */
export const JSON_EXPORT_FORMAT_OPTIONS = [
    { value: FileFormat.JSON, label: 'JSON (array)' },
    { value: FileFormat.NDJSON, label: 'NDJSON (line-delimited)' },
];

/** Protocol select options (HTTP/HTTPS) */
export const PROTOCOL_OPTIONS = [
    { value: 'http', label: 'HTTP' },
    { value: 'https', label: 'HTTPS' },
];

/** Queue type options for sink producers (excludes INTERNAL) */
export const QUEUE_TYPE_OPTIONS = [
    { value: QueueType.RABBITMQ_AMQP, label: 'RabbitMQ (AMQP) - Recommended' },
    { value: QueueType.RABBITMQ, label: 'RabbitMQ (HTTP API)' },
    { value: QueueType.SQS, label: 'Amazon SQS' },
    { value: QueueType.REDIS_STREAMS, label: 'Redis Streams' },
];

/** Queue types that can defer message-trigger acknowledgment until run completion */
export const MESSAGE_QUEUE_TYPE_OPTIONS = [
    { value: QueueType.RABBITMQ_AMQP, label: 'RabbitMQ (AMQP) - Recommended' },
    { value: QueueType.SQS, label: 'Amazon SQS' },
    { value: QueueType.REDIS_STREAMS, label: 'Redis Streams' },
    { value: QueueType.INTERNAL, label: 'Internal (Development)' },
];

/** Batch mode options for REST loader (single record vs array batch) */
export const BATCH_MODE_REST_OPTIONS = [
    { value: 'single', label: 'single (one per request)' },
    { value: 'array', label: 'array (batch in an array)' },
];

/** Batch mode options for GraphQL loader (single mutation vs batched input array) */
export const BATCH_MODE_GRAPHQL_OPTIONS = [
    { value: 'single', label: 'single (one mutation per record)' },
    { value: 'batch', label: 'batch (records as input array)' },
];

/** Batch mode options for export handlers (one request per record vs batch all) */
export const BATCH_MODE_EXPORT_OPTIONS = [
    { value: 'single', label: 'One request per record' },
    { value: 'batch', label: 'Batch all records in one request' },
];

/** Groups mode options for customer loader (add to groups vs replace groups) */
export const GROUPS_MODE_OPTIONS = [
    { value: 'ADD', label: 'Add' },
    { value: 'SET', label: 'Set (replace)' },
];

// ---------------------------------------------------------------------------
// Nested Entity Mode Options
// ---------------------------------------------------------------------------

/** Addresses mode options for customer loader */
export const ADDRESSES_MODE_OPTIONS = [
    { value: 'UPSERT_BY_MATCH', label: 'Upsert by match', description: 'Smart match by street+city+postal (prevents duplicates - recommended)' },
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Delete all existing addresses, create from record' },
    { value: 'APPEND_ONLY', label: 'Append only', description: 'Always create new addresses (may cause duplicates)' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify addresses' },
];

/** Facet values mode options for product/variant loaders */
export const FACET_VALUES_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Replace all facet values with those in record' },
    { value: 'MERGE', label: 'Merge', description: 'Add new facet values, keep existing' },
    { value: 'REMOVE', label: 'Remove', description: 'Remove specified facet values' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify facet values' },
];

/** Order lines mode options for order loader */
export const LINES_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Remove all lines, add new' },
    { value: 'MERGE_BY_SKU', label: 'Merge by SKU', description: 'Update quantity for existing SKU, add new SKUs' },
    { value: 'APPEND_ONLY', label: 'Append only', description: 'Always add new lines' },
    { value: 'UPDATE_BY_ID', label: 'Update by ID', description: 'Update lines by Vendure line ID (requires id field in record)' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify order lines' },
];

/** Assets mode options for product/variant/collection loaders */
export const ASSETS_MODE_OPTIONS = [
    { value: 'UPSERT_BY_URL', label: 'Upsert by URL', description: 'Smart match by source URL (prevents duplicates - recommended)' },
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Delete all existing assets, create from record' },
    { value: 'APPEND_ONLY', label: 'Append only', description: 'Always create new assets (may cause duplicates)' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify assets' },
];

/** Featured asset mode options for product/variant loaders */
export const FEATURED_ASSET_MODE_OPTIONS = [
    { value: 'UPSERT_BY_URL', label: 'Upsert by URL', description: 'Set or update featured asset by source URL' },
    { value: 'REPLACE', label: 'Replace', description: 'Replace featured asset with the one in record' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify featured asset' },
];

// ---------------------------------------------------------------------------
// Localization Schema Fields (shared across sink, feed, and export adapters)
// ---------------------------------------------------------------------------

/** Localization schema fields for multi-language/channel support in sinks, feeds, and exports */
export const LOCALIZATION_SCHEMA_FIELDS = [
    { key: 'languageCode', label: 'Language code', type: 'string' as const, description: 'ISO language code (e.g., en, de). Flattens translations for this language.' },
    { key: 'translationsField', label: 'Translations field', type: 'string' as const, description: 'Record field containing translations array (default: translations)' },
    { key: 'channelCode', label: 'Channel code', type: 'string' as const, description: 'Filter records by Vendure channel code' },
];

/** Variant options mode options for variant loader */
export const OPTIONS_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Replace all options with those in record' },
    { value: 'MERGE', label: 'Merge', description: 'Add new options, keep existing' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify options' },
];

/** Collection filters mode options for collection loader */
export const FILTERS_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Replace all filters with those in record' },
    { value: 'MERGE', label: 'Merge', description: 'Add new filters, keep existing' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify filters' },
];

/** Promotion conditions mode options for promotion loader */
export const CONDITIONS_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Replace all conditions with those in record' },
    { value: 'MERGE', label: 'Merge', description: 'Add new conditions, keep existing' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify conditions' },
];

/** Promotion actions mode options for promotion loader */
export const ACTIONS_MODE_OPTIONS = [
    { value: 'REPLACE_ALL', label: 'Replace all', description: 'Replace all actions with those in record' },
    { value: 'MERGE', label: 'Merge', description: 'Add new actions, keep existing' },
    { value: 'SKIP', label: 'Skip', description: 'Don\'t modify actions' },
];

/** Entity type options for asset attachment (Product or Collection) */
export const ASSET_ENTITY_TYPE_OPTIONS = [
    { value: VendureEntityType.PRODUCT, label: 'Product' },
    { value: VendureEntityType.COLLECTION, label: 'Collection' },
];

/** Google Merchant feed format options (XML RSS or TSV) */
export const GOOGLE_MERCHANT_FORMAT_OPTIONS = [
    { value: FileFormat.XML, label: 'XML (RSS 2.0)' },
    { value: FileFormat.TSV, label: 'TSV (tab-separated)' },
];

/** Meta/Facebook catalog feed format options */
export const META_CATALOG_FORMAT_OPTIONS = [
    { value: FileFormat.CSV, label: 'CSV' },
    { value: FileFormat.XML, label: 'XML' },
];

/** Custom feed format options (all common formats) */
export const CUSTOM_FEED_FORMAT_OPTIONS = [
    { value: FileFormat.XML, label: 'XML' },
    { value: FileFormat.CSV, label: 'CSV' },
    { value: FileFormat.JSON, label: 'JSON' },
    { value: FileFormat.TSV, label: 'TSV' },
];

// ---------------------------------------------------------------------------
// Database & extractor options
// ---------------------------------------------------------------------------

/** Single-source metadata for supported database types and CDC capability. */
const DATABASE_TYPE_METADATA: Record<DatabaseType, { label: string; supportsCDC: boolean }> = {
    [DatabaseType.POSTGRESQL]: { label: 'PostgreSQL', supportsCDC: true },
    [DatabaseType.MYSQL]:      { label: 'MySQL / MariaDB', supportsCDC: true },
    [DatabaseType.SQLITE]:     { label: 'SQLite', supportsCDC: false },
};

/** Database type options for all database adapters (auto-derived from DATABASE_TYPE_METADATA) */
export const DATABASE_TYPE_OPTIONS = Object.entries(DATABASE_TYPE_METADATA)
    .map(([value, m]) => ({ value, label: m.label }));

/** Database type options for CDC (only supports PostgreSQL + MySQL, auto-derived from DATABASE_TYPE_METADATA) */
export const CDC_DATABASE_TYPE_OPTIONS = Object.entries(DATABASE_TYPE_METADATA)
    .filter(([, m]) => m.supportsCDC)
    .map(([value, m]) => ({ value, label: m.label }));

/** Database pagination type options for SQL extractors */
export const DATABASE_PAGINATION_TYPE_OPTIONS = [
    { value: DatabasePaginationType.OFFSET, label: 'Offset (LIMIT/OFFSET)' },
    { value: DatabasePaginationType.CURSOR, label: 'Cursor (WHERE column > cursor)' },
];

/** GraphQL pagination type options */
export const GRAPHQL_PAGINATION_TYPE_OPTIONS = [
    { value: GraphQLPaginationType.NONE, label: 'None' },
    { value: GraphQLPaginationType.OFFSET, label: 'Offset (skip/take)' },
    { value: GraphQLPaginationType.CURSOR, label: 'Cursor' },
    { value: GraphQLPaginationType.RELAY, label: 'Relay Connection' },
];

/** Sort order options (ascending/descending) */
export const SORT_ORDER_OPTIONS = [
    { value: SortOrder.ASC, label: 'Ascending' },
    { value: SortOrder.DESC, label: 'Descending' },
];

/** File sort criteria options */
export const FILE_SORT_BY_OPTIONS = [
    { value: 'name', label: 'Name' },
    { value: 'modified', label: 'Modified Date' },
    { value: 'size', label: 'Size' },
];

/** CDC tracking column type options */
export const CDC_TRACKING_TYPE_OPTIONS = [
    { value: 'TIMESTAMP', label: 'Timestamp' },
    { value: 'VERSION', label: 'Version / Sequence Number' },
];

/** HMAC/signature algorithm options */
export const SIGNATURE_ALGORITHM_OPTIONS = [
    { value: 'sha256', label: 'SHA-256' },
    { value: 'sha512', label: 'SHA-512' },
];

/** Hash algorithm options for cryptographic hashing */
export const HASH_ALGORITHM_OPTIONS = [
    { value: 'sha256', label: 'SHA-256' },
    { value: 'sha512', label: 'SHA-512' },
] as const;

/** Hash output encoding options */
export const HASH_ENCODING_OPTIONS = [
    { value: 'hex', label: 'Hexadecimal' },
    { value: 'base64', label: 'Base64' },
];

export const SINK_OPERATION_OPTIONS = [
    { value: 'UPSERT', label: 'Upsert (Index)' },
    { value: 'DELETE', label: 'Delete' },
];

/** Vendure entity type options for query extractors */
export const VENDURE_ENTITY_TYPE_OPTIONS = [
    { value: VendureEntityType.PRODUCT, label: 'Products' },
    { value: VendureEntityType.PRODUCT_VARIANT, label: 'Product Variants' },
    { value: VendureEntityType.CUSTOMER, label: 'Customers' },
    { value: VendureEntityType.ORDER, label: 'Orders' },
    { value: VendureEntityType.COLLECTION, label: 'Collections' },
    { value: VendureEntityType.FACET, label: 'Facets' },
    { value: VendureEntityType.FACET_VALUE, label: 'Facet Values' },
    { value: VendureEntityType.PROMOTION, label: 'Promotions' },
    { value: VendureEntityType.ASSET, label: 'Assets' },
];

/** FTP/SFTP protocol options */
export const FTP_PROTOCOL_OPTIONS = [
    { value: 'ftp', label: 'FTP' },
    { value: 'sftp', label: 'SFTP' },
];


// ---------------------------------------------------------------------------
// File format visual metadata (served via GraphQL for file type icons)
// ---------------------------------------------------------------------------

/** Icon names (kebab-case Lucide) for each FileFormat, auto-derived from FILE_FORMAT_METADATA */
export const FILE_FORMAT_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(FILE_FORMAT_METADATA).map(([k, v]) => [k, v.icon]),
);

/** Hex color codes for each FileFormat, auto-derived from FILE_FORMAT_METADATA */
export const FILE_FORMAT_COLORS: Record<string, string> = Object.fromEntries(
    Object.entries(FILE_FORMAT_METADATA).map(([k, v]) => [k, v.color]),
);

export * from './config-schema-options';
