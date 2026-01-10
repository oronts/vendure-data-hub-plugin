/**
 * Webhook Retry Service
 *
 * Manages webhook delivery with automatic retry and dead letter queue.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
    TransactionalConnection,
    JobQueue,
    JobQueueService,
} from '@vendure/core';
import { DEFAULTS, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

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

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private deliveryQueue: Map<string, WebhookDelivery> = new Map();
    private webhookConfigs: Map<string, WebhookConfig> = new Map();
    private jobQueue: JobQueue<{ deliveryId: string }> | undefined;
    private retryProcessorHandle: ReturnType<typeof setInterval> | null = null;

    constructor(
        private connection: TransactionalConnection,
        private jobQueueService: JobQueueService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK_RETRY);
    }

    async onModuleDestroy(): Promise<void> {
        if (this.retryProcessorHandle) {
            clearInterval(this.retryProcessorHandle);
            this.retryProcessorHandle = null;
            this.logger.debug('Webhook retry processor stopped');
        }
    }

    async onModuleInit() {
        // Create job queue for retry processing
        this.jobQueue = await this.jobQueueService.createQueue({
            name: 'datahub-webhook-retry',
            process: async (job) => {
                await this.processRetry(job.data.deliveryId);
            },
        });

        // Start background processor for pending retries
        this.startRetryProcessor();

        this.logger.info('WebhookRetryService initialized', {
            retryCheckIntervalMs: DEFAULTS.WEBHOOK_RETRY_CHECK_INTERVAL_MS,
        });
    }

    /**
     * Register a webhook configuration
     */
    registerWebhook(config: WebhookConfig): void {
        this.webhookConfigs.set(config.id, {
            ...config,
            method: config.method || 'POST',
            enabled: config.enabled !== false,
        });
        this.logger.info('Registered webhook', {
            webhookId: config.id,
            url: config.url,
            method: config.method || 'POST',
        });
    }

    /**
     * Send a webhook with automatic retry
     */
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

        // Build headers
        const headers = buildHeaders(config, options?.headers);

        // Sign payload if secret is configured
        if (config.secret) {
            const signature = signPayload(payload, config.secret);
            const headerName = config.signatureHeader || 'X-DataHub-Signature';
            headers[headerName] = signature;
        }

        // Create delivery record
        const delivery = createDeliveryRecord(
            webhookId,
            config,
            payload,
            headers,
            options?.idempotencyKey,
            config.retryConfig?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
        );

        // Store delivery
        this.deliveryQueue.set(delivery.id, delivery);

        // Attempt delivery
        await this.attemptDelivery(delivery);

        return delivery;
    }

    /**
     * Attempt to deliver a webhook
     */
    private async attemptDelivery(delivery: WebhookDelivery): Promise<void> {
        const config = this.webhookConfigs.get(delivery.webhookId);
        if (!config) return;

        delivery.attempts++;
        delivery.lastAttemptAt = new Date();

        try {
            const response = await fetch(delivery.url, {
                method: delivery.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...delivery.headers,
                },
                body: JSON.stringify(delivery.payload),
            });

            delivery.responseStatus = response.status;
            delivery.responseBody = await response.text().catch(() => '');

            if (response.ok) {
                // Success
                delivery.status = WebhookDeliveryStatus.DELIVERED;
                delivery.deliveredAt = new Date();
                this.logger.info('Webhook delivered successfully', {
                    deliveryId: delivery.id,
                    webhookId: delivery.webhookId,
                    url: delivery.url,
                    statusCode: response.status,
                    attempts: delivery.attempts,
                    durationMs: Date.now() - (delivery.lastAttemptAt?.getTime() ?? Date.now()),
                });
            } else {
                // Server error - retry
                this.handleFailure(delivery, config, `HTTP ${response.status}`);
            }
        } catch (error) {
            // Network error - retry
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            delivery.error = errorMessage;
            this.handleFailure(delivery, config, errorMessage);
        }
    }

    /**
     * Handle delivery failure
     */
    private handleFailure(
        delivery: WebhookDelivery,
        config: WebhookConfig,
        reason: string,
    ): void {
        if (!shouldRetry(delivery)) {
            // Move to dead letter queue
            markAsDeadLetter(delivery);
            this.logger.warn('Webhook moved to dead letter queue', {
                deliveryId: delivery.id,
                webhookId: delivery.webhookId,
                url: delivery.url,
                attempts: delivery.attempts,
                maxAttempts: delivery.maxAttempts,
                reason,
            });
        } else {
            // Schedule retry
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

            // Schedule retry using setTimeout
            setTimeout(() => {
                this.jobQueue?.add({ deliveryId: delivery.id });
            }, delay);
        }
    }

    /**
     * Process a retry
     */
    private async processRetry(deliveryId: string): Promise<void> {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery) return;

        if (delivery.status !== WebhookDeliveryStatus.RETRYING) return;

        await this.attemptDelivery(delivery);
    }

    /**
     * Start background processor for missed retries
     */
    private startRetryProcessor() {
        this.retryProcessorHandle = setInterval(() => {
            const now = new Date();
            for (const [id, delivery] of this.deliveryQueue.entries()) {
                if (
                    delivery.status === WebhookDeliveryStatus.RETRYING &&
                    delivery.nextRetryAt &&
                    delivery.nextRetryAt <= now
                ) {
                    this.attemptDelivery(delivery);
                }
            }
        }, DEFAULTS.WEBHOOK_RETRY_CHECK_INTERVAL_MS);
    }

    // QUERY METHODS

    /**
     * Get all deliveries
     */
    getDeliveries(options?: {
        status?: WebhookDeliveryStatus;
        webhookId?: string;
        limit?: number;
    }): WebhookDelivery[] {
        return filterDeliveries(Array.from(this.deliveryQueue.values()), options);
    }

    /**
     * Get delivery by ID
     */
    getDelivery(deliveryId: string): WebhookDelivery | undefined {
        return this.deliveryQueue.get(deliveryId);
    }

    /**
     * Get dead letter queue items
     */
    getDeadLetterQueue(): WebhookDelivery[] {
        return this.getDeliveries({ status: WebhookDeliveryStatus.DEAD_LETTER });
    }

    /**
     * Retry a dead letter item
     */
    async retryDeadLetter(deliveryId: string): Promise<WebhookDelivery | null> {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery || delivery.status !== WebhookDeliveryStatus.DEAD_LETTER) {
            return null;
        }

        // Reset for retry
        resetForRetry(delivery);

        await this.attemptDelivery(delivery);

        return delivery;
    }

    /**
     * Remove a dead letter item
     */
    removeDeadLetter(deliveryId: string): boolean {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery || delivery.status !== WebhookDeliveryStatus.DEAD_LETTER) {
            return false;
        }
        return this.deliveryQueue.delete(deliveryId);
    }

    /**
     * Get webhook statistics
     */
    getStats(): WebhookStats {
        return calculateWebhookStats(Array.from(this.deliveryQueue.values()));
    }
}
