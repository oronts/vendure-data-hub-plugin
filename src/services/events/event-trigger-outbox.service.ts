import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import {
    EntityNotFoundError,
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
    QUEUE_NAMES,
    SCHEDULER,
} from '../../constants';
import {
    DataHubEventTriggerOutbox,
    EventTriggerOutboxStatus,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubRunQueueHandler } from '../../jobs';
import { ensureError } from '../../utils/error.utils';
import { SingleFlightTask } from '../../utils/async-operation-tracker';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { PipelineService } from '../pipeline/pipeline.service';
import { DomainEventsService } from './domain-events.service';
import { loadRunnablePipelineDefinitions } from '../pipeline/active-pipeline-definitions';
import {
    PipelineNotRunnableError,
    PublishedPipelineRevisionUnavailableError,
} from '../pipeline/pipeline-policy';
import {
    createEventSeedRecords,
    discoverEventTriggers,
    getVendureEventType,
} from './event-trigger.contract';
import {
    createEventTriggerDeliveries,
    createOutboxDispatchToken,
    getVendureEventContext,
    isQueueableRunStatus,
    nextOutboxLeaseExpiry,
    outboxRetryDelayMs,
    RECOVERABLE_OUTBOX_STATUSES,
    truncateOutboxError,
} from './event-trigger-outbox.helpers';

interface EventTriggerOutboxJobData {
    deliveryId: string;
    dispatchToken: string;
}

@Injectable()
export class EventTriggerOutboxService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private queue!: JobQueue<EventTriggerOutboxJobData>;
    private dispatchTimer: NodeJS.Timeout | null = null;
    private readonly dispatchTask = new SingleFlightTask<void>();
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
        if (this.destroying) return;
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

    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        await this.dispatchTask.settle();
    }

    async capture(vendureEvent: VendureEvent): Promise<number> {
        const eventType = getVendureEventType(vendureEvent);
        const ctx = getVendureEventContext(vendureEvent);
        const pipelines = await loadRunnablePipelineDefinitions(
            this.connection,
            ctx,
            SCHEDULER.MAX_PIPELINE_DISCOVERY,
        );

        const triggers = pipelines.flatMap(discoverEventTriggers)
            .filter(trigger => trigger.event === eventType);
        if (triggers.length === 0) return 0;

        const seedRecords = createEventSeedRecords(eventType, vendureEvent);
        const deliveries = createEventTriggerDeliveries(ctx, eventType, triggers, seedRecords);

        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).save(deliveries);
        this.logger.debug('Captured Vendure event deliveries in outbox', {
            event: eventType,
            deliveryCount: deliveries.length,
            channelId: String(ctx.channelId),
        });
        return deliveries.length;
    }

    private dispatchPending(): Promise<void> {
        if (this.destroying) return Promise.resolve();
        return this.dispatchTask.run(() => this.performDispatch());
    }

    private async performDispatch(): Promise<void> {
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
            if (this.destroying) return;
            await this.dispatchOne(ctx, delivery);
        }
    }

    private async recoverExpiredLeases(ctx: RequestContext): Promise<void> {
        const now = new Date();
        const repo = this.connection.getRepository(ctx, DataHubEventTriggerOutbox);
        const expiredLeaseCriteria = {
            status: In([...RECOVERABLE_OUTBOX_STATUSES]),
            leaseExpiresAt: LessThanOrEqual(now),
        };
        const expired = await repo.find({
            select: { id: true },
            where: expiredLeaseCriteria,
            order: { leaseExpiresAt: 'ASC' },
            take: EVENT_TRIGGER_OUTBOX.BATCH_SIZE,
        });
        if (expired.length === 0) return;

        await repo.update(
            {
                ...expiredLeaseCriteria,
                id: In(expired.map(delivery => delivery.id)),
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
        const dispatchToken = createOutboxDispatchToken();
        const leaseExpiresAt = nextOutboxLeaseExpiry();
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
        if (this.destroying) {
            await this.releaseDispatchClaim(ctx, delivery.id, dispatchToken);
            return;
        }

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

    private async releaseDispatchClaim(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
    ): Promise<void> {
        await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            {
                id: deliveryId,
                dispatchToken,
                status: EventTriggerOutboxStatus.DISPATCHING,
            },
            {
                status: EventTriggerOutboxStatus.PENDING,
                availableAt: new Date(),
                leaseExpiresAt: null,
                dispatchToken: null,
            },
        );
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
                leaseExpiresAt: nextOutboxLeaseExpiry(),
            },
        );
        if (claim.affected !== 1) return;

        try {
            const delivery = await repo.findOne({ where: { id: deliveryId, dispatchToken } });
            if (!delivery) return;
            const ctx = await this.createDeliveryContext(delivery);
            const run = await this.getOrCreateRun(ctx, delivery);
            if (isQueueableRunStatus(run.status)) {
                await this.runQueue.enqueueRun(run.id);
            }
            const deliveredAt = new Date();
            const transition = await repo.update(
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
            if (transition.affected !== 1) return;
            this.domainEvents.publishTriggerFired(String(delivery.pipelineId), 'EVENT', {
                pipelineCode: delivery.pipelineCode,
                event: delivery.eventType,
                triggerKey: delivery.triggerKey,
                runId: String(run.id),
                seedRecordCount: delivery.seedRecords.length,
            });
        } catch (error) {
            if (
                error instanceof PublishedPipelineRevisionUnavailableError
                || error instanceof PipelineNotRunnableError
            ) {
                await this.markPermanentlyFailed(
                    adminCtx,
                    deliveryId,
                    dispatchToken,
                    error,
                );
                return;
            }
            const retainedOwnership = await this.handleJobFailure(
                adminCtx,
                deliveryId,
                dispatchToken,
                job.attempts,
                job.retries + 1,
                error,
            );
            if (retainedOwnership) throw error;
        }
    }

    private async createDeliveryContext(delivery: DataHubEventTriggerOutbox): Promise<RequestContext> {
        const ctx = await this.requestContextService.create({
            apiType: 'admin',
            channelOrToken: delivery.channelToken,
            languageCode: delivery.languageCode as LanguageCode,
            currencyCode: delivery.currencyCode as CurrencyCode,
        });
        if (String(ctx.channelId) !== delivery.channelId) {
            throw new PipelineNotRunnableError('Event trigger channel context is unavailable');
        }
        return ctx;
    }

    private async getOrCreateRun(
        ctx: RequestContext,
        delivery: DataHubEventTriggerOutbox,
    ): Promise<PipelineRun> {
        if (delivery.runId) {
            const existing = await this.pipelineService.runById(ctx, delivery.runId);
            if (existing) return existing;
        }

        if (delivery.revisionId == null) {
            throw new PublishedPipelineRevisionUnavailableError(
                delivery.pipelineCode,
                null,
            );
        }
        let result: Awaited<
            ReturnType<PipelineService['startPinnedIdempotentRunWithSeed']>
        >;
        try {
            result = await this.pipelineService.startPinnedIdempotentRunWithSeed(
                ctx,
                delivery.pipelineId,
                delivery.revisionId,
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
        } catch (error) {
            if (error instanceof EntityNotFoundError) {
                throw new PipelineNotRunnableError(
                    `Pipeline "${delivery.pipelineCode}" no longer exists`,
                );
            }
            throw error;
        }
        delivery.runId = String(result.run.id);
        const dispatchToken = delivery.dispatchToken;
        if (!dispatchToken) {
            throw new Error(`Outbox delivery ${String(delivery.id)} lost its dispatch token`);
        }
        const transition = await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            {
                id: delivery.id,
                dispatchToken,
                status: EventTriggerOutboxStatus.PROCESSING,
            },
            { runId: delivery.runId },
        );
        if (transition.affected !== 1) {
            throw new Error(`Outbox delivery ${String(delivery.id)} lost lease ownership`);
        }
        return result.run;
    }

    private async markPermanentlyFailed(
        ctx: RequestContext,
        deliveryId: string,
        dispatchToken: string,
        error: PublishedPipelineRevisionUnavailableError | PipelineNotRunnableError,
    ): Promise<void> {
        const failedAt = new Date();
        const transition = await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            {
                id: deliveryId,
                dispatchToken,
                status: EventTriggerOutboxStatus.PROCESSING,
            },
            {
                status: EventTriggerOutboxStatus.FAILED,
                failedAt,
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: truncateOutboxError(error),
            },
        );
        if (transition.affected !== 1) return;
        this.logger.error('Event outbox delivery failed permanently', error, {
            deliveryId,
        });
    }

    private async handleJobFailure(
        ctx: RequestContext,
        deliveryId: string,
        dispatchToken: string,
        attempt: number,
        maxAttempts: number,
        error: unknown,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DataHubEventTriggerOutbox);
        const current = await repo.findOne({ where: { id: deliveryId, dispatchToken } });
        if (!current) return false;

        const nextAttempts = current.attempts + 1;
        const lastError = truncateOutboxError(error);
        if (attempt < maxAttempts) {
            const transition = await repo.update(
                { id: deliveryId, dispatchToken, status: EventTriggerOutboxStatus.PROCESSING },
                {
                    status: EventTriggerOutboxStatus.QUEUED,
                    attempts: nextAttempts,
                    leaseExpiresAt: nextOutboxLeaseExpiry(),
                    lastError,
                },
            );
            if (transition.affected !== 1) return false;
        } else {
            const released = await this.releaseForRetry(
                ctx,
                deliveryId,
                dispatchToken,
                current.attempts,
                error,
            );
            if (!released) return false;
        }

        this.logger.error('Event outbox delivery attempt failed', ensureError(error), {
            deliveryId,
            event: current.eventType,
            pipelineCode: current.pipelineCode,
            attempt,
            maxAttempts,
            retryScheduled: attempt >= maxAttempts,
        });
        return true;
    }

    private async releaseForRetry(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
        attempts: number,
        error: unknown,
    ): Promise<boolean> {
        const nextAttempts = attempts + 1;
        const result = await this.connection.getRepository(ctx, DataHubEventTriggerOutbox).update(
            { id: deliveryId, dispatchToken },
            {
                status: EventTriggerOutboxStatus.PENDING,
                attempts: nextAttempts,
                availableAt: new Date(Date.now() + outboxRetryDelayMs(nextAttempts)),
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: truncateOutboxError(error),
            },
        );
        return result.affected === 1;
    }

}
