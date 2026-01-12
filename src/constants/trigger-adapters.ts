/**
 * Trigger Adapter Configuration
 *
 * Configuration schemas for all trigger types.
 * These are NOT standard adapters but specialized trigger configurations.
 */

import { StepConfigSchemaField } from '../sdk/types/schema-types';

/**
 * Webhook authentication types
 */
export type WebhookAuthType = 'NONE' | 'API_KEY' | 'HMAC' | 'BASIC' | 'JWT';

/**
 * Webhook trigger configuration interface
 */
export interface WebhookTriggerConfig {
    /** Unique webhook endpoint code */
    webhookCode: string;
    /** Authentication type */
    authentication: WebhookAuthType;
    /** HMAC secret code (for HMAC auth) */
    secretCode?: string;
    /** API key secret code (for API_KEY auth) */
    apiKeySecretCode?: string;
    /** Basic auth secret code (for BASIC auth) */
    basicSecretCode?: string;
    /** JWT secret code (for JWT auth) */
    jwtSecretCode?: string;
    /** API key header name */
    apiKeyHeaderName?: string;
    /** API key prefix (e.g., "Bearer ") */
    apiKeyPrefix?: string;
    /** HMAC signature header name */
    hmacHeaderName?: string;
    /** HMAC algorithm */
    hmacAlgorithm?: 'sha256' | 'sha512';
    /** JWT header name */
    jwtHeaderName?: string;
    /** Require idempotency key header */
    requireIdempotencyKey?: boolean;
    /** Rate limit (requests per minute per IP) */
    rateLimit?: number;
    /** Allowed IP addresses */
    allowedIps?: string[];
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
            { value: 'HMAC', label: 'HMAC-SHA256' },
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
            { value: 'sha256', label: 'SHA-256' },
            { value: 'sha512', label: 'SHA-512' },
        ],
        defaultValue: 'sha256',
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
export const DEFAULT_WEBHOOK_CONFIG: Partial<WebhookTriggerConfig> = {
    authentication: 'NONE',
    apiKeyHeaderName: 'x-api-key',
    hmacHeaderName: 'x-datahub-signature',
    hmacAlgorithm: 'sha256',
    jwtHeaderName: 'authorization',
    requireIdempotencyKey: false,
    rateLimit: 100,
};
