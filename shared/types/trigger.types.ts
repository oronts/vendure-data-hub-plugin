/**
 * Trigger Types
 *
 * This module defines types for pipeline triggers.
 * Trigger types use lowercase as per naming conventions.
 */

import { JsonValue, JsonObject } from './json.types';

/**
 * Types of triggers that can start a pipeline execution
 *
 * Uses lowercase as per naming convention for trigger types
 */
export type TriggerType =
    | 'manual'
    | 'schedule'
    | 'webhook'
    | 'event'
    | 'file'
    | 'message';

/**
 * Authentication types for webhook triggers
 *
 * Uses lowercase/kebab-case as configuration values
 */
export type WebhookAuthType =
    | 'none'
    | 'basic'
    | 'bearer'
    | 'api-key'
    | 'oauth2'
    | 'hmac'
    | 'jwt';

/** HMAC algorithm options for webhook signature verification */
export type HmacAlgorithm = 'SHA256' | 'SHA512' | 'SHA1';

/**
 * Operators for trigger condition evaluation
 *
 * Uses camelCase as per naming convention for operators
 */
export type TriggerConditionOperator =
    | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'exists';

/**
 * Condition for filtering trigger events
 */
export interface TriggerCondition {
    /** Field path to evaluate in the event payload */
    field: string;
    /** Comparison operator */
    operator: TriggerConditionOperator;
    /** Value to compare against */
    value: JsonValue;
}

/**
 * Configuration for schedule-based triggers
 */
export interface ScheduleTriggerConfig {
    /** Cron expression for scheduling (e.g., "0 0 * * *" for daily at midnight) */
    cron?: string;
    /** Interval in seconds for periodic execution */
    intervalSec?: number;
    /** Timezone for cron expressions (e.g., "Europe/Berlin") */
    timezone?: string;
    /** Start time for the schedule (ISO 8601) */
    startTime?: string;
    /** End time for the schedule (ISO 8601) */
    endTime?: string;
    /** Maximum concurrent executions allowed */
    maxConcurrent?: number;
}

/**
 * Configuration for webhook-based triggers
 */
export interface WebhookTriggerConfig {
    /** Custom path for the webhook endpoint */
    webhookPath?: string;
    /** Unique code for the webhook (auto-generated from pipeline code) */
    webhookCode?: string;
    /** HTTP method to accept */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Authentication type for the webhook */
    authentication?: WebhookAuthType;
    /** Secret code for HMAC authentication */
    secretCode?: string;
    /** Secret code containing the API key */
    apiKeySecretCode?: string;
    /** Header name for API key (default: x-api-key) */
    apiKeyHeaderName?: string;
    /** Prefix for API key value (e.g., "Bearer ") */
    apiKeyPrefix?: string;
    /** Secret code for Basic auth credentials */
    basicSecretCode?: string;
    /** Secret code for Bearer token */
    bearerSecretCode?: string;
    /** Secret code for JWT verification */
    jwtSecretCode?: string;
    /** Header name for JWT token (default: authorization) */
    jwtHeaderName?: string;
    /** Header name for HMAC signature (default: x-datahub-signature) */
    hmacHeaderName?: string;
    /** HMAC algorithm for signature verification */
    hmacAlgorithm?: HmacAlgorithm;
    /** Maximum requests per rate limit window */
    rateLimit?: number;
    /** Rate limit window in seconds */
    rateLimitWindow?: number;
    /** Require idempotency key header for deduplication */
    requireIdempotencyKey?: boolean;
    /** Custom header name for idempotency key */
    idempotencyKeyHeader?: string;
    /** TTL for idempotency key in seconds */
    idempotencyTtlSec?: number;
    /** Validate payload against schema */
    validatePayload?: boolean;
    /** JSON Schema for payload validation */
    payloadSchema?: JsonObject;
}

/**
 * Configuration for event-based triggers (Vendure events)
 */
export interface EventTriggerConfig {
    /** Event type to listen for (e.g., "ProductEvent", "OrderStateTransitionEvent") */
    eventType: string;
    /** Entity type filter (optional) */
    entityType?: string;
    /** Conditions to filter events */
    conditions?: TriggerCondition[];
    /** Debounce time in milliseconds for rapid events */
    debounceMs?: number;
    /** Batch multiple events together */
    batchSize?: number;
    /** Maximum wait time for batch in milliseconds */
    batchTimeoutMs?: number;
}

/**
 * Queue type values for message triggers
 *
 * Uses lowercase as configuration values
 */
export type QueueTypeValue = 'rabbitmq-amqp' | 'rabbitmq' | 'sqs' | 'redis-streams' | 'internal';

/**
 * Configuration for queue-based triggers
 */
export interface QueueTriggerConfig {
    /** Name of the queue to consume from */
    queueName: string;
    /** Type of message queue */
    queueType?: QueueTypeValue;
    /** Connection code for queue credentials */
    connectionCode?: string;
    /** Number of messages to prefetch */
    prefetchCount?: number;
    /** Visibility timeout for SQS-style queues */
    visibilityTimeoutSec?: number;
    /** Maximum retries before dead-lettering */
    maxRetries?: number;
    /** Dead-letter queue name */
    deadLetterQueue?: string;
}

/**
 * File watch events that can trigger a pipeline
 *
 * Uses SCREAMING_SNAKE_CASE as per naming convention for domain events
 */
export type FileWatchEvent = 'CREATE' | 'MODIFY' | 'DELETE';

/**
 * Configuration for file watch triggers
 */
export interface FileWatchTriggerConfig {
    /** Path to watch (local or remote) */
    path: string;
    /** Glob pattern to filter files */
    pattern?: string;
    /** Watch subdirectories recursively */
    recursive?: boolean;
    /** File events to watch for */
    events?: FileWatchEvent[];
    /** Debounce time in milliseconds */
    debounceMs?: number;
    /** Minimum file age in seconds before processing */
    minFileAge?: number;
    /** Connection code for remote file systems */
    connectionCode?: string;
    /** Polling interval for remote file systems */
    pollIntervalMs?: number;
}

/**
 * Message acknowledgment mode
 *
 * Uses lowercase as configuration values
 */
export type AckMode = 'auto' | 'manual';

/**
 * Configuration for message queue triggers
 */
export interface MessageTriggerConfig {
    /** Type of message queue */
    queueType: QueueTypeValue;
    /** Connection code for queue credentials */
    connectionCode: string;
    /** Queue name to consume from */
    queueName: string;
    /** Consumer group/tag for identification */
    consumerGroup?: string;
    /** Number of messages to process at once */
    batchSize?: number;
    /** Message acknowledgment mode */
    ackMode?: AckMode;
    /** Maximum retries before dead-lettering */
    maxRetries?: number;
    /** Dead-letter queue name */
    deadLetterQueue?: string;
    /** Polling interval in milliseconds */
    pollIntervalMs?: number;
    /** Parallel message processing limit */
    concurrency?: number;
    /** Start consuming when pipeline is published */
    autoStart?: boolean;
    /** Number of messages to prefetch */
    prefetch?: number;
    /** Additional binding arguments for RabbitMQ */
    bindingArgs?: Record<string, JsonValue>;
    /** Expression to filter messages before processing */
    filterExpression?: string;
}

/**
 * Unified trigger configuration
 */
export interface TriggerConfig {
    /** Type of trigger */
    type: TriggerType;
    /** Whether the trigger is enabled */
    enabled?: boolean;
    /** Schedule trigger configuration */
    schedule?: ScheduleTriggerConfig;
    /** Webhook trigger configuration */
    webhook?: WebhookTriggerConfig;
    /** Event trigger configuration */
    event?: EventTriggerConfig;
    /** Queue trigger configuration */
    queue?: QueueTriggerConfig;
    /** Message trigger configuration */
    message?: MessageTriggerConfig;
    /** File watch trigger configuration */
    fileWatch?: FileWatchTriggerConfig;
    /** Conditions to filter trigger events */
    conditions?: TriggerCondition[];
    /** Maximum retries on failure */
    maxRetries?: number;
    /** Delay between retries in milliseconds */
    retryDelayMs?: number;
    /** Timeout for trigger execution in milliseconds */
    timeoutMs?: number;
    /** Event type for event triggers (shorthand) */
    eventType?: string;
}

/**
 * Pipeline trigger with flattened configuration options
 *
 * Extends TriggerConfig with commonly-used fields lifted to the top level
 * for convenience in pipeline definitions.
 */
export interface PipelineTrigger extends TriggerConfig {
    /** Cron expression (schedule triggers) */
    cron?: string;
    /** Timezone for cron (schedule triggers) */
    timezone?: string;
    /** Interval in seconds (schedule triggers) */
    intervalSec?: number;
    /** Webhook path (webhook triggers) */
    webhookPath?: string;
    /** Webhook code (webhook triggers) */
    webhookCode?: string;
    /** HTTP method (webhook triggers) */
    method?: 'GET' | 'POST' | 'PUT';
    /** Authentication type (webhook triggers) */
    authentication?: WebhookAuthType;
    /** Secret code for auth (webhook triggers) */
    secretCode?: string;
    /** API key secret code (webhook triggers) */
    apiKeySecretCode?: string;
    /** API key header name (webhook triggers) */
    apiKeyHeaderName?: string;
    /** API key prefix (webhook triggers) */
    apiKeyPrefix?: string;
    /** Basic auth secret code (webhook triggers) */
    basicSecretCode?: string;
    /** JWT secret code (webhook triggers) */
    jwtSecretCode?: string;
    /** JWT header name (webhook triggers) */
    jwtHeaderName?: string;
    /** HMAC header name (webhook triggers) */
    hmacHeaderName?: string;
    /** HMAC algorithm (webhook triggers) */
    hmacAlgorithm?: HmacAlgorithm;
    /** Rate limit (webhook triggers) */
    rateLimit?: number;
    /** Require idempotency key (webhook triggers) */
    requireIdempotencyKey?: boolean;
    /** Event type (event triggers) */
    eventType?: string;
}
