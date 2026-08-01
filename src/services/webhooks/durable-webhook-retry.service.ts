import { randomUUID } from 'crypto';
import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
    Job,
    JobQueue,
    JobQueueService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import type { WebhookRetryJobData } from '../../jobs/types';
import { DataHubWebhookDelivery } from '../../entities/pipeline/webhook-delivery.entity';
import {
    CONTENT_TYPES,
    HTTP_HEADERS,
    LOGGER_CONTEXTS,
    PAGINATION,
    QUEUE_NAMES,
    WEBHOOK,
    WEBHOOK_QUEUE,
} from '../../constants';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { SingleFlightTask } from '../../utils/async-operation-tracker';
import { DEFAULT_RETRY_CONFIG, createRetryConfig } from '../../utils/retry.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { SecretService } from '../config/secret.service';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import {
    calculateBackoff,
    calculateWebhookStats,
    createRequestFingerprint,
    generateDeliveryId,
    serializeWebhookPayload,
    toWebhookDelivery,
} from './webhook.helpers';
import { decryptWebhookReplayEnvelope } from './webhook-replay-envelope';
import { createWebhookAttemptHeaders } from './webhook-attempt-headers';
import { DeliveryFilter, WebhookDeliveryStore } from './webhook-delivery.store';
import {
    normalizeWebhookDeliveryConfig,
    preparePendingWebhookDelivery,
} from './webhook-delivery.factory';
import { validateDeliveryKey, validateWebhookConfig } from './webhook-validation';
import {
    RetryConfig,
    WebhookConfig,
    WebhookDelivery,
    WebhookDeliveryStatus,
    WebhookPayload,
    WebhookStats,
} from './webhook.types';


interface WebhookJobData extends WebhookRetryJobData {
    dispatchToken: string;
}

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly store: WebhookDeliveryStore;
    private queue!: JobQueue<WebhookJobData>;
    private dispatchTimer: NodeJS.Timeout | null = null;
    private maintenanceTimer: NodeJS.Timeout | null = null;
    private readonly dispatchTask = new SingleFlightTask<void>();
    private readonly maintenanceTask = new SingleFlightTask<void>();
    private destroying = false;
    private ssrfConfig?: UrlSecurityConfig;

    constructor(
        connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private jobQueueService: JobQueueService,
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private domainEvents?: DomainEventsService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK_RETRY);
        this.store = new WebhookDeliveryStore(connection);
    }

    configureSsrfProtection(config: UrlSecurityConfig): void {
        this.ssrfConfig = config;
    }

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue<WebhookJobData>({
            name: QUEUE_NAMES.WEBHOOK_RETRY,
            process: job => this.processJob(job),
        });
        await this.dispatchPending();
        if (this.destroying) return;
        await this.maintainHistory();
        if (this.destroying) return;
        this.dispatchTimer = setInterval(() => {
            this.dispatchPending().catch(() => {
                this.logger.error('Webhook delivery dispatch failed');
            });
        }, WEBHOOK.RETRY_CHECK_INTERVAL_MS);
        this.dispatchTimer.unref();
        this.maintenanceTimer = setInterval(() => {
            this.maintainHistory().catch(() => {
                this.logger.error('Webhook delivery history cleanup failed');
            });
        }, WEBHOOK_QUEUE.HISTORY_CLEANUP_INTERVAL_MS);
        this.maintenanceTimer.unref();
        this.logger.info('Durable webhook delivery initialized', {
            queueName: QUEUE_NAMES.WEBHOOK_RETRY,
            dispatchIntervalMs: WEBHOOK.RETRY_CHECK_INTERVAL_MS,
            historyCleanupIntervalMs: WEBHOOK_QUEUE.HISTORY_CLEANUP_INTERVAL_MS,
        });
    }

    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }
        await Promise.all([
            this.dispatchTask.settle(),
            this.maintenanceTask.settle(),
        ]);
    }

    async sendWebhook(
        ctx: RequestContext,
        config: WebhookConfig,
        payload: WebhookPayload,
        options?: {
            headers?: Record<string, string>;
            idempotencyKey?: string;
        },
    ): Promise<WebhookDelivery> {
        await this.validateConfig(ctx, config);
        const deliveryKey = validateDeliveryKey(options?.idempotencyKey) ?? generateDeliveryId();
        const serializedPayload = serializeWebhookPayload(payload);
        const normalizedConfig = normalizeWebhookDeliveryConfig(config);
        const requestFingerprint = createRequestFingerprint(
            normalizedConfig,
            serializedPayload,
            options?.headers,
        );
        const existing = await this.store.findByDeliveryKey(ctx, deliveryKey);
        if (existing) {
            return this.resolveIdempotentDelivery(existing, requestFingerprint);
        }

        const entity = await preparePendingWebhookDelivery({
            ctx,
            config: normalizedConfig,
            deliveryKey,
            serializedPayload,
            requestFingerprint,
            additionalHeaders: options?.headers,
            idempotencyKey: options?.idempotencyKey,
        });

        let saved: DataHubWebhookDelivery;
        try {
            saved = await this.store.save(ctx, entity);
        } catch (error) {
            if (!isDuplicateEntryError(getErrorMessage(error))) throw error;
            const winner = await this.store.findByDeliveryKey(ctx, deliveryKey);
            if (!winner) throw error;
            return this.resolveIdempotentDelivery(winner, requestFingerprint);
        }

        await this.dispatchOne(ctx, saved);
        return toWebhookDelivery(saved);
    }

    async getDeliveries(ctx: RequestContext, options?: Partial<DeliveryFilter>): Promise<WebhookDelivery[]> {
        const limit = Math.min(
            Math.max(1, options?.limit ?? PAGINATION.PAGE_SIZE),
            PAGINATION.MAX_QUERY_LIMIT,
        );
        const rows = await this.store.list(ctx, {
            status: options?.status,
            webhookId: options?.webhookId,
            limit,
        });
        return rows.map(toWebhookDelivery);
    }

    async getDelivery(ctx: RequestContext, deliveryId: string): Promise<WebhookDelivery | undefined> {
        const entity = await this.store.findByDeliveryKey(ctx, deliveryId);
        return entity ? toWebhookDelivery(entity) : undefined;
    }

    getDeadLetterQueue(ctx: RequestContext): Promise<WebhookDelivery[]> {
        return this.getDeliveries(ctx, {
            status: WebhookDeliveryStatus.DEAD_LETTER,
            limit: PAGINATION.MAX_QUERY_LIMIT,
        });
    }

    async retryDeadLetter(
        ctx: RequestContext,
        deliveryId: string,
    ): Promise<WebhookDelivery | null> {
        const delivery = await this.store.resetDeadLetter(ctx, deliveryId);
        if (!delivery) return null;
        await this.dispatchOne(ctx, delivery);
        return toWebhookDelivery(delivery);
    }

    removeDeadLetter(ctx: RequestContext, deliveryId: string): Promise<boolean> {
        return this.store.removeDeadLetter(ctx, deliveryId);
    }

    async getStats(ctx: RequestContext): Promise<WebhookStats> {
        return calculateWebhookStats(await this.store.listStats(ctx));
    }

    private async validateConfig(ctx: RequestContext, config: WebhookConfig): Promise<void> {
        validateWebhookConfig(config);
        await assertUrlSafe(config.url, this.ssrfConfig);
        const secretCodes = [
            ...(config.secretCode ? [config.secretCode] : []),
            ...Object.values(config.headerSecretCodes ?? {}),
        ];
        const validation = await this.secretService.validateSecrets(ctx, secretCodes);
        if (!validation.valid) {
            throw new Error(
                `Webhook Secret Codes are unavailable: ${validation.missing.join(', ')}`,
            );
        }
    }

    private resolveIdempotentDelivery(
        existing: DataHubWebhookDelivery,
        requestFingerprint: string,
    ): WebhookDelivery {
        if (existing.requestFingerprint !== requestFingerprint) {
            throw new Error(`Webhook idempotency key conflict: ${existing.deliveryKey}`);
        }
        return toWebhookDelivery(existing);
    }


    private dispatchPending(): Promise<void> {
        if (this.destroying) return Promise.resolve();
        return this.dispatchTask.run(() => this.performDispatch());
    }

    private async performDispatch(): Promise<void> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const now = new Date();
        await this.store.recoverExpiredLeases(ctx, now);
        if (this.destroying) return;
        const due = await this.store.findDue(ctx, now);
        for (const delivery of due) {
            if (this.destroying) return;
            await this.dispatchOne(ctx, delivery);
        }
    }

    private maintainHistory(): Promise<void> {
        if (this.destroying) return Promise.resolve();
        return this.maintenanceTask.run(() => this.performHistoryMaintenance());
    }

    private async performHistoryMaintenance(): Promise<void> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const result = await this.store.deleteExpiredHistory(ctx, new Date());
        if (result.delivered > 0 || result.deadLetters > 0) {
            this.logger.info('Webhook delivery history cleanup completed', result);
        }
    }

    private async dispatchOne(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
    ): Promise<void> {
        const dispatchToken = randomUUID().replace(/-/g, '');
        const claimed = await this.store.claim(ctx, delivery.id, dispatchToken, new Date());
        if (!claimed) return;
        if (this.destroying) {
            await this.store.releaseClaim(ctx, delivery.id, dispatchToken);
            return;
        }
        try {
            await this.queue.add(
                { deliveryId: String(delivery.id), dispatchToken },
                { retries: WEBHOOK_QUEUE.JOB_RETRIES },
            );
        } catch {
            await this.store.releaseAfterEnqueueFailure(
                ctx,
                delivery.id,
                dispatchToken,
                new Date(),
            );
            this.logger.error('Webhook delivery enqueue failed', undefined, {
                deliveryId: delivery.deliveryKey,
                webhookId: delivery.webhookId,
            });
        }
    }

    private async processJob(job: Job<WebhookJobData>): Promise<void> {
        const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
        const delivery = await this.store.findClaimed(
            adminCtx,
            job.data.deliveryId,
            job.data.dispatchToken,
        );
        if (!delivery) return;
        const renewed = await this.store.renewLease(
            adminCtx,
            delivery.id,
            job.data.dispatchToken,
            new Date(),
        );
        if (!renewed) return;
        const ctx = await this.requestContextService.create({
            apiType: 'admin',
            channelOrToken: delivery.channelToken,
        });
        if (String(ctx.channelId) !== delivery.channelId) {
            await this.finishFailure(
                adminCtx,
                delivery,
                job.data.dispatchToken,
                'Webhook channel context is unavailable',
            );
            return;
        }
        await this.attemptDelivery(ctx, delivery, job.data.dispatchToken);
    }

    private async attemptDelivery(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
        dispatchToken: string,
    ): Promise<void> {
        const attemptedAt = new Date();
        const attempts = delivery.attempts + 1;
        let configuredRetry: RetryConfig | undefined;
        try {
            const envelope = await decryptWebhookReplayEnvelope(
                delivery.encryptedReplayEnvelope,
            );
            configuredRetry = envelope.config.retryConfig;
            const headers = await createWebhookAttemptHeaders(
                ctx,
                envelope,
                this.secretService,
            );
            const response = await secureFetch(
                envelope.config.url,
                {
                    method: envelope.config.method ?? 'POST',
                    headers: {
                        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                        ...headers,
                    },
                    body: envelope.serializedPayload,
                    signal: AbortSignal.timeout(WEBHOOK.TIMEOUT_MS),
                },
                this.ssrfConfig,
            );
            await response.body?.cancel().catch(() => undefined);
            if (response.ok) {
                await this.finishSuccess(
                    ctx,
                    delivery,
                    dispatchToken,
                    attempts,
                    attemptedAt,
                    response.status,
                );
                return;
            }
            await this.finishFailure(
                ctx,
                delivery,
                dispatchToken,
                `HTTP ${response.status}`,
                attempts,
                attemptedAt,
                response.status,
                envelope.config.retryConfig,
                envelope.config.retryConfig?.retryableStatusCodes?.includes(response.status) ?? true,
            );
        } catch {
            await this.finishFailure(
                ctx,
                delivery,
                dispatchToken,
                'Webhook request failed',
                attempts,
                attemptedAt,
                undefined,
                configuredRetry,
            );
        }
    }


    private async finishSuccess(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
        dispatchToken: string,
        attempts: number,
        attemptedAt: Date,
        responseStatus: number,
    ): Promise<void> {
        const deliveredAt = new Date();
        const transitioned = await this.store.markDelivered(
            ctx,
            delivery,
            dispatchToken,
            attempts,
            attemptedAt,
            responseStatus,
            deliveredAt,
        );
        if (!transitioned) return;
        this.logger.info('Webhook delivered successfully', {
            deliveryId: delivery.deliveryKey,
            webhookId: delivery.webhookId,
            url: delivery.publicUrl,
            responseStatus,
            attempts,
        });
        this.domainEvents?.publishWebhookDelivery(
            'WebhookDeliverySucceeded',
            delivery.deliveryKey,
            delivery.webhookId,
            { attempts, responseStatus },
        );
    }

    private async finishFailure(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
        dispatchToken: string,
        reason: string,
        attempts = delivery.attempts + 1,
        attemptedAt = new Date(),
        responseStatus?: number,
        configuredRetry?: RetryConfig,
        retryable = true,
    ): Promise<void> {
        const retryConfig = createRetryConfig(configuredRetry, {
            maxAttempts: delivery.maxAttempts,
            initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
            maxDelayMs: WEBHOOK.HOOK_MAX_DELAY_MS,
            backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
            jitterFactor: DEFAULT_RETRY_CONFIG.jitterFactor,
        });
        const willRetry = retryable && attempts < delivery.maxAttempts;
        const nextRetryAt = willRetry
            ? new Date(Date.now() + calculateBackoff(attempts, retryConfig))
            : null;
        const transitioned = await this.store.markFailed(ctx, delivery, dispatchToken, {
            status: willRetry
                ? WebhookDeliveryStatus.RETRYING
                : WebhookDeliveryStatus.DEAD_LETTER,
            attempts,
            attemptedAt,
            nextRetryAt,
            responseStatus: responseStatus ?? null,
            error: reason,
        });
        if (!transitioned) return;
        this.domainEvents?.publishWebhookDelivery(
            'WebhookDeliveryFailed',
            delivery.deliveryKey,
            delivery.webhookId,
            { attempts, responseStatus, error: reason },
        );
        this.domainEvents?.publishWebhookDelivery(
            willRetry ? 'WebhookDeliveryRetrying' : 'WebhookDeliveryDeadLetter',
            delivery.deliveryKey,
            delivery.webhookId,
            { attempts, responseStatus, error: reason },
        );
        this.logger.warn(
            willRetry ? 'Webhook retry scheduled' : 'Webhook moved to dead letter queue',
            {
                deliveryId: delivery.deliveryKey,
                webhookId: delivery.webhookId,
                url: delivery.publicUrl,
                attempts,
                maxAttempts: delivery.maxAttempts,
                nextRetryAt: nextRetryAt?.toISOString(),
                reason,
            },
        );
    }
}
