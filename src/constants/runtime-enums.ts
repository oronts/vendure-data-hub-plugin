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
    /** @deprecated Use RABBITMQ_AMQP. RabbitMQ discourages HTTP API publishing. */
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
    CSV = 'CSV',
    JSON = 'JSON',
    XML = 'XML',
    CUSTOM = 'CUSTOM',
}
