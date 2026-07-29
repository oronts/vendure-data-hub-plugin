/**
 * Trigger Types
 */

import { JsonValue } from './json.types';

/**
 * Types of triggers that can start a pipeline execution
 */
export type TriggerType =
    | 'MANUAL'
    | 'SCHEDULE'
    | 'WEBHOOK'
    | 'EVENT'
    | 'FILE'
    | 'MESSAGE';

/**
 * Authentication types for webhook triggers
 */
export type WebhookAuthType =
    | 'NONE'
    | 'BASIC'
    | 'API_KEY'
    | 'HMAC'
    | 'JWT';

/** HMAC algorithm options for webhook signature verification */
export type HmacAlgorithm = 'SHA256' | 'SHA512';

/** Vendure 3.5 domain events supported by EVENT pipeline triggers. */
export const VENDURE_EVENT_TYPES = [
    'ProductEvent',
    'ProductVariantEvent',
    'ProductVariantPriceEvent',
    'CollectionModificationEvent',
    'AssetEvent',
    'StockMovementEvent',
    'OrderStateTransitionEvent',
    'OrderPlacedEvent',
    'RefundStateTransitionEvent',
    'PaymentStateTransitionEvent',
    'CustomerEvent',
    'AccountRegistrationEvent',
    'CustomerAddressEvent',
] as const;

export type VendureEventType = (typeof VENDURE_EVENT_TYPES)[number];

/**
 * Operators for trigger condition evaluation
 *
 * Values are lowercase/camelCase (serialized to DB, changing requires migration)
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
}

/**
 * Configuration for webhook-based triggers
 */
export interface WebhookTriggerConfig {
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
    /** Secret code for JWT verification */
    jwtSecretCode?: string;
    /** Header name for JWT token (default: authorization) */
    jwtHeaderName?: string;
    /** Required JWT issuer claim */
    jwtIssuer?: string;
    /** Required JWT audience claim */
    jwtAudience?: string;
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
}

/**
 * Configuration for event-based triggers (Vendure events)
 */
export interface EventTriggerConfig {
    /** Exact Vendure event class name to subscribe to. */
    event: VendureEventType;
}

/**
 * Queue type values for message triggers
 */
export type QueueTypeValue = 'RABBITMQ_AMQP' | 'SQS' | 'REDIS_STREAMS' | 'INTERNAL';

/**
 * Configuration for file watch triggers
 */
export interface FileWatchTriggerConfig {
    /** Remote directory or object-prefix path to poll */
    path: string;
    /** Glob pattern to filter files */
    pattern?: string;
    /** Watch subdirectories recursively */
    recursive?: boolean;
    /** Minimum file age in seconds before processing */
    minFileAge?: number;
    /** Connection code for the FTP, SFTP, or S3 source */
    connectionCode: string;
    /** Polling interval for remote file systems */
    pollIntervalMs?: number;
}

/**
 * Message acknowledgment mode
 */
export type AckMode = 'MANUAL';

/**
 * Configuration for message queue triggers
 */
export interface MessageTriggerConfig {
    /** Type of message queue */
    queueType: QueueTypeValue;
    /** Connection code for queue credentials; omitted only for INTERNAL queues */
    connectionCode?: string;
    /** Queue name to consume from */
    queueName: string;
    /** Redis Streams consumer group; rejected for other queue types */
    consumerGroup?: string;
    /** Number of messages requested per poll (1-100) */
    batchSize?: number;
    /** Message acknowledgment mode */
    ackMode?: AckMode;
    /** Retry attempts after the initial pipeline-run enqueue failure (maximum 10) */
    maxRetries?: number;
    /** Dead-letter queue name */
    deadLetterQueue?: string;
    /** Polling interval in milliseconds (1000-300000) */
    pollIntervalMs?: number;
    /** Parallel message processing limit (1-32) */
    concurrency?: number;
    /** Start consuming when pipeline is published */
    autoStart?: boolean;
    /** Number of messages to prefetch (1-1000) */
    prefetch?: number;
}

/**
 * Unified trigger configuration
 */
export interface TriggerConfig {
    /** Type of trigger */
    type: TriggerType;
    /** Whether the trigger is enabled */
    enabled?: boolean;
    /** Exact Vendure event class name (event triggers) */
    event?: VendureEventType;
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
    /** Required JWT issuer claim (webhook triggers) */
    jwtIssuer?: string;
    /** Required JWT audience claim (webhook triggers) */
    jwtAudience?: string;
    /** HMAC header name (webhook triggers) */
    hmacHeaderName?: string;
    /** HMAC algorithm (webhook triggers) */
    hmacAlgorithm?: HmacAlgorithm;
    /** Rate limit (webhook triggers) */
    rateLimit?: number;
    /** Rate-limit window in seconds (webhook triggers) */
    rateLimitWindow?: number;
    /** Custom idempotency header name (webhook triggers) */
    idempotencyKeyHeader?: string;
    /** Idempotency retention in seconds (webhook triggers) */
    idempotencyTtlSec?: number;
    /** Require idempotency key (webhook triggers) */
    requireIdempotencyKey?: boolean;
}
