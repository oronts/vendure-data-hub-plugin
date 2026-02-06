/**
 * Webhook Helpers
 *
 * Utility functions for webhook delivery and retry logic.
 */

import * as crypto from 'crypto';
import { RetryConfig, WebhookConfig, WebhookDelivery, WebhookDeliveryStatus, WebhookStats, WebhookPayload } from './webhook.types';
import { WEBHOOK, HTTP_HEADERS } from '../../constants/index';
import { calculateBackoff as calculateBackoffShared } from '../../utils/retry.utils';

/**
 * Generate unique delivery ID
 */
export function generateDeliveryId(): string {
    return `dlv_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Sign payload with HMAC-SHA256
 */
export function signPayload(payload: WebhookPayload | string, secret: string): string {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Build request headers for webhook
 */
export function buildHeaders(
    config: WebhookConfig,
    additionalHeaders?: Record<string, string>,
): Record<string, string> {
    return {
        [HTTP_HEADERS.USER_AGENT]: 'DataHub-Webhook/1.0',
        'X-DataHub-Webhook-ID': config.id,
        'X-DataHub-Timestamp': new Date().toISOString(),
        ...config.headers,
        ...additionalHeaders,
    };
}

/**
 * Calculate exponential backoff delay with jitter
 * Delegates to shared retry utility for consistency across the codebase.
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
    return calculateBackoffShared(attempt, {
        maxAttempts: config.maxAttempts,
        initialDelayMs: config.initialDelayMs,
        maxDelayMs: config.maxDelayMs,
        backoffMultiplier: config.backoffMultiplier,
        jitterFactor: 0.1,
    });
}

/**
 * Create a new webhook delivery record
 */
export function createDeliveryRecord(
    webhookId: string,
    config: WebhookConfig,
    payload: WebhookPayload,
    headers: Record<string, string>,
    idempotencyKey?: string,
    maxAttempts?: number,
): WebhookDelivery {
    return {
        id: idempotencyKey || generateDeliveryId(),
        webhookId,
        url: config.url,
        method: config.method || 'POST',
        headers,
        payload,
        status: WebhookDeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: maxAttempts ?? config.retryConfig?.maxAttempts ?? 3,
        createdAt: new Date(),
    };
}

/**
 * Calculate webhook statistics from deliveries
 */
export function calculateWebhookStats(deliveries: WebhookDelivery[]): WebhookStats {
    const stats: WebhookStats = {
        total: deliveries.length,
        pending: 0,
        delivered: 0,
        failed: 0,
        retrying: 0,
        deadLetter: 0,
        byWebhook: {},
    };

    for (const delivery of deliveries) {
        switch (delivery.status) {
            case WebhookDeliveryStatus.PENDING:
                stats.pending++;
                break;
            case WebhookDeliveryStatus.DELIVERED:
                stats.delivered++;
                break;
            case WebhookDeliveryStatus.FAILED:
                stats.failed++;
                break;
            case WebhookDeliveryStatus.RETRYING:
                stats.retrying++;
                break;
            case WebhookDeliveryStatus.DEAD_LETTER:
                stats.deadLetter++;
                break;
        }

        // By webhook
        if (!stats.byWebhook[delivery.webhookId]) {
            stats.byWebhook[delivery.webhookId] = { total: 0, delivered: 0, failed: 0 };
        }
        stats.byWebhook[delivery.webhookId].total++;
        if (delivery.status === WebhookDeliveryStatus.DELIVERED) {
            stats.byWebhook[delivery.webhookId].delivered++;
        }
        if (delivery.status === WebhookDeliveryStatus.DEAD_LETTER || delivery.status === WebhookDeliveryStatus.FAILED) {
            stats.byWebhook[delivery.webhookId].failed++;
        }
    }

    return stats;
}

/**
 * Filter deliveries by criteria
 */
export function filterDeliveries(
    deliveries: WebhookDelivery[],
    options?: {
        status?: WebhookDeliveryStatus;
        webhookId?: string;
        limit?: number;
    },
): WebhookDelivery[] {
    let filtered = deliveries;

    if (options?.status) {
        filtered = filtered.filter(d => d.status === options.status);
    }
    if (options?.webhookId) {
        filtered = filtered.filter(d => d.webhookId === options.webhookId);
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
    }

    return filtered;
}

/**
 * Check if delivery should be retried
 */
export function shouldRetry(delivery: WebhookDelivery): boolean {
    return delivery.attempts < delivery.maxAttempts;
}

/**
 * Update delivery for retry
 */
export function prepareForRetry(
    delivery: WebhookDelivery,
    config: WebhookConfig,
): void {
    delivery.status = WebhookDeliveryStatus.RETRYING;
    const retryConfig = config.retryConfig ?? {
        initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
        maxDelayMs: WEBHOOK.MAX_DELAY_MS,
        backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
        maxAttempts: WEBHOOK.MAX_ATTEMPTS,
    };
    const delay = calculateBackoff(delivery.attempts, retryConfig);
    delivery.nextRetryAt = new Date(Date.now() + delay);
}

/**
 * Mark delivery as dead letter
 */
export function markAsDeadLetter(delivery: WebhookDelivery): void {
    delivery.status = WebhookDeliveryStatus.DEAD_LETTER;
}

/**
 * Reset delivery for manual retry
 */
export function resetForRetry(delivery: WebhookDelivery): void {
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.attempts = 0;
    delivery.error = undefined;
    delivery.nextRetryAt = undefined;
}
