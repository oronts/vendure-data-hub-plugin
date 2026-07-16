import { createHash, randomUUID } from 'crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import {
    Job,
    JobQueue,
    JobQueueService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    VendureEvent,
} from '@vendure/core';
import { In, LessThanOrEqual } from 'typeorm';
import {
    EVENT_TRIGGER_OUTBOX,
    LOGGER_CONTEXTS,
    PipelineStatus,
    QUEUE_NAMES,
    RunStatus,
    SCHEDULER,
} from '../../constants';
import {
    DataHubEventTriggerOutbox,
    EventTriggerOutboxStatus,
    Pipeline,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubRunQueueHandler } from '../../jobs';
import { ensureError, getErrorMessage } from '../../utils/error.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { PipelineService } from '../pipeline/pipeline.service';
import { DomainEventsService } from './domain-events.service';
import {
    createEventSeedRecords,
    discoverEventTriggers,
    getVendureEventType,
} from './event-trigger.contract';

interface EventTriggerOutboxJobData {
    deliveryId: string;
    dispatchToken: string;
}

const RECOVERABLE_STATUSES = [
    EventTriggerOutboxStatus.DISPATCHING,
    EventTriggerOutboxStatus.QUEUED,
    EventTriggerOutboxStatus.PROCESSING,
] as const;

const QUEUEABLE_RUN_STATUSES = new Set<RunStatus>([
    RunStatus.PENDING,
]);

@Injectable()
export class EventTriggerOutboxService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private queue!: JobQueue<EventTriggerOutboxJobData>;
    private dispatchTimer: NodeJS.Timeout | null = null;
    private dispatching = false;
    private destroying = false;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private jobQueueService: JobQueueService,
        private pipelineService: PipelineService,
        private runQueue: DataHubRunQueueHandler,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EVENT_TRIGGER_OUTBOX);
    }

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue<EventTriggerOutboxJobData>({
            name: QUEUE_NAMES.EVENT_TRIGGER_OUTBOX,
            process: job => this.processJob(job),
        });

        await this.dispatchPending();
        this.dispatchTimer = setInterval(() => {
            this.dispatchPending().catch(error => {
                this.logger.error('Event outbox dispatch failed', ensureError(error));
            });
        }, EVENT_TRIGGER_OUTBOX.DISPATCH_INTERVAL_MS);
        this.dispatchTimer.unref();

        this.logger.info('Event trigger outbox initialized', {
            queueName: QUEUE_NAMES.EVENT_TRIGGER_OUTBOX,
            dispatchIntervalMs: EVENT_TRIGGER_OUTBOX.DISPATCH_INTERVAL_MS,
        });
    }

    onModuleDestroy(): void {
        this.destroying = true;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
    }

    async capture(vendureEvent: VendureEvent): Promise<number> {
        const eventType = getVendureEventType(vendureEvent);
        const ctx = this.getEventContext(vendureEvent);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const pipelines = await pipelineRepo.find({
            where: {
                status: PipelineStatus.PUBLISHED,
                enabled: true,
            },
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (pipelines.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `EVENT trigger discovery exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
            );
        }

        const triggers = pipelines.flatMap(discoverEventTriggers)
            .filter(trigger => trigger.event === eventType);
        if (triggers.length === 0) return 0;

        const eventDeliveryId = randomUUID();
        const seedRecords = createEventSeedRecords(eventType, vendureEvent);
        const now = new Date();
        const deliveries = triggers.map(trigger => {
            const delivery = Object.assign(new DataHubEventTriggerOutbox(), {
                deliveryKey: this.createDeliveryKey(eventDeliveryId, trigger.pipelineId, trigger.triggerKey),
                eventType,
                pipelineId: trigger.pipelineId,
                pipelineCode: trigger.pipelineCode,
                triggerKey: trigger.triggerKey,
                channelId: String(ctx.channelId),
                channelToken: ctx.channel.token,
                languageCode: ctx.languageCode,
                currencyCode: ctx.currencyCode,
                status: EventTriggerOutboxStatus.PENDING,
                attempts: 0,
                availableAt: now,
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: null,
                runId: null,
                deliveredAt: null,
            });
            delivery.seedRecords = seedRecords;
            return delivery;
        });

        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).save(deliveries);
        this.logger.debug('Captured Vendure event deliveries in outbox', {
            event: eventType,
            deliveryCount: deliveries.length,
            channelId: String(ctx.channelId),
        });
        return deliveries.length;
    }

    private getEventContext(vendureEvent: VendureEvent): RequestContext {
        const ctx = (vendureEvent as VendureEvent & { ctx?: RequestContext }).ctx;
        if (!ctx) {
            throw new Error('Supported Vendure EVENT trigger was published without RequestContext');
        }
        return ctx;
    }

    private createDeliveryKey(eventDeliveryId: string, pipelineId: string | number, triggerKey: string): string {
        return createHash('sha256')
            .update(`${eventDeliveryId}:${String(pipelineId)}:${triggerKey}`)
            .digest('hex');
    }

    private async dispatchPending(): Promise<void> {
        if (this.destroying || this.dispatching) return;
        this.dispatching = true;
        try {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            await this.recoverExpiredLeases(ctx);
            const deliveries = await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).find({
                where: {
                    status: EventTriggerOutboxStatus.PENDING,
                    availableAt: LessThanOrEqual(new Date()),
                },
                order: { createdAt: 'ASC' },
                take: EVENT_TRIGGER_OUTBOX.BATCH_SIZE,
            });
            for (const delivery of deliveries) {
                await this.dispatchOne(ctx, delivery);
            }
        } finally {
            this.dispatching = false;
        }
    }

    private async recoverExpiredLeases(ctx: RequestContext): Promise<void> {
        const now = new Date();
        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            {
                status: In([...RECOVERABLE_STATUSES]),
                leaseExpiresAt: LessThanOrEqual(now),
            },
            {
                status: EventTriggerOutboxStatus.PENDING,
                availableAt: now,
                leaseExpiresAt: null,
                dispatchToken: null,
            },
        );
    }

    private async dispatchOne(
        ctx: RequestContext,
        delivery: DataHubEventTriggerOutbox,
    ): Promise<void> {
        const dispatchToken = createHash('sha256').update(randomUUID()).digest('hex');
        const leaseExpiresAt = this.nextLeaseExpiry();
        const repo = this.connection.getRepository(ctx, DataHubEventTriggerOutbox);
        const claim = await repo.update(
            {
                id: delivery.id,
                status: EventTriggerOutboxStatus.PENDING,
                availableAt: LessThanOrEqual(new Date()),
            },
            {
                status: EventTriggerOutboxStatus.DISPATCHING,
                dispatchToken,
                leaseExpiresAt,
            },
        );
        if (claim.affected !== 1) return;

        try {
            await this.queue.add(
                { deliveryId: String(delivery.id), dispatchToken },
                { retries: EVENT_TRIGGER_OUTBOX.JOB_RETRIES },
            );
            await repo.update(
                {
                    id: delivery.id,
                    dispatchToken,
                    status: EventTriggerOutboxStatus.DISPATCHING,
                },
                { status: EventTriggerOutboxStatus.QUEUED },
            );
        } catch (error) {
            await this.releaseForRetry(ctx, delivery.id, dispatchToken, delivery.attempts, error);
            this.logger.error('Failed to enqueue event outbox delivery', ensureError(error), {
                deliveryId: String(delivery.id),
                event: delivery.eventType,
                pipelineCode: delivery.pipelineCode,
            });
        }
    }

    private async processJob(job: Job<EventTriggerOutboxJobData>): Promise<void> {
        const { deliveryId, dispatchToken } = job.data;
        const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(adminCtx, DataHubEventTriggerOutbox);
        const claim = await repo.update(
            {
                id: deliveryId,
                dispatchToken,
                status: In([
                    EventTriggerOutboxStatus.DISPATCHING,
                    EventTriggerOutboxStatus.QUEUED,
                ]),
            },
            {
                status: EventTriggerOutboxStatus.PROCESSING,
                leaseExpiresAt: this.nextLeaseExpiry(),
            },
        );
        if (claim.affected !== 1) return;

        try {
            const delivery = await repo.findOne({ where: { id: deliveryId, dispatchToken } });
            if (!delivery) return;
            const ctx = await this.createDeliveryContext(delivery);
            const run = await this.getOrCreateRun(ctx, delivery);
            if (QUEUEABLE_RUN_STATUSES.has(run.status)) {
                await this.runQueue.enqueueRun(run.id);
            }
            const deliveredAt = new Date();
            await repo.update(
                {
                    id: deliveryId,
                    dispatchToken,
                    status: EventTriggerOutboxStatus.PROCESSING,
                },
                {
                    status: EventTriggerOutboxStatus.DELIVERED,
                    deliveredAt,
                    leaseExpiresAt: null,
                    dispatchToken: null,
                    lastError: null,
                },
            );
            this.domainEvents.publishTriggerFired(String(delivery.pipelineId), 'EVENT', {
                pipelineCode: delivery.pipelineCode,
                event: delivery.eventType,
                triggerKey: delivery.triggerKey,
                runId: String(run.id),
                seedRecordCount: delivery.seedRecords.length,
            });
        } catch (error) {
            await this.handleJobFailure(
                adminCtx,
                deliveryId,
                dispatchToken,
                job.attempts,
                job.retries + 1,
                error,
            );
            throw error;
        }
    }

    private async createDeliveryContext(delivery: DataHubEventTriggerOutbox): Promise<RequestContext> {
        return this.requestContextService.create({
            apiType: 'admin',
            channelOrToken: delivery.channelToken,
            languageCode: delivery.languageCode as LanguageCode,
            currencyCode: delivery.currencyCode as CurrencyCode,
        });
    }

    private async getOrCreateRun(
        ctx: RequestContext,
        delivery: DataHubEventTriggerOutbox,
    ): Promise<PipelineRun> {
        if (delivery.runId) {
            const existing = await this.pipelineService.runById(ctx, delivery.runId);
            if (existing) return existing;
        }

        const result = await this.pipelineService.startIdempotentRunWithSeed(
            ctx,
            delivery.pipelineId,
            delivery.seedRecords,
            {
                triggerKey: delivery.triggerKey,
                skipPermissionCheck: true,
                triggeredBy: `event:${delivery.eventType}:${delivery.triggerKey}`,
                idempotencyKey: delivery.deliveryKey,
                idempotencyTtlSeconds: EVENT_TRIGGER_OUTBOX.IDEMPOTENCY_TTL_SECONDS,
                requestFingerprint: JSON.stringify({
                    event: delivery.eventType,
                    records: delivery.seedRecords,
                }),
                deferQueueEnqueue: true,
            },
        );
        delivery.runId = String(result.run.id);
        const dispatchToken = delivery.dispatchToken;
        if (!dispatchToken) {
            throw new Error(`Outbox delivery ${String(delivery.id)} lost its dispatch token`);
        }
        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            {
                id: delivery.id,
                dispatchToken,
                status: EventTriggerOutboxStatus.PROCESSING,
            },
            { runId: delivery.runId },
        );
        return result.run;
    }

    private async handleJobFailure(
        ctx: RequestContext,
        deliveryId: string,
        dispatchToken: string,
        attempt: number,
        maxAttempts: number,
        error: unknown,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, DataHubEventTriggerOutbox);
        const current = await repo.findOne({ where: { id: deliveryId, dispatchToken } });
        if (!current) return;

        const nextAttempts = current.attempts + 1;
        const lastError = this.truncateError(error);
        if (attempt < maxAttempts) {
            await repo.update(
                { id: deliveryId, dispatchToken, status: EventTriggerOutboxStatus.PROCESSING },
                {
                    status: EventTriggerOutboxStatus.QUEUED,
                    attempts: nextAttempts,
                    leaseExpiresAt: this.nextLeaseExpiry(),
                    lastError,
                },
            );
        } else {
            await this.releaseForRetry(ctx, deliveryId, dispatchToken, current.attempts, error);
        }

        this.logger.error('Event outbox delivery attempt failed', ensureError(error), {
            deliveryId,
            event: current.eventType,
            pipelineCode: current.pipelineCode,
            attempt,
            maxAttempts,
            retryScheduled: attempt >= maxAttempts,
        });
    }

    private async releaseForRetry(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
        attempts: number,
        error: unknown,
    ): Promise<void> {
        const nextAttempts = attempts + 1;
        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            { id: deliveryId, dispatchToken },
            {
                status: EventTriggerOutboxStatus.PENDING,
                attempts: nextAttempts,
                availableAt: new Date(Date.now() + this.retryDelayMs(nextAttempts)),
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: this.truncateError(error),
            },
        );
    }

    private retryDelayMs(attempts: number): number {
        const exponent = Math.max(0, attempts - 1);
        return Math.min(
            EVENT_TRIGGER_OUTBOX.RETRY_BASE_DELAY_MS * 2 ** exponent,
            EVENT_TRIGGER_OUTBOX.RETRY_MAX_DELAY_MS,
        );
    }

    private nextLeaseExpiry(): Date {
        return new Date(Date.now() + EVENT_TRIGGER_OUTBOX.LEASE_DURATION_MS);
    }

    private truncateError(error: unknown): string {
        return getErrorMessage(error).slice(0, EVENT_TRIGGER_OUTBOX.LAST_ERROR_MAX_LENGTH);
    }

}
