/**
 * AUTO-GENERATED - DO NOT EDIT
 * Run: npm run codegen
 */


/** TriggerType */
export const TRIGGER_TYPE = {
    MANUAL: 'MANUAL',
    SCHEDULE: 'SCHEDULE',
    WEBHOOK: 'WEBHOOK',
    EVENT: 'EVENT',
    FILE: 'FILE',
    MESSAGE: 'MESSAGE',
} as const;

/**
 * * Pipeline run execution status
 */
export const RUN_STATUS = {
    PENDING: 'PENDING',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    CANCEL_REQUESTED: 'CANCEL_REQUESTED',
} as const;

/**
 * * Pipeline step types that define processing stages
 */
export const STEP_TYPE = {
    TRIGGER: 'TRIGGER',
    EXTRACT: 'EXTRACT',
    TRANSFORM: 'TRANSFORM',
    VALIDATE: 'VALIDATE',
    ENRICH: 'ENRICH',
    ROUTE: 'ROUTE',
    LOAD: 'LOAD',
    EXPORT: 'EXPORT',
    FEED: 'FEED',
    SINK: 'SINK',
    GATE: 'GATE',
} as const;

/**
 * * Load strategies for entity loaders
 */
export const LOAD_STRATEGY = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    UPSERT: 'UPSERT',
    MERGE: 'MERGE',
    SOFT_DELETE: 'SOFT_DELETE',
    HARD_DELETE: 'HARD_DELETE',
} as const;

/**
 * * Conflict resolution strategies
 */
export const CONFLICT_STRATEGY = {
    SOURCE_WINS: 'SOURCE_WINS',
    VENDURE_WINS: 'VENDURE_WINS',
    MERGE: 'MERGE',
    MANUAL_QUEUE: 'MANUAL_QUEUE',
} as const;

/**
 * * Hook stages in pipeline execution lifecycle
 */
export const HOOK_STAGE = {
    BEFORE_EXTRACT: 'BEFORE_EXTRACT',
    AFTER_EXTRACT: 'AFTER_EXTRACT',
    BEFORE_TRANSFORM: 'BEFORE_TRANSFORM',
    AFTER_TRANSFORM: 'AFTER_TRANSFORM',
    BEFORE_VALIDATE: 'BEFORE_VALIDATE',
    AFTER_VALIDATE: 'AFTER_VALIDATE',
    BEFORE_ENRICH: 'BEFORE_ENRICH',
    AFTER_ENRICH: 'AFTER_ENRICH',
    BEFORE_ROUTE: 'BEFORE_ROUTE',
    AFTER_ROUTE: 'AFTER_ROUTE',
    BEFORE_LOAD: 'BEFORE_LOAD',
    AFTER_LOAD: 'AFTER_LOAD',
    BEFORE_EXPORT: 'BEFORE_EXPORT',
    AFTER_EXPORT: 'AFTER_EXPORT',
    BEFORE_FEED: 'BEFORE_FEED',
    AFTER_FEED: 'AFTER_FEED',
    BEFORE_SINK: 'BEFORE_SINK',
    AFTER_SINK: 'AFTER_SINK',
    ON_ERROR: 'ON_ERROR',
    ON_RETRY: 'ON_RETRY',
    ON_DEAD_LETTER: 'ON_DEAD_LETTER',
    PIPELINE_STARTED: 'PIPELINE_STARTED',
    PIPELINE_COMPLETED: 'PIPELINE_COMPLETED',
    PIPELINE_FAILED: 'PIPELINE_FAILED',
} as const;

/**
 * * Validation mode for transform operations
 */
export const VALIDATION_MODE = {
    FAIL_FAST: 'FAIL_FAST',
    ACCUMULATE: 'ACCUMULATE',
} as const;

/**
 * * Supported file formats for parsing and export
 */
export const FILE_FORMAT = {
    CSV: 'CSV',
    JSON: 'JSON',
    XML: 'XML',
    XLSX: 'XLSX',
    NDJSON: 'NDJSON',
    TSV: 'TSV',
    PARQUET: 'PARQUET',
} as const;

/**
 * * Checkpoint strategies for pipeline resumability
 */
export const CHECKPOINT_STRATEGY = {
    COUNT: 'COUNT',
    INTERVAL: 'INTERVAL',
    TIMESTAMP: 'TIMESTAMP',
} as const;

/**
 * * Message queue types for message triggers and queue sinks
 * Supported adapters:
 * - rabbitmq: RabbitMQ via HTTP Management API (fallback)
 * - rabbitmq-amqp: RabbitMQ via native AMQP protocol (recommended)
 * - sqs: AWS Simple Queue Service
 * - redis-streams: Redis Streams with consumer groups
 * - internal: In-memory queue for testing
 */
export const QUEUE_TYPE = {
    RABBITMQ: 'RABBITMQ',
    RABBITMQ_AMQP: 'RABBITMQ_AMQP',
    SQS: 'SQS',
    REDIS_STREAMS: 'REDIS_STREAMS',
    INTERNAL: 'INTERNAL',
} as const;

/**
 * * Message acknowledgment modes for queue consumers
 */
export const ACK_MODE = {
    AUTO: 'AUTO',
    MANUAL: 'MANUAL',
} as const;

/**
 * Export destination types for file/data delivery.
 * Backend runtime excludes DOWNLOAD (UI-only); use the narrowed
 * DestinationType from src/constants/enums.ts for runtime code.
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
 * Import source type constants for type-safe comparisons.
 */
export const SOURCE_TYPE = {
    FILE: 'FILE',
    API: 'API',
    DATABASE: 'DATABASE',
    WEBHOOK: 'WEBHOOK',
    CDC: 'CDC',
    FTP: 'FTP',
    S3: 'S3',
    GRAPHQL: 'GRAPHQL',
} as const;

/**
 * Export format type constants for type-safe comparisons.
 */
export const EXPORT_FORMAT = {
    CSV: 'CSV',
    JSON: 'JSON',
    XML: 'XML',
    XLSX: 'XLSX',
    NDJSON: 'NDJSON',
    PARQUET: 'PARQUET',
    GOOGLE_SHOPPING: 'GOOGLE_SHOPPING',
    META_CATALOG: 'META_CATALOG',
    AMAZON: 'AMAZON',
} as const;

/**
 * Cleanup strategy constants for type-safe comparisons.
 */
export const CLEANUP_STRATEGY = {
    NONE: 'NONE',
    UNPUBLISH_MISSING: 'UNPUBLISH_MISSING',
    DELETE_MISSING: 'DELETE_MISSING',
} as const;

/**
 * Compression type constants for type-safe comparisons.
 */
export const COMPRESSION_TYPE = {
    NONE: 'NONE',
    GZIP: 'GZIP',
    ZIP: 'ZIP',
} as const;