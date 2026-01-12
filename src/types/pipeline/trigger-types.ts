/**
 * Trigger Type Definitions
 *
 * Types related to pipeline triggers and scheduling.
 * Uses enums from constants for consistency.
 *
 * CANONICAL FIELD NAMES:
 * ======================
 * - `cron` - Cron expression for schedule triggers
 * - `timezone` - Timezone for schedule evaluation
 * - `intervalSec` - Interval in seconds for interval-based triggers
 */

import { TriggerType } from '../../constants/index';

// TRIGGER CONFIGURATION

/**
 * Schedule configuration for cron-based triggers
 */
export interface ScheduleConfig {
    /** Cron expression (e.g., "0 0 * * *" for daily) */
    cron: string;
    /** Timezone for schedule evaluation */
    timezone?: string;
}

/**
 * File watch configuration for file-based triggers
 */
export interface FileWatchConfig {
    /** Connection code for file source (FTP, S3, etc.) */
    connectionCode: string;
    /** Path to watch for changes */
    path: string;
    /** File pattern to match (glob pattern) */
    pattern?: string;
    /** Poll interval in milliseconds */
    pollIntervalMs?: number;
}

/**
 * Webhook trigger configuration
 */
export interface WebhookTriggerConfig {
    /** Authentication type */
    authentication?: 'NONE' | 'API_KEY' | 'HMAC' | 'BASIC' | 'JWT';
    
    /** Secret code reference for HMAC authentication */
    secretCode?: string;
    
    /** Secret code reference for API key authentication */
    apiKeySecretCode?: string;
    
    /** Secret code reference for Basic authentication */
    basicSecretCode?: string;
    
    /** Secret code reference for JWT authentication */
    jwtSecretCode?: string;
    
    /** API key header name (default: 'X-API-Key') */
    apiKeyHeaderName?: string;
    
    /** API key prefix (e.g., 'Bearer ') */
    apiKeyPrefix?: string;
    
    /** HMAC header name (default: 'x-datahub-signature') */
    hmacHeaderName?: string;
    
    /** HMAC algorithm (default: 'sha256') */
    hmacAlgorithm?: 'sha256' | 'sha512';
    
    /** JWT header name (default: 'Authorization') */
    jwtHeaderName?: string;
    
    /** Require idempotency key header */
    requireIdempotencyKey?: boolean;
    
    /** Rate limit: max requests per minute */
    rateLimit?: number;
    
    /** Allowed IP addresses (if specified, only these IPs allowed) */
    allowedIps?: string[];
}

/**
 * Event trigger configuration
 */
export interface EventTriggerConfig {
    /** Vendure event type to listen for */
    eventType: string;
    /** Optional filter expression */
    filter?: string;
}

/**
 * Unified trigger configuration
 */
export interface TriggerConfig {
    /** Trigger type */
    type: TriggerType;
    /** Whether trigger is enabled */
    enabled?: boolean;
    /** Schedule configuration (for SCHEDULE type) */
    schedule?: ScheduleConfig;
    /** Webhook configuration (for WEBHOOK type) */
    webhook?: WebhookTriggerConfig;
    /** Vendure event type (for EVENT type) */
    eventType?: string;
    /** File watch configuration (for FILE type) */
    fileWatch?: FileWatchConfig;
}

/**
 * Trigger payload passed when pipeline is triggered
 */
export interface TriggerPayload {
    /** Type of trigger that initiated run */
    type: TriggerType;
    /** Timestamp when trigger fired */
    timestamp: string;
    /** Additional trigger-specific data */
    data?: Record<string, unknown>;
    /** Trigger metadata */
    meta?: Record<string, unknown>;
}
