import type { RetryConfig } from '../../../shared/types';

export type { RetryConfig };

export enum WebhookDeliveryStatus {
    PENDING = 'PENDING',
    DELIVERED = 'DELIVERED',
    FAILED = 'FAILED',
    RETRYING = 'RETRYING',
    DEAD_LETTER = 'DEAD_LETTER',
}

export type WebhookPayload = Record<string, unknown> | unknown[];

/**
 * Public delivery view. Replay payloads, request headers, credentials, and the
 * encrypted persistence envelope are intentionally absent.
 */
export interface WebhookDelivery {
    id: string;
    webhookId: string;
    url: string;
    method: string;
    payloadHash: string;
    payloadBytes: number;
    status: WebhookDeliveryStatus;
    attempts: number;
    maxAttempts: number;
    lastAttemptAt?: Date;
    nextRetryAt?: Date;
    responseStatus?: number;
    error?: string;
    createdAt: Date;
    deliveredAt?: Date;
}

export type WebhookDeliverySummary = WebhookDelivery;

export interface WebhookConfig {
    id: string;
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    secretCode?: string;
    headerSecretCodes?: Record<string, string>;
    signatureHeader?: string;
    retryConfig?: RetryConfig;
    enabled?: boolean;
}

export interface WebhookStats {
    total: number;
    pending: number;
    delivered: number;
    failed: number;
    retrying: number;
    deadLetter: number;
    byWebhook: Record<string, { total: number; delivered: number; failed: number }>;
}
