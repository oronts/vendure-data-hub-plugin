/**
 * Webhook Types
 *
 * Type definitions for webhook delivery and retry management.
 */

import type { RetryConfig } from '../../../shared/types';

export type { RetryConfig };

/**
 * Webhook delivery status
 */
export enum WebhookDeliveryStatus {
    PENDING = 'PENDING',
    DELIVERED = 'DELIVERED',
    FAILED = 'FAILED',
    RETRYING = 'RETRYING',
    DEAD_LETTER = 'DEAD_LETTER',
}

/**
 * Webhook payload type
 */
export type WebhookPayload = Record<string, unknown> | unknown[];

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
    id: string;
    webhookId: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    payload: WebhookPayload;
    status: WebhookDeliveryStatus;
    attempts: number;
    maxAttempts: number;
    lastAttemptAt?: Date;
    nextRetryAt?: Date;
    responseStatus?: number;
    responseBody?: string;
    error?: string;
    createdAt: Date;
    deliveredAt?: Date;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
    id: string;
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    secret?: string;
    signatureHeader?: string;
    retryConfig?: RetryConfig;
    enabled?: boolean;
}

/**
 * Webhook statistics
 */
export interface WebhookStats {
    total: number;
    pending: number;
    delivered: number;
    failed: number;
    retrying: number;
    deadLetter: number;
    byWebhook: Record<string, { total: number; delivered: number; failed: number }>;
}

