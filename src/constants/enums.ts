// ENUMS - Type-safe enumerations for DataHub

/**
 * Pipeline trigger types that initiate pipeline runs
 */
export enum TriggerType {
    MANUAL = 'manual',
    SCHEDULE = 'schedule',
    WEBHOOK = 'webhook',
    EVENT = 'event',
    FILE = 'file',
    MESSAGE = 'message',
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

/**
 * Pipeline run execution status
 */
export enum RunStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
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
}

/**
 * Adapter types in the pipeline
 */
export enum AdapterType {
    EXTRACTOR = 'extractor',
    OPERATOR = 'operator',
    LOADER = 'loader',
    VALIDATOR = 'validator',
    ENRICHER = 'enricher',
}

/**
 * Adapter categories for organization
 */
export enum AdapterCategory {
    DATA_SOURCE = 'data-source',
    TRANSFORMATION = 'transformation',
    FILTERING = 'filtering',
    ENRICHMENT = 'enrichment',
    AGGREGATION = 'aggregation',
    CONVERSION = 'conversion',
    CATALOG = 'catalog',
    CUSTOMERS = 'customers',
    ORDERS = 'orders',
    INVENTORY = 'inventory',
    PROMOTIONS = 'promotions',
    ASSETS = 'assets',
    EXTERNAL = 'external',
    UTILITY = 'utility',
}

/**
 * Load strategies for entity loaders
 */
export enum LoadStrategy {
    CREATE = 'create',
    UPDATE = 'update',
    UPSERT = 'upsert',
    MERGE = 'merge',
    SOFT_DELETE = 'soft-delete',
    HARD_DELETE = 'hard-delete',
}

/**
 * Conflict resolution strategies
 */
export enum ConflictStrategy {
    SOURCE_WINS = 'source-wins',
    VENDURE_WINS = 'vendure-wins',
    MERGE = 'merge',
    MANUAL_QUEUE = 'manual-queue',
}

/**
 * Channel assignment strategies
 */
export enum ChannelStrategy {
    EXPLICIT = 'explicit',
    INHERIT = 'inherit',
    MULTI = 'multi',
}

/**
 * Language handling strategies
 */
export enum LanguageStrategy {
    SPECIFIC = 'specific',
    FALLBACK = 'fallback',
    MULTI = 'multi',
}

/**
 * Service Context Enum
 */
export enum LOGGER_CONTEXTS {
    PIPELINE_SERVICE = 'PipelineService',
    PIPELINE_RUNNER = 'PipelineRunner',
    SECRET_SERVICE = 'SecretService',
    CONNECTION_SERVICE = 'ConnectionService',
    EVENT_TRIGGER_SERVICE = 'EventTriggerService',
    HOOK_SERVICE = 'HookService',
    DATABASE_EXTRACTOR = 'DatabaseExtractor',
    RATE_LIMIT = 'RateLimitService',
    WEBHOOK = 'WebhookController',
}

/**
 * Hook stages in pipeline execution lifecycle
 */
export enum HookStage {
    BEFORE_EXTRACT = 'beforeExtract',
    AFTER_EXTRACT = 'afterExtract',
    BEFORE_TRANSFORM = 'beforeTransform',
    AFTER_TRANSFORM = 'afterTransform',
    BEFORE_VALIDATE = 'beforeValidate',
    AFTER_VALIDATE = 'afterValidate',
    BEFORE_ENRICH = 'beforeEnrich',
    AFTER_ENRICH = 'afterEnrich',
    BEFORE_ROUTE = 'beforeRoute',
    AFTER_ROUTE = 'afterRoute',
    BEFORE_LOAD = 'beforeLoad',
    AFTER_LOAD = 'afterLoad',
    ON_ERROR = 'onError',
    ON_RETRY = 'onRetry',
    ON_DEAD_LETTER = 'onDeadLetter',
    PIPELINE_STARTED = 'pipelineStarted',
    PIPELINE_COMPLETED = 'pipelineCompleted',
    PIPELINE_FAILED = 'pipelineFailed',
}

/**
 * Hook action types
 */
export enum HookActionType {
    WEBHOOK = 'webhook',
    EMIT = 'emit',
    TRIGGER_PIPELINE = 'triggerPipeline',
}

/**
 * Route condition comparison operators
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
    REGEX = 'regex',
    EXISTS = 'exists',
    IS_NULL = 'isNull',
}

/**
 * Pipeline run modes
 */
export enum RunMode {
    SYNC = 'sync',
    ASYNC = 'async',
    BATCH = 'batch',
    STREAM = 'stream',
}

/**
 * Drain strategies for error handling
 */
export enum DrainStrategy {
    BACKOFF = 'backoff',
    SHED = 'shed',
    QUEUE = 'queue',
}

/**
 * Validation modes for data processing
 */
export enum ValidationMode {
    STRICT = 'strict',
    LENIENT = 'lenient',
}

/**
 * Connection types for external services
 */
export enum ConnectionType {
    HTTP = 'http',
    S3 = 's3',
    SFTP = 'sftp',
    DATABASE = 'database',
    CUSTOM = 'custom',
}

/**
 * Authentication types
 */
export enum AuthType {
    NONE = 'none',
    BASIC = 'basic',
    BEARER = 'bearer',
    API_KEY = 'api-key',
    OAUTH2 = 'oauth2',
    HMAC = 'hmac',
}

/**
 * Secret provider types
 */
export enum SecretProvider {
    INLINE = 'inline',
    ENV = 'env',
    EXTERNAL = 'external',
}

/**
 * Domain event types emitted during pipeline execution
 */
export enum DomainEventType {
    PIPELINE_STARTED = 'PipelineStarted',
    PIPELINE_COMPLETED = 'PipelineCompleted',
    PIPELINE_FAILED = 'PipelineFailed',
    RECORD_EXTRACTED = 'RecordExtracted',
    RECORD_TRANSFORMED = 'RecordTransformed',
    RECORD_VALIDATED = 'RecordValidated',
    RECORD_LOADED = 'RecordLoaded',
    RECORD_REJECTED = 'RecordRejected',
    RECORD_RETRIED = 'RecordRetried',
    RECORD_DEAD_LETTERED = 'RecordDeadLettered',
    RECORD_EXPORTED = 'RecordExported',
    RECORD_INDEXED = 'RecordIndexed',
    FEED_GENERATED = 'FeedGenerated',
}

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
 * Pagination types for extractors
 */
export enum PaginationType {
    NONE = 'none',
    OFFSET = 'offset',
    CURSOR = 'cursor',
    PAGE = 'page',
    LINK_HEADER = 'link-header',
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
    ISO_8859_1 = 'iso-8859-1',
    WINDOWS_1252 = 'windows-1252',
}

/**
 * Network error codes that are retryable
 */
export enum RetryableNetworkErrorCode {
    ECONNRESET = 'ECONNRESET',
    ETIMEDOUT = 'ETIMEDOUT',
    ENOTFOUND = 'ENOTFOUND',
}

/**
 * Error categories for logging and analytics
 */
export enum ErrorCategory {
    VALIDATION = 'validation',
    NETWORK = 'network',
    TIMEOUT = 'timeout',
    RATE_LIMIT = 'rate_limit',
    AUTH = 'auth',
    DATA = 'data',
    SYSTEM = 'system',
    UNKNOWN = 'unknown',
}

/**
 * Log persistence levels - controls what gets saved to database
 * Higher levels include all events from lower levels
 */
export enum LogPersistenceLevel {
    /** Only errors are persisted to database */
    ERROR_ONLY = 'ERROR_ONLY',
    /** Pipeline start/complete/fail + errors (default) */
    PIPELINE = 'PIPELINE',
    /** All pipeline events + step start/complete events */
    STEP = 'STEP',
    /** All events including debug-level information */
    DEBUG = 'DEBUG',
}
