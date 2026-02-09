/**
 * Runtime domain enums - Error handling, logging, telemetry, sandbox, and execution state
 */

/**
 * Error categories for logging and analytics
 *
 * Values use SCREAMING_SNAKE_CASE to match error code conventions
 */
export enum ErrorCategory {
    VALIDATION = 'VALIDATION',
    NETWORK = 'NETWORK',
    TIMEOUT = 'TIMEOUT',
    RATE_LIMIT = 'RATE_LIMIT',
    AUTH = 'AUTH',
    DATA = 'DATA',
    SYSTEM = 'SYSTEM',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Error codes for categorizing errors in pipeline execution
 *
 * Values use SCREAMING_SNAKE_CASE to match error code conventions
 */
export enum ErrorCode {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT = 'TIMEOUT',
    RATE_LIMITED = 'RATE_LIMITED',
    AUTH_ERROR = 'AUTH_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    CONFLICT = 'CONFLICT',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
    UNKNOWN = 'UNKNOWN',
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
 * Log persistence levels - controls what gets saved to database
 * Higher levels include all events from lower levels
 */
export enum LogPersistenceLevel {
    ERROR_ONLY = 'ERROR_ONLY',
    PIPELINE = 'PIPELINE',
    STEP = 'STEP',
    DEBUG = 'DEBUG',
}

export const LogLevel = {
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
} as const;
export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * Severity levels for logging and alerts
 *
 * Values use SCREAMING_SNAKE_CASE to match status/severity conventions
 */
export enum Severity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL',
}

/**
 * Circuit breaker states for fault tolerance
 *
 * Values use SCREAMING_SNAKE_CASE to match state conventions
 */
export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
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
 * Lock backend types for distributed locking
 *
 * Values use SCREAMING_SNAKE_CASE to match type conventions
 */
export enum LockBackendType {
    REDIS = 'REDIS',
    POSTGRES = 'POSTGRES',
    MEMORY = 'MEMORY',
}

/**
 * Sandbox execution status
 * Values use SCREAMING_SNAKE_CASE to match GraphQL DataHubSandboxStatus enum
 */
export enum SandboxStatus {
    SUCCESS = 'SUCCESS',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

/**
 * Sandbox step execution status
 * Values use SCREAMING_SNAKE_CASE to match GraphQL DataHubSandboxStepStatus enum
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
 * Validation issue severity levels
 * Values use SCREAMING_SNAKE_CASE to match GraphQL DataHubSandboxValidationSeverity enum
 */
export enum ValidationIssueSeverity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
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
 * Record processing state during pipeline execution
 *
 * Values use SCREAMING_SNAKE_CASE to match state conventions
 */
export enum RecordProcessingState {
    ENTERING = 'ENTERING',
    TRANSFORMED = 'TRANSFORMED',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
}

/**
 * Batch transaction status for rollback tracking
 *
 * Values use SCREAMING_SNAKE_CASE to match status conventions
 */
export enum BatchTransactionStatus {
    PENDING = 'PENDING',
    COMMITTED = 'COMMITTED',
    ROLLED_BACK = 'ROLLED_BACK',
    PARTIAL_ROLLBACK = 'PARTIAL_ROLLBACK',
}

/**
 * Metric status labels for pipeline run metrics
 *
 * Values use SCREAMING_SNAKE_CASE to match status conventions
 */
export enum MetricStatus {
    STARTED = 'STARTED',
    COMPLETED = 'COMPLETED',
    COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
    FAILED = 'FAILED',
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
    RECORD_RETRIED = 'RECORD_RETRIED',
    RECORD_DEAD_LETTERED = 'RECORD_DEAD_LETTERED',
    RECORD_EXPORTED = 'RECORD_EXPORTED',
    RECORD_INDEXED = 'RECORD_INDEXED',
    FEED_GENERATED = 'FEED_GENERATED',
}

/**
 * Drain strategies for error handling
 */
export const DrainStrategy = {
    BACKOFF: "BACKOFF",
    SHED: "SHED",
    QUEUE: "QUEUE",
} as const;
export type DrainStrategy = typeof DrainStrategy[keyof typeof DrainStrategy];

/**
 * Late events policy for windowed operations
 */
export enum LateEventsPolicy {
    DROP = 'drop',
    BUFFER = 'buffer',
}

/**
 * Validation mode for transform operations
 */
export const ValidationMode = {
    FAIL_FAST: "FAIL_FAST",
    ACCUMULATE: "ACCUMULATE",
} as const;
export type ValidationMode = typeof ValidationMode[keyof typeof ValidationMode];

/**
 * Validation strictness for load operations
 */
export const ValidationStrictness = {
    STRICT: "STRICT",
    LENIENT: "LENIENT",
} as const;
export type ValidationStrictness = typeof ValidationStrictness[keyof typeof ValidationStrictness];

/**
 * Message queue types for message triggers and queue sinks
 * Supported adapters:
 * - rabbitmq: RabbitMQ via HTTP Management API (fallback)
 * - rabbitmq-amqp: RabbitMQ via native AMQP protocol (recommended)
 * - sqs: AWS Simple Queue Service
 * - redis-streams: Redis Streams with consumer groups
 * - internal: In-memory queue for testing
 */
export const QueueType = {
    RABBITMQ: "RABBITMQ",
    RABBITMQ_AMQP: "RABBITMQ_AMQP",
    SQS: "SQS",
    REDIS: "REDIS_STREAMS",
    INTERNAL: "INTERNAL",
} as const;
export type QueueType = typeof QueueType[keyof typeof QueueType];

/**
 * Message acknowledgment modes for queue consumers
 */
export const AckMode = {
    AUTO: "AUTO",
    MANUAL: "MANUAL",
} as const;
export type AckMode = typeof AckMode[keyof typeof AckMode];

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
 * Field diff change types
 * Values use SCREAMING_SNAKE_CASE to match GraphQL DataHubSandboxFieldChangeType enum
 */
export enum FieldDiffChangeType {
    ADDED = 'ADDED',
    REMOVED = 'REMOVED',
    MODIFIED = 'MODIFIED',
    UNCHANGED = 'UNCHANGED',
    TYPE_CHANGED = 'TYPE_CHANGED',
}

/**
 * Field change types for aggregated changes
 */
export enum FieldChangeType {
    ADDED = 'ADDED',
    REMOVED = 'REMOVED',
    MODIFIED = 'MODIFIED',
    UNCHANGED = 'UNCHANGED',
    TYPE_CHANGED = 'TYPE_CHANGED',
}

/**
 * Field change type for impact analysis
 * Values use SCREAMING_SNAKE_CASE to match GraphQL DataHubFieldChangeType enum
 */
export enum ImpactFieldChangeType {
    SET = 'SET',
    UPDATE = 'UPDATE',
    REMOVE = 'REMOVE',
    TRANSFORM = 'TRANSFORM',
}

/**
 * Record lineage final outcome
 *
 * Values use SCREAMING_SNAKE_CASE to match outcome conventions
 */
export enum LineageOutcome {
    LOADED = 'LOADED',
    FILTERED = 'FILTERED',
    ERROR = 'ERROR',
    SKIPPED = 'SKIPPED',
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

