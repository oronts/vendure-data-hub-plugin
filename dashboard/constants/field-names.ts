/**
 * Field Name Constants
 *
 * CRITICAL: These constants define the canonical field names used in the DataHub plugin.
 * These MUST match the backend field names defined in src/types/shared/index.ts
 *
 * Using these constants ensures consistency between UI and backend and prevents
 * field name mismatches that can cause silent failures.
 *
 * CANONICAL FIELD NAMES:
 * ======================
 * - `cron` - Cron expression for schedule triggers
 * - `strategy` - Load strategy (create, update, upsert) - controls INSERT/UPDATE behavior
 * - `conflictResolution` - Conflict resolution (source-wins, vendure-wins, merge) - controls field conflicts
 * - `adapterCode` - Adapter identifier for steps
 * - `cmp` - Comparison operator for conditions
 */

// =============================================================================
// TRIGGER FIELD NAMES
// =============================================================================

/**
 * Canonical trigger field names
 * These MUST be used when configuring pipeline triggers in the UI
 */
export const TRIGGER_FIELDS = {
    /** Cron expression for schedule triggers (e.g., "0 * * * *") */
    CRON: 'cron',

    /** Timezone for schedule evaluation (e.g., "America/New_York") */
    TIMEZONE: 'timezone',

    /** Interval in seconds for interval-based triggers */
    INTERVAL_SECONDS: 'intervalSec',

    /** Webhook path/endpoint for webhook triggers */
    WEBHOOK_PATH: 'webhookPath',

    /** Webhook code for registered webhook lookup */
    WEBHOOK_CODE: 'webhookCode',

    /** Event type for event triggers (e.g., "ProductEvent") */
    EVENT_TYPE: 'eventType',

    /** Trigger type discriminator */
    TYPE: 'type',

    /** Whether trigger is enabled */
    ENABLED: 'enabled',
} as const;

// =============================================================================
// LOADER/STEP FIELD NAMES
// =============================================================================

/**
 * Canonical loader step field names
 */
export const LOADER_FIELDS = {
    /** Load strategy (create, update, upsert) - controls INSERT/UPDATE behavior */
    STRATEGY: 'strategy',

    /** Conflict resolution (source-wins, vendure-wins, merge) - controls field conflict behavior */
    CONFLICT_RESOLUTION: 'conflictResolution',

    /** Batch size for bulk operations */
    BATCH_SIZE: 'batchSize',

    /** Field used to match existing records for upsert */
    MATCH_FIELD: 'matchField',

    /** Channel code for multi-channel operations */
    CHANNEL: 'channel',

    // Field mappings (references to source data fields)
    NAME_FIELD: 'nameField',
    SLUG_FIELD: 'slugField',
    DESCRIPTION_FIELD: 'descriptionField',
    SKU_FIELD: 'skuField',
    PRICE_FIELD: 'priceField',
    EMAIL_FIELD: 'emailField',
    CODE_FIELD: 'codeField',
    ENABLED_FIELD: 'enabledField',
    STOCK_FIELD: 'stockField',
} as const;

/**
 * Load strategy values - controls INSERT/UPDATE behavior
 * - create: Only create new records, skip if exists
 * - update: Only update existing records, skip if not exists
 * - upsert: Create if not exists, update if exists
 */
export const LOAD_STRATEGIES = {
    CREATE: 'create',
    UPDATE: 'update',
    UPSERT: 'upsert',
} as const;

export type LoadStrategy = typeof LOAD_STRATEGIES[keyof typeof LOAD_STRATEGIES];

/**
 * Conflict resolution values - controls how to handle field conflicts on UPDATE
 * - source-wins: Overwrite all Vendure fields with source data
 * - vendure-wins: Keep existing Vendure data, don't update fields
 * - merge: Merge fields (only update non-empty source fields)
 */
export const CONFLICT_RESOLUTIONS = {
    SOURCE_WINS: 'source-wins',
    VENDURE_WINS: 'vendure-wins',
    MERGE: 'merge',
} as const;

export type ConflictResolution = typeof CONFLICT_RESOLUTIONS[keyof typeof CONFLICT_RESOLUTIONS];

// =============================================================================
// EXTRACTOR FIELD NAMES
// =============================================================================

/**
 * Canonical extractor step field names
 */
export const EXTRACTOR_FIELDS = {
    /** API endpoint URL */
    URL: 'url',
    /** HTTP method */
    METHOD: 'method',
    /** HTTP headers object */
    HEADERS: 'headers',
    /** Request body */
    BODY: 'body',

    // CSV specific
    DELIMITER: 'delimiter',
    HAS_HEADER: 'hasHeader',

    // File reference
    FILE_NAME: 'fileName',
    COLUMNS: 'columns',
    PREVIEW_DATA: 'previewData',

    // Connection
    CONNECTION_CODE: 'connectionCode',
} as const;

// =============================================================================
// EXPORT FIELD NAMES
// =============================================================================

/**
 * Canonical export step field names
 */
export const EXPORT_FIELDS = {
    /** Output filename pattern */
    FILENAME_PATTERN: 'filenamePattern',

    // S3 specific
    BUCKET: 'bucket',
    REGION: 'region',
    PREFIX: 'prefix',

    // SFTP specific
    HOST: 'host',
    PORT: 'port',
    USERNAME: 'username',
    REMOTE_PATH: 'remotePath',

    // Email specific
    TO: 'to',
    SUBJECT: 'subject',
} as const;

// =============================================================================
// FEED FIELD NAMES
// =============================================================================

/**
 * Canonical feed step field names
 */
export const FEED_FIELDS = {
    FEED_NAME: 'feedName',
    MERCHANT_ID: 'merchantId',
    TARGET_COUNTRY: 'targetCountry',
    SCHEDULE_ENABLED: 'scheduleEnabled',
    /** Cron expression for feed schedule - same as TRIGGER_FIELDS.CRON */
    CRON: 'cron',
} as const;

// =============================================================================
// TRANSFORM FIELD NAMES
// =============================================================================

/**
 * Canonical transform step field names
 */
export const TRANSFORM_FIELDS = {
    /** Field mappings object */
    MAPPINGS: 'mappings',
    /** Field mappings object (loader context) */
    FIELD_MAPPINGS: 'fieldMappings',
    /** Filter/condition expression */
    EXPRESSION: 'expression',
} as const;

// =============================================================================
// COMMON FIELD NAMES
// =============================================================================

/**
 * Common field names used across multiple step types
 */
export const COMMON_FIELDS = {
    /** Adapter code identifier */
    ADAPTER_CODE: 'adapterCode',
    /** Step/trigger type */
    TYPE: 'type',
    /** Configuration object */
    CONFIG: 'config',
    /** Step label/name */
    LABEL: 'label',
} as const;

// =============================================================================
// CONDITION FIELD NAMES
// =============================================================================

/**
 * Canonical condition/rule field names
 */
export const CONDITION_FIELDS = {
    /** Field path to evaluate */
    FIELD: 'field',
    /** Comparison operator (eq, ne, gt, lt, gte, lte, in, contains, regex) */
    CMP: 'cmp',
    /** Value to compare against */
    VALUE: 'value',
} as const;
