/**
 * Shared select option arrays for adapter schema definitions.
 *
 * Import these constants in handler registry files (loader-handler-registry.ts, extractor-handler-registry.ts, etc.)
 * to avoid duplicating option arrays across multiple adapter definitions.
 */
import { LoadStrategy, ConflictStrategy, FileFormat, FileEncoding, HttpMethod, PaginationType, TriggerType, QueueType, AckMode, VendureEntityType, DatabaseType, DatabasePaginationType, GraphQLPaginationType, SortOrder } from './enums';
import { ConnectionAuthType } from '../../shared/types/adapter-config.types';
import type { OptionValue, TypedOptionValue } from './enum-metadata';
import { LOAD_STRATEGY_METADATA, CONFLICT_STRATEGY_METADATA } from './enum-metadata';

/** Load strategy select options for loader adapter schemas (auto-derived from metadata; excludes delete strategies) */
export const LOAD_STRATEGY_OPTIONS = [LoadStrategy.CREATE, LoadStrategy.UPDATE, LoadStrategy.UPSERT]
    .map(value => ({ value, label: LOAD_STRATEGY_METADATA[value].label }));

/** Conflict resolution select options for loader adapter schemas (auto-derived from metadata; excludes MANUAL_QUEUE) */
export const CONFLICT_RESOLUTION_OPTIONS = [ConflictStrategy.SOURCE_WINS, ConflictStrategy.VENDURE_WINS, ConflictStrategy.MERGE]
    .map(value => ({ value, label: CONFLICT_STRATEGY_METADATA[value].label }));

// ---------------------------------------------------------------------------
// FILE_FORMAT_METADATA — single source of truth for every file format.
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


/** Single-source metadata for auth types — each type declares which scopes it belongs to */
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

/** Single-source metadata for HTTP methods — each method declares which scopes it belongs to */
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

/** HTTP method select options for extractors (GET, POST, PUT, PATCH — no DELETE) */
export const HTTP_METHOD_EXTRACT_OPTIONS = httpMethodsByScope('extract');

/** HTTP method select options for loaders (write operations: POST, PUT) */
export const HTTP_METHOD_WRITE_OPTIONS = httpMethodsByScope('write');

/** HTTP method select options for exporters/sinks (POST, PUT, PATCH) */
export const HTTP_METHOD_EXPORT_OPTIONS = httpMethodsByScope('export');

/** HTTP method select options for GET/POST only (enrichment operators, HTTP lookups) */
export const HTTP_METHOD_GET_POST_OPTIONS = httpMethodsByScope('enrich');

/** Auth type select options for HTTP destinations: NONE, BASIC, BEARER, API_KEY (auto-derived from AUTH_TYPE_METADATA) */
export const AUTH_TYPE_HTTP_DESTINATION_OPTIONS = authTypesByScope('destination');

/** S3 Select input serialization options (CSV/JSON only, as S3 Select supports only these) */
export const S3_SELECT_FORMAT_OPTIONS = [
    { value: FileFormat.CSV, label: 'CSV' },
    { value: FileFormat.JSON, label: 'JSON' },
];

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
    { value: 'add', label: 'Add' },
    { value: 'set', label: 'Set (replace)' },
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

/** Single-source metadata for database types — each type declares whether it supports CDC */
const DATABASE_TYPE_METADATA: Record<string, { label: string; supportsCDC: boolean }> = {
    [DatabaseType.POSTGRESQL]: { label: 'PostgreSQL', supportsCDC: true },
    [DatabaseType.MYSQL]:      { label: 'MySQL / MariaDB', supportsCDC: true },
    [DatabaseType.SQLITE]:     { label: 'SQLite', supportsCDC: false },
    [DatabaseType.MSSQL]:      { label: 'SQL Server', supportsCDC: false },
    [DatabaseType.ORACLE]:     { label: 'Oracle', supportsCDC: false },
};

/** Database type options for all database adapters (auto-derived from DATABASE_TYPE_METADATA) */
export const DATABASE_TYPE_OPTIONS = Object.entries(DATABASE_TYPE_METADATA)
    .map(([value, m]) => ({ value, label: m.label }));

/** Database type options for CDC (only supports PostgreSQL + MySQL — auto-derived from DATABASE_TYPE_METADATA) */
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

/** Incremental extraction column type options */
export const INCREMENTAL_COLUMN_TYPE_OPTIONS = [
    { value: 'timestamp', label: 'Timestamp' },
    { value: 'sequence', label: 'Sequence/Numeric' },
    { value: 'id', label: 'Auto-increment ID' },
];

/** HMAC/signature algorithm options */
export const SIGNATURE_ALGORITHM_OPTIONS = [
    { value: 'sha256', label: 'SHA-256' },
    { value: 'sha1', label: 'SHA-1' },
    { value: 'md5', label: 'MD5' },
];

/** Hash algorithm options for cryptographic hashing */
export const HASH_ALGORITHM_OPTIONS = [
    { value: 'md5', label: 'MD5' },
    { value: 'sha1', label: 'SHA-1' },
    { value: 'sha256', label: 'SHA-256' },
    { value: 'sha512', label: 'SHA-512' },
];

/** Hash output encoding options */
export const HASH_ENCODING_OPTIONS = [
    { value: 'hex', label: 'Hexadecimal' },
    { value: 'base64', label: 'Base64' },
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
// Config option arrays (served via GraphQL dataHubConfigOptions query)
// ---------------------------------------------------------------------------

/** Compression type options for export/feed destinations */
export const COMPRESSION_TYPES: OptionValue[] = [
    { value: 'NONE', label: 'None' },
    { value: 'GZIP', label: 'GZIP' },
    { value: 'ZIP', label: 'ZIP' },
];

/** New-record strategy options for import wizard (CREATE/SKIP/ERROR are wizard-internal values, not in LoadStrategy enum) */
export const NEW_RECORD_STRATEGIES: OptionValue[] = [
    { value: 'CREATE', label: 'Create new records', description: 'Create new records when no existing match is found' },
    { value: 'SKIP', label: 'Skip new records', description: 'Skip records that don\'t match existing entries' },
    { value: 'ERROR', label: 'Error on new record', description: 'Raise an error when encountering unmatched records' },
];

/** Cleanup strategy options for post-import record management */
export const CLEANUP_STRATEGIES: OptionValue[] = [
    { value: 'NONE', label: 'No Cleanup', description: 'Do not remove any records' },
    { value: 'UNPUBLISH_MISSING', label: 'Unpublish Missing', description: 'Unpublish records not in source' },
    { value: 'DELETE_MISSING', label: 'Delete Missing', description: 'Delete records not in source' },
];

/** Destination type options for export/feed delivery */
export const DESTINATION_TYPES: OptionValue[] = [
    { value: 'FILE', label: 'Local File', icon: 'folder-open' },
    { value: 'DOWNLOAD', label: 'Download', icon: 'folder-open' },
    { value: 'SFTP', label: 'SFTP Server', icon: 'server' },
    { value: 'FTP', label: 'FTP Server', icon: 'upload' },
    { value: 'HTTP', label: 'HTTP Endpoint', icon: 'send' },
    { value: 'S3', label: 'AWS S3', icon: 'cloud' },
    { value: 'WEBHOOK', label: 'Webhook', icon: 'globe' },
    { value: 'EMAIL', label: 'Email', icon: 'mail' },
    { value: 'LOCAL', label: 'Local Directory', icon: 'hard-drive' },
];

/** Common gate config fields shown for all approval types */
const GATE_COMMON_FIELDS: TypedOptionValue['fields'] = [
    { key: 'notifyWebhook', label: 'Notify Webhook', type: 'string', placeholder: 'https://hooks.example.com/gate-notify', description: 'Webhook URL to call when the gate is reached (optional)' },
    { key: 'notifyEmail', label: 'Notify Email', type: 'string', placeholder: 'approver@example.com', description: 'Email address to notify when the gate is reached (optional)' },
    { key: 'previewCount', label: 'Preview Count', type: 'number', placeholder: '10', description: 'Number of records to include in the gate preview (default: 10)' },
];

/** Approval type options for gate steps (with per-type field schemas) */
export const APPROVAL_TYPES: TypedOptionValue[] = [
    {
        value: 'MANUAL',
        label: 'Manual',
        description: 'Requires explicit human approval to proceed',
        fields: [...GATE_COMMON_FIELDS],
    },
    {
        value: 'THRESHOLD',
        label: 'Threshold',
        description: 'Auto-approve if error rate is below threshold',
        fields: [
            { key: 'errorThresholdPercent', label: 'Error Threshold (%)', type: 'number', placeholder: '10', description: 'Auto-approve if error rate is below this percentage (0-100)' },
            ...GATE_COMMON_FIELDS,
        ],
    },
    {
        value: 'TIMEOUT',
        label: 'Timeout',
        description: 'Auto-approve after a timeout period',
        fields: [
            { key: 'timeoutSeconds', label: 'Timeout (seconds)', type: 'number', placeholder: '300', description: 'Number of seconds to wait before auto-approving' },
            ...GATE_COMMON_FIELDS,
        ],
    },
];

/** Backoff strategy options for retry configuration */
export const BACKOFF_STRATEGIES: OptionValue[] = [
    { value: 'FIXED', label: 'Fixed', description: 'Wait a fixed duration between retries' },
    { value: 'EXPONENTIAL', label: 'Exponential', description: 'Double the wait time after each retry' },
];

/** Trigger type options with field schemas and wizard scope metadata */
export const TRIGGER_TYPE_SCHEMAS: TypedOptionValue[] = [
    {
        value: TriggerType.MANUAL,
        label: 'Manual',
        description: 'Run manually from the dashboard',
        icon: 'play',
        fields: [],
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.SCHEDULE,
        label: 'Schedule',
        description: 'Run on a cron schedule',
        icon: 'clock',
        fields: [
            { key: 'schedule', label: 'Cron Expression', type: 'string', required: true, placeholder: '* * * * *', description: 'Format: minute hour day month weekday', optionsRef: 'cronPresets' },
            { key: 'timezone', label: 'Timezone', type: 'string', placeholder: 'UTC (default)' },
        ],
        configKeyMap: { schedule: 'cron' },
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.WEBHOOK,
        label: 'Webhook',
        description: 'Trigger via HTTP webhook',
        icon: 'webhook',
        fields: [
            { key: 'webhookCode', label: 'Webhook Code', type: 'string', required: true, placeholder: 'my-webhook', description: 'Endpoint: /data-hub/webhook/{code}' },
            { key: 'authentication', label: 'Authentication', type: 'select', optionsRef: 'authTypes', defaultValue: 'NONE' },
            { key: 'secretCode', label: 'Secret', type: 'secret', placeholder: 'Select secret...' },
        ],
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.EVENT,
        label: 'Event',
        description: 'Trigger on Vendure events',
        icon: 'zap',
        fields: [
            { key: 'eventType', label: 'Event Type', type: 'select', required: true, optionsRef: 'vendureEvents', placeholder: 'Select event...' },
        ],
        wizardScopes: ['export'],
    },
    {
        value: TriggerType.FILE,
        label: 'File Watch',
        description: 'Watch for new files',
        icon: 'folder-open',
        fields: [
            { key: 'connectionCode', label: 'Connection Code', type: 'string', required: true, placeholder: 'my-sftp-connection' },
            { key: 'path', label: 'Watch Path', type: 'string', required: true, placeholder: '/incoming/*.csv', description: 'Glob patterns supported (e.g., *.csv, **/*.json)' },
        ],
        configKeyMap: { connectionCode: 'fileWatch.connectionCode', path: 'fileWatch.path' },
        wizardScopes: ['import'],
    },
    {
        value: TriggerType.MESSAGE,
        label: 'Message Queue',
        description: 'Trigger from message queue',
        icon: 'message-square',
        fields: [
            { key: 'queueType', label: 'Queue Type', type: 'select', required: true, optionsRef: 'queueTypes' },
            { key: 'connectionCode', label: 'Connection Code', type: 'string', required: true, placeholder: 'my-queue-connection', description: 'Reference to a connection with queue credentials' },
            { key: 'queueName', label: 'Queue Name', type: 'string', required: true, placeholder: 'my-queue' },
            { key: 'batchSize', label: 'Batch Size', type: 'number', defaultValue: 10, description: 'Messages per poll (1-100)' },
            { key: 'ackMode', label: 'Ack Mode', type: 'select', optionsRef: 'ackModes', defaultValue: 'MANUAL' },
            { key: 'consumerGroup', label: 'Consumer Group (Optional)', type: 'string', placeholder: 'datahub-consumers', description: 'Consumer group for Redis Streams or Kafka' },
            { key: 'deadLetterQueue', label: 'Dead Letter Queue (Optional)', type: 'string', placeholder: 'my-queue-dlq', description: 'Failed messages are routed here' },
            { key: 'autoStart', label: 'Auto-start consumer on startup', type: 'boolean', defaultValue: true },
        ],
        configKeyMap: {
            queueType: 'message.queueType',
            connectionCode: 'message.connectionCode',
            queueName: 'message.queueName',
            batchSize: 'message.batchSize',
            ackMode: 'message.ackMode',
            consumerGroup: 'message.consumerGroup',
            deadLetterQueue: 'message.deadLetterQueue',
            autoStart: 'message.autoStart',
        },
        wizardScopes: [],
    },
];

/** Enrichment source type options with field schemas for enrich steps */
export const ENRICHMENT_SOURCE_TYPES: TypedOptionValue[] = [
    {
        value: 'STATIC',
        label: 'Static',
        description: 'Use a static lookup map defined in the step config',
        fields: [
            { key: 'defaults', label: 'Default Values', type: 'keyValuePairs' },
        ],
    },
    {
        value: 'HTTP',
        label: 'HTTP',
        description: 'Fetch enrichment data from an HTTP endpoint',
        fields: [
            { key: 'endpoint', label: 'API Endpoint', type: 'string', required: true, placeholder: 'https://api.example.com/lookup', description: 'URL to fetch enrichment data. Use {{field}} for dynamic values.' },
            { key: 'matchField', label: 'Match Field', type: 'string', required: true, placeholder: 'sku', description: 'Record field to use for lookup matching' },
        ],
    },
    {
        value: 'VENDURE',
        label: 'Vendure',
        description: 'Query Vendure entities for enrichment data',
        fields: [
            { key: 'entity', label: 'Entity Type', type: 'entitySelect', required: true },
            { key: 'matchField', label: 'Match Field', type: 'string', required: true, placeholder: 'sku', description: 'Record field to match against Vendure entity' },
        ],
    },
];

/** Wizard strategy mappings: map wizard existingRecords option to backend load/conflict strategies */
export const WIZARD_STRATEGY_MAPPINGS: Array<{
    wizardValue: string;
    label: string;
    loadStrategy: string;
    conflictStrategy: string;
}> = [
    { wizardValue: 'SKIP', label: 'Skip existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'UPDATE', label: 'Update existing', loadStrategy: 'UPSERT', conflictStrategy: 'MERGE' },
    { wizardValue: 'REPLACE', label: 'Replace existing', loadStrategy: 'UPSERT', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'ERROR', label: 'Error on existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
];

/** Export query type options for the export wizard source step */
export const QUERY_TYPE_OPTIONS: OptionValue[] = [
    { value: 'all', label: 'All Records', description: 'Export all records of the selected entity' },
    { value: 'query', label: 'With Filters', description: 'Apply filter conditions to select records' },
    { value: 'graphql', label: 'Custom GraphQL', description: 'Write custom GraphQL query' },
];

/** Validation rule type options with field schemas for validate steps */
export const VALIDATION_RULE_TYPES: TypedOptionValue[] = [
    {
        value: 'REQUIRED',
        label: 'Required',
        description: 'Field must be present and non-empty',
        fields: [],
        defaultValues: { required: true },
    },
    {
        value: 'RANGE',
        label: 'Range',
        description: 'Numeric value must be within min/max bounds',
        fields: [
            { key: 'min', label: 'Min', type: 'number' },
            { key: 'max', label: 'Max', type: 'number' },
        ],
        defaultValues: { min: 0 },
    },
    {
        value: 'PATTERN',
        label: 'Pattern',
        description: 'Value must match a regular expression pattern',
        fields: [
            { key: 'pattern', label: 'Pattern', type: 'string', required: true, placeholder: '^[A-Z0-9]+$' },
        ],
        defaultValues: { pattern: '' },
    },
];

// ---------------------------------------------------------------------------
// File format visual metadata (served via GraphQL for file type icons)
// ---------------------------------------------------------------------------

/** Icon names (kebab-case Lucide) for each FileFormat — auto-derived from FILE_FORMAT_METADATA */
export const FILE_FORMAT_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(FILE_FORMAT_METADATA).map(([k, v]) => [k, v.icon]),
);

/** Cron schedule presets for schedule trigger configuration */
export const CRON_PRESETS: OptionValue[] = [
    { value: '* * * * *', label: 'Every minute', description: 'Runs every minute' },
    { value: '*/5 * * * *', label: 'Every 5 minutes', description: 'Runs every 5 minutes' },
    { value: '*/15 * * * *', label: 'Every 15 minutes', description: 'Runs every 15 minutes' },
    { value: '*/30 * * * *', label: 'Every 30 minutes', description: 'Runs every 30 minutes' },
    { value: '0 * * * *', label: 'Every hour', description: 'Runs at the start of every hour' },
    { value: '0 */2 * * *', label: 'Every 2 hours', description: 'Runs every 2 hours' },
    { value: '0 */6 * * *', label: 'Every 6 hours', description: 'Runs every 6 hours' },
    { value: '0 0 * * *', label: 'Daily at midnight', description: 'Runs daily at 00:00' },
    { value: '0 6 * * *', label: 'Daily at 6 AM', description: 'Runs daily at 06:00' },
    { value: '0 12 * * *', label: 'Daily at noon', description: 'Runs daily at 12:00' },
    { value: '0 0 * * 1', label: 'Weekly on Monday', description: 'Runs every Monday at midnight' },
    { value: '0 0 1 * *', label: 'Monthly on 1st', description: 'Runs on the 1st of each month' },
];

/** Acknowledgment mode options for message queue consumers */
export const ACK_MODE_OPTIONS: OptionValue[] = [
    { value: AckMode.AUTO, label: 'Auto', description: 'Messages are acknowledged automatically after processing' },
    { value: AckMode.MANUAL, label: 'Manual', description: 'Messages must be explicitly acknowledged by the pipeline' },
];

/** Hex color codes for each FileFormat — auto-derived from FILE_FORMAT_METADATA */
export const FILE_FORMAT_COLORS: Record<string, string> = Object.fromEntries(
    Object.entries(FILE_FORMAT_METADATA).map(([k, v]) => [k, v.color]),
);

