/**
 * Trigger Adapter Configuration
 *
 * Schema definitions for trigger types (UI generation).
 * Types are imported from canonical trigger-types.ts.
 */

import { StepConfigSchemaField } from '../sdk/types/schema-types';
import {
    WebhookAuthType,
    WebhookTriggerConfig as BaseWebhookTriggerConfig,
    MessageTriggerConfig as BaseMessageTriggerConfig,
} from '../../shared/types';
import { AckMode, QueueType } from './enums';
import { HTTP } from './defaults';
import { TIME_UNITS } from '../../shared/constants';

export type { WebhookAuthType };

export type { BaseWebhookTriggerConfig as WebhookTriggerConfig };

/**
 * Extended webhook config for adapter schema (includes webhookCode)
 */
export interface WebhookAdapterConfig extends BaseWebhookTriggerConfig {
    /** Unique webhook endpoint code (auto-generated from pipeline code) */
    webhookCode: string;
}

/**
 * Webhook trigger schema fields for UI generation
 */
export const WEBHOOK_TRIGGER_SCHEMA_FIELDS: readonly StepConfigSchemaField[] = [
    {
        key: 'webhookCode',
        label: 'Webhook Code',
        type: 'string',
        required: true,
        description: 'Unique webhook endpoint code (auto-generated from pipeline code)',
    },
    {
        key: 'authentication',
        label: 'Authentication',
        type: 'select',
        options: [
            { value: 'NONE', label: 'None (Not recommended)' },
            { value: 'API_KEY', label: 'API Key (Recommended)' },
            { value: 'HMAC', label: 'HMAC Signature' },
            { value: 'BASIC', label: 'HTTP Basic Auth' },
            { value: 'JWT', label: 'JWT Token' },
        ],
        required: true,
        description: 'Authentication type for webhook endpoint',
    },
    {
        key: 'secretCode',
        label: 'HMAC Secret',
        type: 'secret',
        description: 'Secret code containing HMAC secret',
        dependsOn: { field: 'authentication', value: 'HMAC' },
    },
    {
        key: 'apiKeySecretCode',
        label: 'API Key Secret',
        type: 'secret',
        description: 'Secret code containing API key',
        dependsOn: { field: 'authentication', value: 'API_KEY' },
    },
    {
        key: 'basicSecretCode',
        label: 'Basic Auth Secret',
        type: 'secret',
        description: 'Secret code containing username:password',
        dependsOn: { field: 'authentication', value: 'BASIC' },
    },
    {
        key: 'jwtSecretCode',
        label: 'JWT Secret',
        type: 'secret',
        description: 'Secret code containing JWT verification secret',
        dependsOn: { field: 'authentication', value: 'JWT' },
    },
    {
        key: 'apiKeyHeaderName',
        label: 'API Key Header',
        type: 'string',
        defaultValue: 'x-api-key',
        description: 'HTTP header name for API key',
        dependsOn: { field: 'authentication', value: 'API_KEY' },
    },
    {
        key: 'apiKeyPrefix',
        label: 'API Key Prefix',
        type: 'string',
        description: 'Prefix for API key value (e.g., "Bearer ")',
        dependsOn: { field: 'authentication', value: 'API_KEY' },
    },
    {
        key: 'hmacHeaderName',
        label: 'HMAC Header Name',
        type: 'string',
        defaultValue: 'x-datahub-signature',
        description: 'HTTP header name for HMAC signature',
        dependsOn: { field: 'authentication', value: 'HMAC' },
    },
    {
        key: 'hmacAlgorithm',
        label: 'HMAC Algorithm',
        type: 'select',
        options: [
            { value: 'SHA256', label: 'SHA-256' },
            { value: 'SHA512', label: 'SHA-512' },
        ],
        defaultValue: 'SHA256',
        description: 'Hash algorithm for HMAC signature',
        dependsOn: { field: 'authentication', value: 'HMAC' },
    },
    {
        key: 'jwtHeaderName',
        label: 'JWT Header Name',
        type: 'string',
        defaultValue: 'authorization',
        description: 'HTTP header name for JWT token',
        dependsOn: { field: 'authentication', value: 'JWT' },
    },
    {
        key: 'requireIdempotencyKey',
        label: 'Require Idempotency Key',
        type: 'boolean',
        defaultValue: false,
        description: 'Require X-Idempotency-Key header for deduplication',
    },
    {
        key: 'rateLimit',
        label: 'Rate Limit',
        type: 'number',
        defaultValue: 100,
        description: 'Maximum requests per minute per IP (0 = unlimited)',
    },
];

/**
 * Default webhook trigger configuration
 */
export const DEFAULT_WEBHOOK_CONFIG: Partial<BaseWebhookTriggerConfig> = {
    authentication: 'NONE',
    apiKeyHeaderName: 'x-api-key',
    hmacHeaderName: 'x-datahub-signature',
    hmacAlgorithm: 'SHA256',
    jwtHeaderName: 'authorization',
    requireIdempotencyKey: false,
    rateLimit: 100,
};

// MESSAGE TRIGGER CONFIGURATION

export type { BaseMessageTriggerConfig as MessageTriggerConfig };

/**
 * Message trigger schema fields for UI generation
 */
export const MESSAGE_TRIGGER_SCHEMA_FIELDS: readonly StepConfigSchemaField[] = [
    {
        key: 'queueType',
        label: 'Queue Type',
        type: 'select',
        options: [
            { value: QueueType.RABBITMQ_AMQP, label: 'RabbitMQ (AMQP) - Recommended' },
            { value: QueueType.RABBITMQ, label: 'RabbitMQ (HTTP API)' },
            { value: QueueType.SQS, label: 'Amazon SQS' },
            { value: QueueType.REDIS, label: 'Redis Streams' },
            { value: QueueType.INTERNAL, label: 'Internal BullMQ' },
        ],
        required: true,
        description: 'Message queue to consume from.',
    },
    {
        key: 'connectionCode',
        label: 'Connection',
        type: 'string',
        required: true,
        description: 'Reference to queue connection configuration',
    },
    {
        key: 'queueName',
        label: 'Queue Name',
        type: 'string',
        required: true,
        description: 'RabbitMQ queue name to consume from',
    },
    {
        key: 'consumerGroup',
        label: 'Consumer Tag',
        type: 'string',
        description: 'Consumer tag for identification in RabbitMQ',
    },
    {
        key: 'batchSize',
        label: 'Batch Size',
        type: 'number',
        defaultValue: 10,
        description: 'Number of messages to process at once',
    },
    {
        key: 'ackMode',
        label: 'Acknowledgment Mode',
        type: 'select',
        options: [
            { value: AckMode.AUTO, label: 'Auto (ack on receive)' },
            { value: AckMode.MANUAL, label: 'Manual (ack on success)' },
        ],
        defaultValue: AckMode.MANUAL,
        description: 'When to acknowledge message consumption',
    },
    {
        key: 'maxRetries',
        label: 'Max Retries',
        type: 'number',
        defaultValue: 3,
        description: 'Maximum retries before sending to dead-letter queue',
    },
    {
        key: 'deadLetterQueue',
        label: 'Dead-Letter Queue',
        type: 'string',
        description: 'Queue name for failed messages',
    },
    {
        key: 'concurrency',
        label: 'Concurrency',
        type: 'number',
        defaultValue: 1,
        description: 'Parallel message processing limit',
    },
    {
        key: 'autoStart',
        label: 'Auto Start',
        type: 'boolean',
        defaultValue: true,
        description: 'Start consuming when pipeline is published',
    },
    {
        key: 'pollIntervalMs',
        label: 'Poll Interval (ms)',
        type: 'number',
        defaultValue: 1000,
        description: 'Polling interval for poll-based queues',
    },
    {
        key: 'prefetch',
        label: 'Prefetch Count',
        type: 'number',
        defaultValue: 10,
        description: 'Number of messages to prefetch from RabbitMQ',
    },
    {
        key: 'filterExpression',
        label: 'Filter Expression',
        type: 'string',
        description: 'Expression to filter messages before processing',
    },
];

/**
 * Default message trigger configuration
 */
export const DEFAULT_MESSAGE_CONFIG: Partial<BaseMessageTriggerConfig> = {
    queueType: 'RABBITMQ_AMQP',
    batchSize: 10,
    ackMode: 'MANUAL',
    maxRetries: HTTP.MAX_RETRIES,
    concurrency: 1,
    autoStart: true,
    pollIntervalMs: TIME_UNITS.SECOND,
    prefetch: 10,
};
