import type { RequestContext } from '@vendure/core';
import { DataHubWebhookDelivery } from '../../entities/pipeline/webhook-delivery.entity';
import type { RetryConfig, WebhookConfig } from './webhook.types';
import { WebhookDeliveryStatus } from './webhook.types';
import { sanitizeUrlForLogging } from '../../utils/url-sanitize.utils';
import { sha256 } from './webhook.helpers';
import {
    DEFAULT_RETRY_CONFIG,
    createRetryConfig,
    type ResolvedRetryConfig,
} from '../../utils/retry.utils';
import { WEBHOOK } from '../../constants';
import { encryptWebhookReplayEnvelope } from './webhook-replay-envelope';

export interface PendingWebhookDeliveryInput {
    readonly ctx: RequestContext;
    readonly config: WebhookConfig;
    readonly deliveryKey: string;
    readonly serializedPayload: string;
    readonly requestFingerprint: string;
    readonly encryptedReplayEnvelope: string;
    readonly retryConfig: RetryConfig;
    readonly availableAt: Date;
}

export type NormalizedWebhookConfig = Omit<
    WebhookConfig,
    'method' | 'retryConfig' | 'enabled'
> & {
    readonly method: NonNullable<WebhookConfig['method']>;
    readonly retryConfig: ResolvedRetryConfig;
    readonly enabled: true;
};

export function normalizeWebhookDeliveryConfig(
    config: WebhookConfig,
): NormalizedWebhookConfig {
    const retryConfig = {
        ...createRetryConfig(config.retryConfig, {
            maxAttempts: WEBHOOK.MAX_ATTEMPTS,
            initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
            maxDelayMs: WEBHOOK.HOOK_MAX_DELAY_MS,
            backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
            jitterFactor: DEFAULT_RETRY_CONFIG.jitterFactor,
        }),
        retryableStatusCodes: config.retryConfig?.retryableStatusCodes
            ? [...config.retryConfig.retryableStatusCodes].sort((left, right) => left - right)
            : undefined,
    };
    return {
        ...config,
        method: config.method ?? 'POST',
        retryConfig,
        enabled: true,
    };
}

function createPendingWebhookDelivery(
    input: PendingWebhookDeliveryInput,
): DataHubWebhookDelivery {
    return Object.assign(new DataHubWebhookDelivery(), {
        channelId: String(input.ctx.channelId),
        channelToken: input.ctx.channel.token,
        deliveryKey: input.deliveryKey,
        webhookId: input.config.id,
        publicUrl: sanitizeUrlForLogging(input.config.url),
        method: input.config.method ?? 'POST',
        requestFingerprint: input.requestFingerprint,
        payloadHash: sha256(input.serializedPayload),
        payloadBytes: Buffer.byteLength(input.serializedPayload),
        encryptedReplayEnvelope: input.encryptedReplayEnvelope,
        status: WebhookDeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: input.retryConfig.maxAttempts,
        availableAt: input.availableAt,
        lastAttemptAt: null,
        nextRetryAt: null,
        leaseExpiresAt: null,
        dispatchToken: null,
        responseStatus: null,
        lastError: null,
        deliveredAt: null,
    });
}

export async function preparePendingWebhookDelivery(
    input: Omit<
        PendingWebhookDeliveryInput,
        'config' | 'encryptedReplayEnvelope' | 'retryConfig' | 'availableAt'
    > & {
        readonly config: WebhookConfig;
        readonly additionalHeaders?: Readonly<Record<string, string>>;
        readonly idempotencyKey?: string;
    },
): Promise<DataHubWebhookDelivery> {
    const config = normalizeWebhookDeliveryConfig(input.config);
    const retryConfig = config.retryConfig;
    const encryptedReplayEnvelope = await encryptWebhookReplayEnvelope({
        config,
        serializedPayload: input.serializedPayload,
        additionalHeaders: { ...input.additionalHeaders },
        idempotencyKey: input.idempotencyKey,
    });
    return createPendingWebhookDelivery({
        ...input,
        config,
        encryptedReplayEnvelope,
        retryConfig,
        availableAt: new Date(),
    });
}
