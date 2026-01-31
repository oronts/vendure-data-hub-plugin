/**
 * Shared Types and Field Constants
 *
 * CRITICAL: This file defines the CANONICAL field names that MUST be used
 * consistently across both the backend and UI (dashboard).
 *
 * When adding new fields or config options:
 * 1. Define the field name constant here
 * 2. Use the constant in both backend types and UI components
 * 3. Never hardcode field names in UI components
 *
 * CANONICAL FIELD NAMES (standardized):
 * =====================================
 * - Export output: `path` (not `outputPath`)
 * - Webhook URL: `url` (not `endpoint`)
 * - Step success count: `ok` (not `out`)
 * - Cron expression: `cron` (not `cronExpr`)
 * - Load strategy: `strategy` (not `operation`) - controls INSERT/UPDATE behavior
 * - Conflict resolution: `conflictResolution` - controls field conflict behavior on UPDATE
 *
 * All fallbacks and aliases have been removed. Use only canonical names.
 */

// =============================================================================
// TRIGGER FIELD NAMES
// =============================================================================

/**
 * Canonical trigger field names
 * Use only these field names - no fallbacks or aliases.
 */
export const TRIGGER_FIELDS = {
    /** Cron expression for schedule triggers (e.g., "0 * * * *") */
    CRON: 'cron',

    /** Timezone for schedule evaluation (e.g., "America/New_York") */
    TIMEZONE: 'timezone',

    /** Interval in seconds for interval-based triggers */
    INTERVAL_SECONDS: 'intervalSec',

    /** Webhook path/endpoint (UI convention) */
    WEBHOOK_PATH: 'webhookPath',
    /** Webhook code (backend convention - use for webhook lookup) */
    WEBHOOK_CODE: 'webhookCode',

    /** Event type for event triggers (e.g., "ProductEvent") */
    EVENT_TYPE: 'eventType',

    /** Trigger type discriminator */
    TYPE: 'type',

    /** Whether trigger is enabled */
    ENABLED: 'enabled',

    /** Connection code for file watch triggers */
    CONNECTION_CODE: 'connectionCode',

    /** File path for file watch triggers */
    PATH: 'path',

    /** File pattern (glob) for file watch triggers */
    PATTERN: 'pattern',

    /** Poll interval in milliseconds for file watch */
    POLL_INTERVAL_MS: 'pollIntervalMs',
} as const;

/**
 * Trigger types - consistent across UI and backend
 */
export const TRIGGER_TYPES = {
    MANUAL: 'manual',
    SCHEDULE: 'schedule',
    WEBHOOK: 'webhook',
    EVENT: 'event',
    FILE: 'file',
    MESSAGE: 'message',
} as const;

export type TriggerTypeValue = typeof TRIGGER_TYPES[keyof typeof TRIGGER_TYPES];

// =============================================================================
// LOADER/STEP FIELD NAMES
// =============================================================================

/**
 * Canonical loader field names
 * Use only these field names - no fallbacks or aliases.
 */
export const LOADER_FIELDS = {
    /** Load strategy (create, update, upsert) - controls INSERT/UPDATE behavior */
    STRATEGY: 'strategy',

    /** Conflict resolution (source-wins, vendure-wins, merge) - controls field conflicts on UPDATE */
    CONFLICT_RESOLUTION: 'conflictResolution',

    /** Batch size for bulk operations */
    BATCH_SIZE: 'batchSize',

    /** Field used to match existing records */
    MATCH_FIELD: 'matchField',

    /** Channel code for multi-channel operations */
    CHANNEL: 'channel',

    // Field mapping conventions (source field references)
    NAME_FIELD: 'nameField',
    SLUG_FIELD: 'slugField',
    DESCRIPTION_FIELD: 'descriptionField',
    SKU_FIELD: 'skuField',
    PRICE_FIELD: 'priceField',
    EMAIL_FIELD: 'emailField',
    CODE_FIELD: 'codeField',
    ENABLED_FIELD: 'enabledField',
    STOCK_FIELD: 'stockField',
    STOCK_ON_HAND_FIELD: 'stockOnHandField',
    STOCK_ALLOCATED_FIELD: 'stockAllocatedField',
    URL_FIELD: 'urlField',
} as const;

/**
 * Load strategies - controls INSERT/UPDATE behavior
 * - create: Only create new records, skip if exists
 * - update: Only update existing records, skip if not exists
 * - upsert: Create if not exists, update if exists
 */
export const LOAD_STRATEGIES = {
    CREATE: 'create',
    UPDATE: 'update',
    UPSERT: 'upsert',
    MERGE: 'merge',
    SOFT_DELETE: 'soft-delete',
    HARD_DELETE: 'hard-delete',
} as const;

export type LoadStrategyValue = typeof LOAD_STRATEGIES[keyof typeof LOAD_STRATEGIES];

/**
 * Conflict resolution strategies - controls how to handle field conflicts on UPDATE
 * - source-wins: Overwrite all Vendure fields with source data
 * - vendure-wins: Keep existing Vendure data, don't update fields
 * - merge: Merge fields (only update non-empty source fields)
 */
export const CONFLICT_RESOLUTIONS = {
    SOURCE_WINS: 'source-wins',
    VENDURE_WINS: 'vendure-wins',
    MERGE: 'merge',
    MANUAL_QUEUE: 'manual-queue',
} as const;

export type ConflictResolutionValue = typeof CONFLICT_RESOLUTIONS[keyof typeof CONFLICT_RESOLUTIONS];

// =============================================================================
// EXTRACTOR FIELD NAMES
// =============================================================================

/**
 * Canonical extractor field names
 * Use only these field names - no fallbacks or aliases.
 */
export const EXTRACTOR_FIELDS = {
    /** API endpoint URL (canonical) */
    URL: 'url',
    /** HTTP method */
    METHOD: 'method',
    /** HTTP headers */
    HEADERS: 'headers',
    /** Request body (for POST) */
    BODY: 'body',
    /** Query parameters */
    QUERY: 'query',

    // CSV specific
    /** CSV text content */
    CSV_TEXT: 'csvText',
    /** CSV file path */
    CSV_PATH: 'csvPath',
    /** Column delimiter */
    DELIMITER: 'delimiter',
    /** Whether file has header row */
    HAS_HEADER: 'hasHeader',

    // Pagination
    /** Pagination config object */
    PAGINATION: 'pagination',
    /** Page parameter name */
    PAGE_PARAM: 'pageParam',
    /** Items field path in response */
    ITEMS_FIELD: 'itemsField',
    /** Next page field path */
    NEXT_PAGE_FIELD: 'nextPageField',
    /** Maximum pages to fetch */
    MAX_PAGES: 'maxPages',

    // Connection/Auth
    /** Connection code reference */
    CONNECTION_CODE: 'connectionCode',
    /** Bearer token secret reference */
    BEARER_TOKEN_SECRET_CODE: 'bearerTokenSecretCode',
    /** Basic auth secret reference */
    BASIC_SECRET_CODE: 'basicSecretCode',
    /** HMAC secret reference */
    HMAC_SECRET_CODE: 'hmacSecretCode',
} as const;

// =============================================================================
// EXPORT FIELD NAMES
// =============================================================================

/**
 * Canonical export field names
 * Use only these field names - no fallbacks or aliases.
 */
export const EXPORT_FIELDS = {
    /** Output format (csv, json, xml, etc.) */
    FORMAT: 'format',
    /** Export target (file, api, s3, sftp, etc.) */
    TARGET: 'target',

    // File output
    /** Output file path */
    PATH: 'path',
    /** Output filename */
    FILENAME: 'filename',
    /** Filename pattern with placeholders */
    FILENAME_PATTERN: 'filenamePattern',
    /** Compression type */
    COMPRESS: 'compress',

    // S3 specific
    /** S3 bucket name */
    BUCKET: 'bucket',
    /** AWS region */
    REGION: 'region',
    /** S3 key prefix */
    PREFIX: 'prefix',

    // SFTP specific
    /** SFTP host */
    HOST: 'host',
    /** SFTP port */
    PORT: 'port',
    /** SFTP username */
    USERNAME: 'username',
    /** Remote path */
    REMOTE_PATH: 'remotePath',
    /** Password secret reference */
    PASSWORD_SECRET_CODE: 'passwordSecretCode',

    // Email specific
    /** Email recipient(s) */
    TO: 'to',
    /** Email subject */
    SUBJECT: 'subject',

    // CSV options
    /** Include header row */
    INCLUDE_HEADER: 'includeHeader',
    /** Quote all strings */
    QUOTE_STRINGS: 'quoteStrings',

    // Field selection
    /** Fields to include */
    FIELDS: 'fields',
    /** Fields to exclude */
    EXCLUDE_FIELDS: 'excludeFields',
    /** Field name mappings */
    FIELD_MAPPING: 'fieldMapping',
} as const;

// =============================================================================
// FEED FIELD NAMES
// =============================================================================

/**
 * Canonical feed field names
 */
export const FEED_FIELDS = {
    /** Feed type (google-merchant, meta-catalog, etc.) */
    FEED_TYPE: 'feedType',
    /** Feed name */
    FEED_NAME: 'feedName',
    /** Output format */
    FORMAT: 'format',

    // Google Merchant specific
    /** Merchant Center ID */
    MERCHANT_ID: 'merchantId',
    /** Target country code */
    TARGET_COUNTRY: 'targetCountry',
    /** Content language */
    CONTENT_LANGUAGE: 'contentLanguage',
    /** Currency code */
    CURRENCY: 'currency',

    // Meta Catalog specific
    /** Catalog ID */
    CATALOG_ID: 'catalogId',
    /** Business ID */
    BUSINESS_ID: 'businessId',

    // Feed options
    /** Include product variants */
    INCLUDE_VARIANTS: 'includeVariants',
    /** Include out of stock items */
    INCLUDE_OUT_OF_STOCK: 'includeOutOfStock',
    /** Whether prices include tax */
    PRICES_INCLUDE_TAX: 'pricesIncludeTax',
} as const;

// =============================================================================
// TRANSFORM FIELD NAMES
// =============================================================================

/**
 * Canonical transform/operator field names
 */
export const TRANSFORM_FIELDS = {
    /** Operators array */
    OPERATORS: 'operators',
    /** Single operator code */
    OP: 'op',
    /** Operator arguments */
    ARGS: 'args',
    /** Field mappings for field-mapper */
    MAPPINGS: 'mappings',
    /** Filter expression */
    EXPRESSION: 'expression',
} as const;

// =============================================================================
// THROUGHPUT/RATE LIMITING FIELD NAMES
// =============================================================================

/**
 * Canonical throughput/rate limiting field names
 */
export const THROUGHPUT_FIELDS = {
    /** Rate limit in requests per second */
    RATE_LIMIT_RPS: 'rateLimitRps',
    /** Concurrency level */
    CONCURRENCY: 'concurrency',
    /** Batch size */
    BATCH_SIZE: 'batchSize',
    /** Error rate threshold for pause */
    PAUSE_ON_ERROR_RATE: 'pauseOnErrorRate',
    /** Threshold value for pause */
    THRESHOLD: 'threshold',
    /** Interval in seconds for rate checking */
    INTERVAL_SEC: 'intervalSec',
    /** Backpressure drain strategy */
    DRAIN_STRATEGY: 'drainStrategy',
} as const;

// =============================================================================
// COMMON CONFIG FIELD NAMES
// =============================================================================

/**
 * Common config field names used across multiple step types
 */
export const COMMON_FIELDS = {
    /** Adapter code identifier */
    ADAPTER_CODE: 'adapterCode',
    /** Step type */
    TYPE: 'type',
    /** Configuration object */
    CONFIG: 'config',
    /** Whether step is async */
    ASYNC: 'async',
    /** Throughput configuration */
    THROUGHPUT: 'throughput',
    /** Connection code reference */
    CONNECTION_CODE: 'connectionCode',
} as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Trigger configuration interface using canonical field names
 */
export interface CanonicalTriggerConfig {
    type: TriggerTypeValue;
    enabled?: boolean;

    // Schedule trigger fields
    [TRIGGER_FIELDS.CRON]?: string;
    [TRIGGER_FIELDS.TIMEZONE]?: string;
    [TRIGGER_FIELDS.INTERVAL_SECONDS]?: number;

    // Webhook trigger fields
    [TRIGGER_FIELDS.WEBHOOK_PATH]?: string;
    [TRIGGER_FIELDS.WEBHOOK_CODE]?: string;

    // Event trigger fields
    [TRIGGER_FIELDS.EVENT_TYPE]?: string;

    // File trigger fields
    [TRIGGER_FIELDS.CONNECTION_CODE]?: string;
    [TRIGGER_FIELDS.PATH]?: string;
    [TRIGGER_FIELDS.PATTERN]?: string;
    [TRIGGER_FIELDS.POLL_INTERVAL_MS]?: number;
}

/**
 * Loader step configuration interface using canonical field names
 */
export interface CanonicalLoaderConfig {
    adapterCode: string;
    [LOADER_FIELDS.STRATEGY]?: LoadStrategyValue;
    [LOADER_FIELDS.CONFLICT_RESOLUTION]?: ConflictResolutionValue;
    [LOADER_FIELDS.BATCH_SIZE]?: number;
    [LOADER_FIELDS.MATCH_FIELD]?: string;
    [LOADER_FIELDS.CHANNEL]?: string;

    // Field mappings
    [LOADER_FIELDS.NAME_FIELD]?: string;
    [LOADER_FIELDS.SLUG_FIELD]?: string;
    [LOADER_FIELDS.DESCRIPTION_FIELD]?: string;
    [LOADER_FIELDS.SKU_FIELD]?: string;
    [LOADER_FIELDS.PRICE_FIELD]?: string;
    [LOADER_FIELDS.EMAIL_FIELD]?: string;

    // Allow additional properties
    [key: string]: unknown;
}

// =============================================================================
// STEP RESULT FIELD NAMES
// =============================================================================

/**
 * Canonical step result field names
 * Use only these field names - no fallbacks or aliases.
 */
export const STEP_RESULT_FIELDS = {
    /** Number of successfully processed records */
    OK: 'ok',
    /** Number of failed records */
    FAIL: 'fail',
    /** Duration in milliseconds */
    DURATION_MS: 'durationMs',
    /** Step key identifier */
    STEP_KEY: 'stepKey',
    /** Step type */
    TYPE: 'type',
    /** Adapter code */
    ADAPTER_CODE: 'adapterCode',
    /** Counter metrics */
    COUNTERS: 'counters',
} as const;

// =============================================================================
// WEBHOOK FIELD NAMES
// =============================================================================

/**
 * Canonical webhook field names
 * Use only these field names - no fallbacks or aliases.
 */
export const WEBHOOK_FIELDS = {
    /** Webhook URL endpoint (canonical - not 'endpoint') */
    URL: 'url',
    /** HTTP method */
    METHOD: 'method',
    /** Request headers */
    HEADERS: 'headers',
    /** Batch size for sending records */
    BATCH_SIZE: 'batchSize',
    /** Bearer token secret code */
    BEARER_TOKEN_SECRET_CODE: 'bearerTokenSecretCode',
    /** Basic auth secret code */
    BASIC_SECRET_CODE: 'basicSecretCode',
    /** Timeout in milliseconds */
    TIMEOUT_MS: 'timeoutMs',
} as const;
