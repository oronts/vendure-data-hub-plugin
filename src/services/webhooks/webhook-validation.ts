import type { ResolvedRetryConfig } from '../../utils/retry.utils';
import { createRetryConfig } from '../../utils/retry.utils';
import { WEBHOOK, WEBHOOK_QUEUE } from '../../constants';
import type { WebhookConfig } from './webhook.types';

export function validateWebhookConfig(config: WebhookConfig): ResolvedRetryConfig {
    if (config.enabled === false) {
        throw new Error(`Webhook is disabled: ${config.id}`);
    }
    const parsedUrl = new URL(config.url);
    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('Webhook URLs cannot contain embedded credentials');
    }
    const retryConfig = createRetryConfig(config.retryConfig);
    validateRetryConfig(retryConfig);
    validateRetryableStatusCodes(config.retryConfig?.retryableStatusCodes);
    return retryConfig;
}

export function validateDeliveryKey(idempotencyKey: string | undefined): string | undefined {
    if (idempotencyKey === undefined) return undefined;
    if (
        idempotencyKey.trim() !== idempotencyKey ||
        idempotencyKey.length === 0 ||
        idempotencyKey.length > WEBHOOK.IDEMPOTENCY_KEY_MAX_LENGTH
    ) {
        throw new Error(
            `Webhook idempotency keys must contain 1-${WEBHOOK.IDEMPOTENCY_KEY_MAX_LENGTH} non-whitespace characters`,
        );
    }
    return idempotencyKey;
}

function validateRetryConfig(config: ResolvedRetryConfig): void {
    if (
        !Number.isSafeInteger(config.maxAttempts) ||
        config.maxAttempts < 1 ||
        config.maxAttempts > WEBHOOK_QUEUE.MAX_RETRY_ATTEMPTS
    ) {
        throw new Error(
            `Webhook maxAttempts must be an integer between 1 and ${WEBHOOK_QUEUE.MAX_RETRY_ATTEMPTS}`,
        );
    }
    if (
        !Number.isSafeInteger(config.initialDelayMs) ||
        config.initialDelayMs < 0 ||
        config.initialDelayMs > WEBHOOK_QUEUE.MAX_RETRY_DELAY_MS ||
        !Number.isSafeInteger(config.maxDelayMs) ||
        config.maxDelayMs < config.initialDelayMs ||
        config.maxDelayMs > WEBHOOK_QUEUE.MAX_RETRY_DELAY_MS
    ) {
        throw new Error(
            `Webhook retry delays must be safe integers between 0 and ${WEBHOOK_QUEUE.MAX_RETRY_DELAY_MS}, with maxDelayMs >= initialDelayMs`,
        );
    }
    if (
        !Number.isFinite(config.backoffMultiplier) ||
        config.backoffMultiplier < 1 ||
        config.backoffMultiplier > WEBHOOK_QUEUE.MAX_BACKOFF_MULTIPLIER
    ) {
        throw new Error(
            `Webhook backoffMultiplier must be between 1 and ${WEBHOOK_QUEUE.MAX_BACKOFF_MULTIPLIER}`,
        );
    }
    if (
        config.jitterFactor !== undefined &&
        (!Number.isFinite(config.jitterFactor) ||
            config.jitterFactor < 0 ||
            config.jitterFactor > 1)
    ) {
        throw new Error('Webhook jitterFactor must be between 0 and 1');
    }
}

function validateRetryableStatusCodes(statuses: number[] | undefined): void {
    if (statuses === undefined) return;
    if (
        statuses.some(status => !Number.isInteger(status) || status < 400 || status > 599) ||
        new Set(statuses).size !== statuses.length
    ) {
        throw new Error(
            'Webhook retryableStatusCodes must contain unique HTTP error status codes between 400 and 599',
        );
    }
}
