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

/** Identifies whether a persisted resource is owned by deployed configuration. */
export enum ConfigurationSource {
    DATABASE = 'DATABASE',
    CODE_FIRST = 'CODE_FIRST',
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
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    TIMEOUT = 'TIMEOUT',
    CANCELLED = 'CANCELLED',
    CANCEL_REQUESTED = 'CANCEL_REQUESTED',
}

export enum DryRunMessageLevel {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export enum DryRunMessageCode {
    NO_RECORDS = 'NO_RECORDS',
    EXTRACT_ADAPTER = 'EXTRACT_ADAPTER',
    COMPLETED = 'COMPLETED',
    PROCESSED_RECORDS = 'PROCESSED_RECORDS',
    RECORD_ERROR = 'RECORD_ERROR',
    STEP_SIMULATION_SKIPPED = 'STEP_SIMULATION_SKIPPED',
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
    BEFORE_EXPORT = 'BEFORE_EXPORT',
    AFTER_EXPORT = 'AFTER_EXPORT',
    BEFORE_FEED = 'BEFORE_FEED',
    AFTER_FEED = 'AFTER_FEED',
    BEFORE_SINK = 'BEFORE_SINK',
    AFTER_SINK = 'AFTER_SINK',
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
 * Drain strategies for error handling
 */
export enum DrainStrategy {
    BACKOFF = 'BACKOFF',
    SHED = 'SHED',
    QUEUE = 'QUEUE',
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
 * Canonical saved connection types accepted by persistence and runtime validation.
 */
export enum ConnectionType {
    HTTP = 'HTTP',
    S3 = 'S3',
    FTP = 'FTP',
    SFTP = 'SFTP',
    CUSTOM = 'CUSTOM',
    POSTGRES = 'POSTGRES',
    MYSQL = 'MYSQL',
    RABBITMQ = 'RABBITMQ',
    SQS = 'SQS',
    REDIS = 'REDIS',
    REST = 'REST',
    GRAPHQL = 'GRAPHQL',
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

