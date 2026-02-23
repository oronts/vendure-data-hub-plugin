/**
 * Diff entry type identifiers for pipeline revision comparison
 */
export enum DiffEntryType {
    STEP = 'STEP',
    TRIGGER = 'TRIGGER',
    HOOK = 'HOOK',
    EDGE = 'EDGE',
    CONFIG = 'CONFIG',
    META = 'META',
}

export enum TriggerType {
    MANUAL = 'MANUAL',
    SCHEDULE = 'SCHEDULE',
    WEBHOOK = 'WEBHOOK',
    EVENT = 'EVENT',
    FILE = 'FILE',
    MESSAGE = 'MESSAGE',
}

/**
 * Pipeline lifecycle status
 */
export enum PipelineStatus {
    DRAFT = 'DRAFT',
    REVIEW = 'REVIEW',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

export enum RevisionType {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
}

/**
 * Pipeline run execution status
 */
export enum RunStatus {
    PENDING = 'PENDING',
    QUEUED = 'QUEUED',
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    TIMEOUT = 'TIMEOUT',
    CANCELLED = 'CANCELLED',
    CANCEL_REQUESTED = 'CANCEL_REQUESTED',
}

/**
 * Pipeline step types that define processing stages
 */
export enum StepType {
    TRIGGER = 'TRIGGER',
    EXTRACT = 'EXTRACT',
    TRANSFORM = 'TRANSFORM',
    VALIDATE = 'VALIDATE',
    ENRICH = 'ENRICH',
    ROUTE = 'ROUTE',
    LOAD = 'LOAD',
    EXPORT = 'EXPORT',
    FEED = 'FEED',
    SINK = 'SINK',
    GATE = 'GATE',
}

/**
 * Adapter types in the pipeline
 */
export enum AdapterType {
    EXTRACTOR = 'EXTRACTOR',
    OPERATOR = 'OPERATOR',
    LOADER = 'LOADER',
    VALIDATOR = 'VALIDATOR',
    ENRICHER = 'ENRICHER',
    EXPORTER = 'EXPORTER',
    FEED = 'FEED',
    SINK = 'SINK',
    TRIGGER = 'TRIGGER',
    ROUTER = 'ROUTER',
}

/**
 * Adapter categories for organization
 */
export enum AdapterCategory {
    DATA_SOURCE = 'DATA_SOURCE',
    TRANSFORMATION = 'TRANSFORMATION',
    FILTERING = 'FILTERING',
    ENRICHMENT = 'ENRICHMENT',
    AGGREGATION = 'AGGREGATION',
    CONVERSION = 'CONVERSION',
    CATALOG = 'CATALOG',
    CUSTOMERS = 'CUSTOMERS',
    ORDERS = 'ORDERS',
    INVENTORY = 'INVENTORY',
    PROMOTIONS = 'PROMOTIONS',
    ASSETS = 'ASSETS',
    EXTERNAL = 'EXTERNAL',
    UTILITY = 'UTILITY',
}

/**
 * Load strategies for entity loaders
 */
export enum LoadStrategy {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    UPSERT = 'UPSERT',
    MERGE = 'MERGE',
    SOFT_DELETE = 'SOFT_DELETE',
    HARD_DELETE = 'HARD_DELETE',
}

/**
 * Conflict resolution strategies
 */
export enum ConflictStrategy {
    SOURCE_WINS = 'SOURCE_WINS',
    VENDURE_WINS = 'VENDURE_WINS',
    MERGE = 'MERGE',
    MANUAL_QUEUE = 'MANUAL_QUEUE',
}

/**
 * Channel assignment strategies
 */
export enum ChannelStrategy {
    EXPLICIT = 'EXPLICIT',
    INHERIT = 'INHERIT',
    MULTI = 'MULTI',
}

/**
 * Language handling strategies
 */
export enum LanguageStrategy {
    SPECIFIC = 'SPECIFIC',
    FALLBACK = 'FALLBACK',
    MULTI = 'MULTI',
}

/**
 * Hook stages in pipeline execution lifecycle
 */
export enum HookStage {
    BEFORE_EXTRACT = 'BEFORE_EXTRACT',
    AFTER_EXTRACT = 'AFTER_EXTRACT',
    BEFORE_TRANSFORM = 'BEFORE_TRANSFORM',
    AFTER_TRANSFORM = 'AFTER_TRANSFORM',
    BEFORE_VALIDATE = 'BEFORE_VALIDATE',
    AFTER_VALIDATE = 'AFTER_VALIDATE',
    BEFORE_ENRICH = 'BEFORE_ENRICH',
    AFTER_ENRICH = 'AFTER_ENRICH',
    BEFORE_ROUTE = 'BEFORE_ROUTE',
    AFTER_ROUTE = 'AFTER_ROUTE',
    BEFORE_LOAD = 'BEFORE_LOAD',
    AFTER_LOAD = 'AFTER_LOAD',
    ON_ERROR = 'ON_ERROR',
    ON_RETRY = 'ON_RETRY',
    ON_DEAD_LETTER = 'ON_DEAD_LETTER',
    PIPELINE_STARTED = 'PIPELINE_STARTED',
    PIPELINE_COMPLETED = 'PIPELINE_COMPLETED',
    PIPELINE_FAILED = 'PIPELINE_FAILED',
}

/**
 * Hook action types
 */
export enum HookActionType {
    WEBHOOK = 'WEBHOOK',
    EMIT = 'EMIT',
    TRIGGER_PIPELINE = 'TRIGGER_PIPELINE',
    LOG = 'LOG',
    INTERCEPTOR = 'INTERCEPTOR',
    SCRIPT = 'SCRIPT',
}

/**
 * Route condition comparison operators
 *
 * Values use lowercase for single words (eq, ne, gt) and
 * camelCase for multi-word codes (notIn, startsWith, endsWith)
 */
export enum RouteConditionOperator {
    EQ = 'eq',
    NE = 'ne',
    GT = 'gt',
    LT = 'lt',
    GTE = 'gte',
    LTE = 'lte',
    IN = 'in',
    NOT_IN = 'notIn',
    CONTAINS = 'contains',
    NOT_CONTAINS = 'notContains',
    STARTS_WITH = 'startsWith',
    ENDS_WITH = 'endsWith',
    MATCHES = 'matches',
    REGEX = 'regex',
    EXISTS = 'exists',
    IS_NULL = 'isNull',
}

/**
 * Pipeline run modes
 */
export enum RunMode {
    SYNC = 'SYNC',
    ASYNC = 'ASYNC',
    BATCH = 'BATCH',
    STREAM = 'STREAM',
}

/**
 * Drain strategies for error handling
 */
export enum DrainStrategy {
    BACKOFF = 'BACKOFF',
    SHED = 'SHED',
    QUEUE = 'QUEUE',
}

/**
 * Late events policy for windowed operations
 */
export enum LateEventsPolicy {
    DROP = 'DROP',
    BUFFER = 'BUFFER',
}

/**
 * Validation mode for transform operations
 */
export enum ValidationMode {
    FAIL_FAST = 'FAIL_FAST',
    ACCUMULATE = 'ACCUMULATE',
}

/**
 * Validation strictness for load operations
 */
export enum ValidationStrictness {
    STRICT = 'STRICT',
    LENIENT = 'LENIENT',
}

/**
 * Connection types for external services.
 *
 * These are the core backend connection types used by TypeORM entities and NestJS services.
 * The shared `CONNECTION_TYPE` in `shared/constants/index.ts` is a superset that includes
 * UI-specific subtypes (REST, GRAPHQL, POSTGRES, MYSQL, MSSQL, MONGODB, RABBITMQ, SQS, REDIS)
 * for richer connection configuration in the dashboard.
 */
export enum ConnectionType {
    HTTP = 'HTTP',
    S3 = 'S3',
    FTP = 'FTP',
    SFTP = 'SFTP',
    DATABASE = 'DATABASE',
    CUSTOM = 'CUSTOM',
}

import { ConnectionAuthType } from '../../shared/types/adapter-config.types';
export { ConnectionAuthType };

/**
 * Secret provider types
 */
export enum SecretProvider {
    INLINE = 'INLINE',
    ENV = 'ENV',
    EXTERNAL = 'EXTERNAL',
}

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
    MSSQL = 'MSSQL',
    ORACLE = 'ORACLE',
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

/**
 * Log persistence levels - controls what gets saved to database
 * Higher levels include all events from lower levels
 */
export enum LogPersistenceLevel {
    ERROR_ONLY = 'ERROR_ONLY',
    PIPELINE = 'PIPELINE',
    STEP = 'STEP',
    DEBUG = 'DEBUG',
}

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

/**
 * Checkpoint strategies for pipeline resumability
 */
export enum CheckpointStrategy {
    COUNT = 'COUNT',
    INTERVAL = 'INTERVAL',
    TIMESTAMP = 'TIMESTAMP',
}

/**
 * Error policies for parallel step execution
 */
export enum ParallelErrorPolicy {
    FAIL_FAST = 'FAIL_FAST',
    CONTINUE = 'CONTINUE',
    BEST_EFFORT = 'BEST_EFFORT',
}

/**
 * Message queue types for message triggers and queue sinks
 * Supported adapters:
 * - rabbitmq: RabbitMQ via HTTP Management API (fallback)
 * - rabbitmq-amqp: RabbitMQ via native AMQP protocol (recommended)
 * - sqs: AWS Simple Queue Service
 * - redis-streams: Redis Streams with consumer groups
 * - internal: In-memory queue for testing
 */
export enum QueueType {
    RABBITMQ = 'RABBITMQ',
    RABBITMQ_AMQP = 'RABBITMQ_AMQP',
    SQS = 'SQS',
    REDIS_STREAMS = 'REDIS_STREAMS',
    INTERNAL = 'INTERNAL',
}

/**
 * Message acknowledgment modes for queue consumers
 */
export enum AckMode {
    AUTO = 'AUTO',
    MANUAL = 'MANUAL',
}

/**
 * Batch transaction status for rollback tracking
 */
export enum BatchTransactionStatus {
    PENDING = 'PENDING',
    COMMITTED = 'COMMITTED',
    ROLLED_BACK = 'ROLLED_BACK',
    PARTIAL_ROLLBACK = 'PARTIAL_ROLLBACK',
}

/**
 * Metric status labels for pipeline run metrics
 */
export enum MetricStatus {
    STARTED = 'STARTED',
    COMPLETED = 'COMPLETED',
    COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
    FAILED = 'FAILED',
}

/**
 * User-facing run outcome status for timeline and risk context
 * Maps from internal RunStatus to simplified outcome labels
 */
export enum RunOutcome {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    PARTIAL = 'PARTIAL',
}

/**
 * Step execution status within a pipeline run
 */
export enum StepStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}

/**
 * Severity levels for logging and alerts
 */
export enum Severity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL',
}

/**
 * Sandbox execution status
 */
export enum SandboxStatus {
    SUCCESS = 'SUCCESS',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

/**
 * Sandbox step execution status
 */
export enum SandboxStepStatus {
    SUCCESS = 'SUCCESS',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    SKIPPED = 'SKIPPED',
}

/**
 * Record outcome after transformation in sandbox
 */
export enum RecordOutcome {
    SUCCESS = 'SUCCESS',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
    UNCHANGED = 'UNCHANGED',
}

/**
 * Field diff change types
 */
export enum FieldDiffChangeType {
    ADDED = 'ADDED',
    REMOVED = 'REMOVED',
    MODIFIED = 'MODIFIED',
    UNCHANGED = 'UNCHANGED',
    TYPE_CHANGED = 'TYPE_CHANGED',
}

/**
 * Validation issue severity levels
 */
export enum ValidationIssueSeverity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
}

/**
 * Record lineage final outcome
 */
export enum LineageOutcome {
    LOADED = 'LOADED',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
    SKIPPED = 'SKIPPED',
}

/**
 * Record processing state during pipeline execution
 */
export enum RecordProcessingState {
    ENTERING = 'ENTERING',
    TRANSFORMED = 'TRANSFORMED',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
}

/**
 * Risk assessment level
 */
export enum RiskLevel {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL',
}

/**
 * Risk warning severity
 */
export enum RiskSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    DANGER = 'DANGER',
}

/**
 * Duration estimate confidence level
 */
export enum EstimateConfidence {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
}

/**
 * Duration estimate basis
 */
export enum EstimateBasis {
    HISTORICAL = 'HISTORICAL',
    SAMPLING = 'SAMPLING',
    ESTIMATE = 'ESTIMATE',
}

/**
 * Sample record flow outcome
 */
export enum FlowOutcome {
    SUCCESS = 'SUCCESS',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
}

/**
 * Field change type for impact analysis
 */
export enum ImpactFieldChangeType {
    SET = 'SET',
    UPDATE = 'UPDATE',
    REMOVE = 'REMOVE',
    TRANSFORM = 'TRANSFORM',
}

/**
 * Rollback operation types
 */
export enum RollbackOperationType {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
}

/**
 * Span status for telemetry
 *
 * Values use lowercase to match OpenTelemetry span status conventions
 */
export enum SpanStatus {
    OK = 'ok',
    ERROR = 'error',
    CANCELLED = 'cancelled',
}

/**
 * Sandbox load operation result type
 *
 * Values use lowercase to match EntityOperations property names
 * which are used for object indexing in impact analysis
 */
export enum SandboxLoadResultType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    SKIP = 'skip',
    ERROR = 'error',
}

/**
 * Circuit breaker states for fault tolerance
 */
export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

/**
 * Lock backend types for distributed locking
 */
export enum LockBackendType {
    REDIS = 'REDIS',
    POSTGRES = 'POSTGRES',
    MEMORY = 'MEMORY',
}

/**
 * Extractor category types for organization and filtering
 * Maps to GraphQL DataHubExtractorCategory
 */
export enum ExtractorCategory {
    DATA_SOURCE = 'DATA_SOURCE',
    FILE_SYSTEM = 'FILE_SYSTEM',
    CLOUD_STORAGE = 'CLOUD_STORAGE',
    DATABASE = 'DATABASE',
    API = 'API',
    WEBHOOK = 'WEBHOOK',
    VENDURE = 'VENDURE',
    CUSTOM = 'CUSTOM',
}

/**
 * Specialized feed formats for product exports
 * Maps to GraphQL DataHubFeedFormat
 */
export enum FeedFormat {
    GOOGLE_SHOPPING = 'GOOGLE_SHOPPING',
    META_CATALOG = 'META_CATALOG',
    AMAZON = 'AMAZON',
    PINTEREST = 'PINTEREST',
    TIKTOK = 'TIKTOK',
    BING_SHOPPING = 'BING_SHOPPING',
    CSV = 'CSV',
    JSON = 'JSON',
    XML = 'XML',
    CUSTOM = 'CUSTOM',
}

/**
 * Target operation constants for entity loaders
 * Use these constants instead of string literals for type safety
 */
export const TARGET_OPERATION = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    UPSERT: 'UPSERT',
    MERGE: 'MERGE',
    DELETE: 'DELETE',
} as const;

/**
 * Timer types for scheduled pipeline execution
 */
export const TIMER_TYPE = {
    INTERVAL: 'INTERVAL',
    CRON: 'CRON',
    REFRESH: 'REFRESH',
} as const;
export type TimerType = typeof TIMER_TYPE[keyof typeof TIMER_TYPE];

/**
 * Outcome types for loader record processing
 */
export const OUTCOME_TYPE = {
    SKIP: 'SKIP',
    ERROR: 'ERROR',
    CONTINUE: 'CONTINUE',
} as const;
export type LoaderOutcomeType = typeof OUTCOME_TYPE[keyof typeof OUTCOME_TYPE];

/**
 * Field types for entity schema definitions
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

/**
 * Event kinds for pipeline event triggers
 */
export enum EventKind {
    PRODUCT = 'PRODUCT',
    VARIANT = 'VARIANT',
    ASSET = 'ASSET',
    COLLECTION = 'COLLECTION',
    CUSTOMER = 'CUSTOMER',
    ORDER_STATE = 'ORDER_STATE',
}

/**
 * Math operations for numeric transforms
 */
export enum MathOperation {
    ADD = 'ADD',
    SUBTRACT = 'SUBTRACT',
    MULTIPLY = 'MULTIPLY',
    DIVIDE = 'DIVIDE',
    MODULO = 'MODULO',
    POWER = 'POWER',
}

/**
 * Pad position for string padding
 */
export enum PadPosition {
    LEFT = 'LEFT',
    RIGHT = 'RIGHT',
}

/**
 * Lookup types for record lookups
 */
export enum LookupType {
    VENDURE_ENTITY = 'VENDURE_ENTITY',
    VALUE_MAP = 'VALUE_MAP',
    EXTERNAL = 'EXTERNAL',
}

/**
 * Filter action types
 */
export enum FilterAction {
    KEEP = 'KEEP',
    DROP = 'DROP',
}

/**
 * Pipeline validation error codes
 */
export const PIPELINE_VALIDATION_ERROR = {
    DUPLICATE_STEP_KEY: 'PIPELINE_DUPLICATE_STEP_KEY',
    INVALID_STEP_TYPE: 'PIPELINE_INVALID_STEP_TYPE',
    MISSING_CONFIG: 'PIPELINE_MISSING_CONFIG',
    INVALID_CONCURRENCY: 'PIPELINE_INVALID_CONCURRENCY',
    INVALID_EDGE: 'PIPELINE_INVALID_EDGE',
    EDGE_MISSING_NODES: 'PIPELINE_EDGE_MISSING_NODES',
    EDGE_UNKNOWN_SOURCE: 'PIPELINE_EDGE_UNKNOWN_SOURCE',
    EDGE_UNKNOWN_TARGET: 'PIPELINE_EDGE_UNKNOWN_TARGET',
    EDGE_SELF_LOOP: 'PIPELINE_EDGE_SELF_LOOP',
    EDGE_BRANCH_NON_ROUTE: 'PIPELINE_EDGE_BRANCH_NON_ROUTE',
    EDGE_UNKNOWN_BRANCH: 'PIPELINE_EDGE_UNKNOWN_BRANCH',
    ROUTE_MISSING_BRANCHES: 'PIPELINE_ROUTE_MISSING_BRANCHES',
    ROUTE_BRANCH_MISSING_NAME: 'PIPELINE_ROUTE_BRANCH_MISSING_NAME',
    ROUTE_BRANCH_DUPLICATE: 'PIPELINE_ROUTE_BRANCH_DUPLICATE',
    INVALID_ROOT_COUNT: 'PIPELINE_INVALID_ROOT_COUNT',
    INVALID_ROOT_TYPE: 'PIPELINE_INVALID_ROOT_TYPE',
    GRAPH_CYCLE: 'PIPELINE_GRAPH_CYCLE',
    NO_LOAD_REACHABLE: 'PIPELINE_NO_LOAD_REACHABLE',
    INVALID_DEFINITION: 'PIPELINE_INVALID_DEFINITION',
    INVALID_VERSION: 'PIPELINE_INVALID_VERSION',
} as const;

/**
 * Re-export DESTINATION_TYPE from shared constants (single source of truth).
 * The shared object includes DOWNLOAD (UI-only); runtime code should use the
 * narrowed DestinationType below for type safety.
 */
export { DESTINATION_TYPE } from '../../shared/constants';

/**
 * Runtime delivery destination type -- excludes 'DOWNLOAD' which is UI-only.
 */
export type DestinationType = Exclude<import('../../shared/types').DestinationType, 'DOWNLOAD'>;
