import { createHash, createHmac } from 'crypto';
import type { RetryConfig } from '../../../shared/types';
import { HTTP_HEADERS } from '../../constants';
import { generateTimestampedId } from '../../utils/id-generation.utils';
import { createRetryConfig, calculateBackoff as calculateBackoffShared } from '../../utils/retry.utils';
import type {
    WebhookConfig,
    WebhookDelivery,
    WebhookPayload,
    WebhookStats,
} from './webhook.types';
import { WebhookDeliveryStatus } from './webhook.types';

interface PersistedWebhookDelivery {
    deliveryKey: string;
    webhookId: string;
    publicUrl: string;
    method: string;
    payloadHash: string;
    payloadBytes: number;
    status: WebhookDeliveryStatus;
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: Date | null;
    nextRetryAt: Date | null;
    responseStatus: number | null;
    lastError: string | null;
    createdAt: Date;
    deliveredAt: Date | null;
}

export function generateDeliveryId(): string {
    return generateTimestampedId('dlv', 16);
}

export function serializeWebhookPayload(payload: WebhookPayload): string {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) {
        throw new Error('Webhook payload must be JSON serializable');
    }
    return serialized;
}

export function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function createRequestFingerprint(
    config: WebhookConfig,
    serializedPayload: string,
    additionalHeaders?: Readonly<Record<string, string>>,
): string {
    const requestContract = canonicalizeJson({
        webhookId: config.id,
        url: config.url,
        method: config.method ?? 'POST',
        headers: config.headers,
        additionalHeaders,
        secretCode: config.secretCode,
        headerSecretCodes: config.headerSecretCodes,
        signatureHeader: config.signatureHeader,
        retryConfig: config.retryConfig,
        payload: serializedPayload,
    });
    return sha256(JSON.stringify(requestContract));
}

function canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalizeJson);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
}

export function signPayload(payload: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function buildHeaders(
    config: WebhookConfig,
    additionalHeaders: Readonly<Record<string, string>>,
    resolvedSecretHeaders: Readonly<Record<string, string>>,
    idempotencyKey: string | undefined,
    serializedPayload: string,
    signingSecret: string | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {
        [HTTP_HEADERS.USER_AGENT]: 'DataHub-Webhook/1.0',
        'X-DataHub-Webhook-ID': config.id,
        'X-DataHub-Timestamp': new Date().toISOString(),
        ...config.headers,
        ...additionalHeaders,
        ...resolvedSecretHeaders,
    };
    if (idempotencyKey) {
        headers[HTTP_HEADERS.IDEMPOTENCY_KEY] = idempotencyKey;
    }
    if (signingSecret) {
        headers[config.signatureHeader ?? 'X-DataHub-Signature'] =
            signPayload(serializedPayload, signingSecret);
    }
    return headers;
}

export function calculateBackoff(attempt: number, config: RetryConfig): number {
    return calculateBackoffShared(attempt, createRetryConfig(config));
}

export function toWebhookDelivery(delivery: PersistedWebhookDelivery): WebhookDelivery {
    return {
        id: delivery.deliveryKey,
        webhookId: delivery.webhookId,
        url: delivery.publicUrl,
        method: delivery.method,
        payloadHash: delivery.payloadHash,
        payloadBytes: delivery.payloadBytes,
        status: delivery.status,
        attempts: delivery.attempts,
        maxAttempts: delivery.maxAttempts,
        lastAttemptAt: delivery.lastAttemptAt ?? undefined,
        nextRetryAt: delivery.nextRetryAt ?? undefined,
        responseStatus: delivery.responseStatus ?? undefined,
        error: delivery.lastError ?? undefined,
        createdAt: delivery.createdAt,
        deliveredAt: delivery.deliveredAt ?? undefined,
    };
}

export function summarizeWebhookDelivery(delivery: WebhookDelivery): WebhookDelivery {
    return { ...delivery };
}

interface WebhookStatsGroup {
    webhookId: string;
    status: WebhookDeliveryStatus;
    total: string | number;
}

export function calculateWebhookStats(groups: readonly WebhookStatsGroup[]): WebhookStats {
    const stats: WebhookStats = {
        total: 0,
        pending: 0,
        delivered: 0,
        failed: 0,
        retrying: 0,
        deadLetter: 0,
        byWebhook: {},
    };

    for (const group of groups) {
        const count = typeof group.total === 'number'
            ? group.total
            : Number.parseInt(group.total, 10);
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error('Webhook statistics returned an invalid count');
        }
        stats.total += count;
        switch (group.status) {
            case WebhookDeliveryStatus.PENDING:
                stats.pending += count;
                break;
            case WebhookDeliveryStatus.DELIVERED:
                stats.delivered += count;
                break;
            case WebhookDeliveryStatus.FAILED:
                stats.failed += count;
                break;
            case WebhookDeliveryStatus.RETRYING:
                stats.retrying += count;
                break;
            case WebhookDeliveryStatus.DEAD_LETTER:
                stats.deadLetter += count;
                break;
        }

        const byWebhook = stats.byWebhook[group.webhookId] ?? {
            total: 0,
            delivered: 0,
            failed: 0,
        };
        byWebhook.total += count;
        if (group.status === WebhookDeliveryStatus.DELIVERED) {
            byWebhook.delivered += count;
        }
        if (
            group.status === WebhookDeliveryStatus.FAILED ||
            group.status === WebhookDeliveryStatus.DEAD_LETTER
        ) {
            byWebhook.failed += count;
        }
        stats.byWebhook[group.webhookId] = byWebhook;
    }

    return stats;
}
