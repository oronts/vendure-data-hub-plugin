import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
    TransactionalConnection,
    JobQueue,
    JobQueueService,
} from '@vendure/core';
import { LOGGER_CONTEXTS, HTTP_HEADERS, CONTENT_TYPES, WEBHOOK_QUEUE, WEBHOOK } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { getErrorMessage } from '../../utils/error.utils';

import {
    WebhookDeliveryStatus,
    WebhookDelivery,
    WebhookConfig,
    RetryConfig,
    WebhookStats,
    WebhookPayload,
    DEFAULT_RETRY_CONFIG,
} from './webhook.types';
import {
    signPayload,
    buildHeaders,
    calculateBackoff,
    createDeliveryRecord,
    calculateWebhookStats,
    filterDeliveries,
    shouldRetry,
    prepareForRetry,
    markAsDeadLetter,
    resetForRetry,
} from './webhook.helpers';

export { WebhookDeliveryStatus, WebhookDelivery, WebhookConfig, RetryConfig, WebhookPayload };


/**
 * Strips query parameters from a URL to avoid logging embedded credentials (e.g. ?token=xxx)
 */
function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    } catch {
        return '<invalid-url>';
    }
}

interface WebhookConfigWithMeta extends WebhookConfig {
    lastUsedAt: number;
}

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private deliveryQueue: Map<string, WebhookDelivery> = new Map();
    private webhookConfigs: Map<string, WebhookConfigWithMeta> = new Map();
    private jobQueue: JobQueue<{ deliveryId: string }> | undefined;
    private retryProcessorHandle: ReturnType<typeof setInterval> | null = null;
    private ssrfConfig?: UrlSecurityConfig;

    constructor(
        private connection: TransactionalConnection,
        private jobQueueService: JobQueueService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK_RETRY);
    }

    /**
     * Configure SSRF protection settings for webhook delivery
     */
    configureSsrfProtection(config: UrlSecurityConfig): void {
        this.ssrfConfig = config;
    }

    async onModuleDestroy(): Promise<void> {
        if (this.retryProcessorHandle) {
            clearInterval(this.retryProcessorHandle);
            this.retryProcessorHandle = null;
            this.logger.debug('Webhook retry processor stopped');
        }
    }

    async onModuleInit() {
        this.jobQueue = await this.jobQueueService.createQueue({
            name: 'datahub-webhook-retry',
            process: async (job) => {
                await this.processRetry(job.data.deliveryId);
            },
        });

        this.startRetryProcessor();

        this.logger.info('WebhookRetryService initialized', {
            retryCheckIntervalMs: WEBHOOK.RETRY_CHECK_INTERVAL_MS,
        });
    }

    /**
     * Register a webhook configuration
     * Validates the webhook URL against SSRF attacks during registration
     *
     * @throws Error if webhook URL fails SSRF validation
     */
    async registerWebhook(config: WebhookConfig): Promise<void> {
        await assertUrlSafe(config.url, this.ssrfConfig);

        if (this.webhookConfigs.size >= WEBHOOK_QUEUE.MAX_WEBHOOK_CONFIGS && !this.webhookConfigs.has(config.id)) {
            this.evictOldestWebhookConfigs();
        }

        this.webhookConfigs.set(config.id, {
            ...config,
            method: config.method || 'POST',
            enabled: config.enabled !== false,
            lastUsedAt: Date.now(),
        });
        this.logger.info('Registered webhook', {
            webhookId: config.id,
            url: sanitizeUrl(config.url),
            method: config.method || 'POST',
        });
    }

    private evictOldestWebhookConfigs(): void {
        const entries = Array.from(this.webhookConfigs.entries())
            .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
        const toRemove = entries.slice(0, Math.ceil(WEBHOOK_QUEUE.MAX_WEBHOOK_CONFIGS * 0.1));
        for (const [id] of toRemove) {
            this.webhookConfigs.delete(id);
            this.logger.debug('Evicted old webhook config', { webhookId: id });
        }
    }

    async sendWebhook(
        webhookId: string,
        payload: WebhookPayload,
        options?: {
            headers?: Record<string, string>;
            idempotencyKey?: string;
        },
    ): Promise<WebhookDelivery> {
        const config = this.webhookConfigs.get(webhookId);
        if (!config) {
            throw new Error(`Webhook not found: ${webhookId}`);
        }

        if (!config.enabled) {
            throw new Error(`Webhook is disabled: ${webhookId}`);
        }

        config.lastUsedAt = Date.now();

        if (this.deliveryQueue.size >= WEBHOOK_QUEUE.MAX_DELIVERY_QUEUE_SIZE) {
            this.evictOldDeliveries();
        }

        const headers = buildHeaders(config, options?.headers);

        if (config.secret) {
            const signature = signPayload(payload, config.secret);
            const headerName = config.signatureHeader || 'X-DataHub-Signature';
            headers[headerName] = signature;
        }

        const delivery = createDeliveryRecord(
            webhookId,
            config,
            payload,
            headers,
            options?.idempotencyKey,
            config.retryConfig?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
        );

        this.deliveryQueue.set(delivery.id, delivery);
        await this.attemptDelivery(delivery);

        return delivery;
    }

    private evictOldDeliveries(): void {
        const delivered: string[] = [];
        const deadLetter: string[] = [];

        for (const [id, delivery] of this.deliveryQueue.entries()) {
            if (delivery.status === WebhookDeliveryStatus.DELIVERED) {
                delivered.push(id);
            } else if (delivery.status === WebhookDeliveryStatus.DEAD_LETTER) {
                deadLetter.push(id);
            }
        }

        for (const id of delivered) {
            this.deliveryQueue.delete(id);
        }

        let deadLetterRemoved = 0;
        if (this.deliveryQueue.size >= WEBHOOK_QUEUE.MAX_DELIVERY_QUEUE_SIZE) {
            const toRemove = deadLetter.slice(0, Math.ceil(deadLetter.length / 2));
            deadLetterRemoved = toRemove.length;
            for (const id of toRemove) {
                this.deliveryQueue.delete(id);
            }
        }

        // If still over limit after removing DELIVERED and DEAD_LETTER,
        // evict oldest PENDING entries (sorted by createdAt) to prevent unbounded growth
        let pendingRemoved = 0;
        if (this.deliveryQueue.size >= WEBHOOK_QUEUE.MAX_DELIVERY_QUEUE_SIZE) {
            const pendingEntries: Array<[string, WebhookDelivery]> = [];
            for (const [id, delivery] of this.deliveryQueue.entries()) {
                if (
                    delivery.status === WebhookDeliveryStatus.PENDING ||
                    delivery.status === WebhookDeliveryStatus.RETRYING
                ) {
                    pendingEntries.push([id, delivery]);
                }
            }
            // Sort by createdAt ascending (oldest first)
            pendingEntries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());

            const excess = this.deliveryQueue.size - WEBHOOK_QUEUE.MAX_DELIVERY_QUEUE_SIZE;
            const toEvict = pendingEntries.slice(0, Math.max(excess, Math.ceil(pendingEntries.length * 0.1)));
            pendingRemoved = toEvict.length;
            for (const [id] of toEvict) {
                this.deliveryQueue.delete(id);
            }

            if (pendingRemoved > 0) {
                this.logger.warn('Evicted PENDING/RETRYING deliveries due to queue overflow', {
                    pendingRemoved,
                    remainingSize: this.deliveryQueue.size,
                });
            }
        }

        this.logger.debug('Evicted old deliveries', {
            deliveredRemoved: delivered.length,
            deadLetterRemoved,
            pendingRemoved,
        });
    }

    private async attemptDelivery(delivery: WebhookDelivery): Promise<void> {
        const config = this.webhookConfigs.get(delivery.webhookId);
        if (!config) return;

        delivery.attempts++;
        delivery.lastAttemptAt = new Date();

        try {
            // Re-validate URL before each delivery attempt (in case DNS changed)
            await assertUrlSafe(delivery.url, this.ssrfConfig);

            const response = await fetch(delivery.url, {
                method: delivery.method,
                headers: {
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                    ...delivery.headers,
                },
                body: JSON.stringify(delivery.payload),
            });

            delivery.responseStatus = response.status;
            delivery.responseBody = await response.text().catch(() => '');

            if (response.ok) {
                delivery.status = WebhookDeliveryStatus.DELIVERED;
                delivery.deliveredAt = new Date();
                this.logger.info('Webhook delivered successfully', {
                    deliveryId: delivery.id,
                    webhookId: delivery.webhookId,
                    url: sanitizeUrl(delivery.url),
                    statusCode: response.status,
                    attempts: delivery.attempts,
                    durationMs: Date.now() - (delivery.lastAttemptAt?.getTime() ?? Date.now()),
                });
            } else {
                this.handleFailure(delivery, config, `HTTP ${response.status}`);
            }
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            delivery.error = errorMessage;
            this.handleFailure(delivery, config, errorMessage);
        }
    }

    private handleFailure(
        delivery: WebhookDelivery,
        config: WebhookConfig,
        reason: string,
    ): void {
        if (!shouldRetry(delivery)) {
            markAsDeadLetter(delivery);
            this.logger.warn('Webhook moved to dead letter queue', {
                deliveryId: delivery.id,
                webhookId: delivery.webhookId,
                url: sanitizeUrl(delivery.url),
                attempts: delivery.attempts,
                maxAttempts: delivery.maxAttempts,
                reason,
            });
        } else {
            prepareForRetry(delivery, config);
            const delay = calculateBackoff(delivery.attempts, config.retryConfig ?? DEFAULT_RETRY_CONFIG);

            this.logger.debug('Webhook retry scheduled', {
                deliveryId: delivery.id,
                webhookId: delivery.webhookId,
                delayMs: delay,
                attempt: delivery.attempts,
                maxAttempts: delivery.maxAttempts,
                reason,
            });

            setTimeout(() => {
                this.jobQueue?.add({ deliveryId: delivery.id });
            }, delay);
        }
    }

    private async processRetry(deliveryId: string): Promise<void> {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery) return;

        if (delivery.status !== WebhookDeliveryStatus.RETRYING) return;

        await this.attemptDelivery(delivery);
    }

    private startRetryProcessor() {
        this.retryProcessorHandle = setInterval(() => {
            const now = new Date();
            const nowMs = now.getTime();

            for (const [id, delivery] of this.deliveryQueue.entries()) {
                if (
                    delivery.status === WebhookDeliveryStatus.RETRYING &&
                    delivery.nextRetryAt &&
                    delivery.nextRetryAt <= now
                ) {
                    this.attemptDelivery(delivery).catch(err =>
                        this.logger.error('Retry delivery failed', err instanceof Error ? err : undefined),
                    );
                }

                if (
                    delivery.status === WebhookDeliveryStatus.DEAD_LETTER &&
                    delivery.lastAttemptAt &&
                    nowMs - delivery.lastAttemptAt.getTime() > WEBHOOK_QUEUE.DEAD_LETTER_RETENTION_MS
                ) {
                    this.deliveryQueue.delete(id);
                    this.logger.debug('Removed old dead letter entry', { deliveryId: id });
                }

                if (
                    delivery.status === WebhookDeliveryStatus.DELIVERED &&
                    delivery.deliveredAt &&
                    nowMs - delivery.deliveredAt.getTime() > WEBHOOK_QUEUE.DELIVERED_RETENTION_MS
                ) {
                    this.deliveryQueue.delete(id);
                }
            }
        }, WEBHOOK.RETRY_CHECK_INTERVAL_MS);
        if (typeof this.retryProcessorHandle.unref === 'function') {
            this.retryProcessorHandle.unref();
        }
    }

    getDeliveries(options?: {
        status?: WebhookDeliveryStatus;
        webhookId?: string;
        limit?: number;
    }): WebhookDelivery[] {
        return filterDeliveries(Array.from(this.deliveryQueue.values()), options);
    }

    getDelivery(deliveryId: string): WebhookDelivery | undefined {
        return this.deliveryQueue.get(deliveryId);
    }

    getDeadLetterQueue(): WebhookDelivery[] {
        return this.getDeliveries({ status: WebhookDeliveryStatus.DEAD_LETTER });
    }

    async retryDeadLetter(deliveryId: string): Promise<WebhookDelivery | null> {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery || delivery.status !== WebhookDeliveryStatus.DEAD_LETTER) {
            return null;
        }

        resetForRetry(delivery);

        await this.attemptDelivery(delivery);

        return delivery;
    }

    removeDeadLetter(deliveryId: string): boolean {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery || delivery.status !== WebhookDeliveryStatus.DEAD_LETTER) {
            return false;
        }
        return this.deliveryQueue.delete(deliveryId);
    }

    getStats(): WebhookStats {
        return calculateWebhookStats(Array.from(this.deliveryQueue.values()));
    }
}
