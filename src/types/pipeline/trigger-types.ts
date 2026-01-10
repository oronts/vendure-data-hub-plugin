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
    /** Unique webhook endpoint code */
    webhookCode: string;
    /** Authentication type */
    authentication?: 'NONE' | 'API_KEY' | 'HMAC' | 'JWT' | 'BASIC';
    /** Secret code reference for authentication */
    secretCode?: string;
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
    /** Webhook code (for WEBHOOK type) */
    webhookCode?: string;
    /** Vendure event type (for EVENT type) */
    eventType?: string;
    /** File watch configuration (for FILE type) */
    fileWatch?: FileWatchConfig;
}

/**
 * Trigger payload passed when pipeline is triggered
 */
export interface TriggerPayload {
    /** Type of trigger that initiated the run */
    type: TriggerType;
    /** Timestamp when trigger fired */
    timestamp: string;
    /** Additional trigger-specific data */
    data?: Record<string, unknown>;
    /** Trigger metadata */
    meta?: Record<string, unknown>;
}
