import { describe, expect, it, vi } from 'vitest';
import {
    EntityNotFoundError,
    EventBus,
    Job,
    JobQueueService,
    ProductEvent,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { VENDURE_EVENT_TYPES, type PipelineDefinition } from '../../../shared/types';
import { PipelineStatus, RevisionType, RunStatus } from '../../constants';
import {
    DataHubEventTriggerOutbox,
    EventTriggerOutboxStatus,
    Pipeline,
    PipelineRevision,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubRunQueueHandler } from '../../jobs';
import { DataHubLoggerFactory } from '../logger';
import { PipelineService } from '../pipeline/pipeline.service';
import { DomainEventsService } from './domain-events.service';
import { EventTriggerOutboxService } from './event-trigger-outbox.service';
import { DataHubEventTriggerService } from './event-trigger.service';
import { PipelineNotRunnableError } from '../pipeline/pipeline-policy';

interface OutboxJobData {
    deliveryId: string;
    dispatchToken: string;
}

const definition: PipelineDefinition = {
    version: 1,
    steps: [
        { key: 'on-product', type: 'TRIGGER', config: { type: 'EVENT', event: 'ProductEvent' } },
    ],
};

function createLoggerFactory() {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    return {
        logger,
        factory: { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
    };
}

function createProductEvent(ctx: RequestContext): ProductEvent {
    return Object.assign(Object.create(ProductEvent.prototype) as ProductEvent, {
        ctx,
        entity: { id: 42, name: 'Must not enter the outbox' },
        type: 'updated' as const,
    });
}

describe('EventTriggerOutboxService capture', () => {
    it('writes channel-safe deliveries through the event transaction context', async () => {
        const ctx = {
            channelId: 7,
            channel: { token: 'private-channel-token' },
            languageCode: 'en',
            currencyCode: 'EUR',
        } as unknown as RequestContext;
        const pipeline = {
            id: 3,
            code: 'product-event-sync',
            enabled: true,
            status: PipelineStatus.PUBLISHED,
            currentRevisionId: 17,
            definition,
        } as Pipeline;
        const pipelineRepo = { find: vi.fn(async () => [pipeline]) };
        const revisionRepo = {
            find: vi.fn(async () => [Object.assign(new PipelineRevision(), {
                id: 17,
                pipelineId: 3,
                type: RevisionType.PUBLISHED,
                definition,
            })]),
        };
        const outboxRepo = { save: vi.fn(async (rows: DataHubEventTriggerOutbox[]) => rows) };
        const connection = {
            getRepository: vi.fn((repositoryCtx: RequestContext, entity: unknown) => {
                expect(repositoryCtx).toBe(ctx);
                return entity === Pipeline
                    ? pipelineRepo
                    : entity === PipelineRevision
                        ? revisionRepo
                        : outboxRepo;
            }),
        };
        const { factory } = createLoggerFactory();
        const service = new EventTriggerOutboxService(
            connection as unknown as TransactionalConnection,
            {} as RequestContextService,
            {} as JobQueueService,
            {} as PipelineService,
            {} as DataHubRunQueueHandler,
            {} as DomainEventsService,
            factory,
        );

        await expect(service.capture(createProductEvent(ctx))).resolves.toBe(1);

        const deliveries = outboxRepo.save.mock.calls[0]?.[0];
        expect(deliveries).toHaveLength(1);
        expect(deliveries?.[0]).toMatchObject({
            eventType: 'ProductEvent',
            pipelineId: 3,
            revisionId: 17,
            pipelineCode: 'product-event-sync',
            triggerKey: 'on-product',
            channelId: '7',
            channelToken: 'private-channel-token',
            languageCode: 'en',
            currencyCode: 'EUR',
            status: EventTriggerOutboxStatus.PENDING,
            attempts: 0,
        });
        expect(deliveries?.[0].deliveryKey).toMatch(/^[a-f0-9]{64}$/);
        expect(deliveries?.[0].seedRecords).toEqual([{
            event: 'ProductEvent',
            channelId: '7',
            id: '42',
            __operation: 'UPDATE',
        }]);
        expect(JSON.stringify(deliveries)).not.toContain('Must not enter the outbox');
    });

    it('fails closed when a supported event has no transaction context', async () => {
        const { factory } = createLoggerFactory();
        const service = new EventTriggerOutboxService(
            {} as TransactionalConnection,
            {} as RequestContextService,
            {} as JobQueueService,
            {} as PipelineService,
            {} as DataHubRunQueueHandler,
            {} as DomainEventsService,
            factory,
        );
        const event = createProductEvent(undefined as unknown as RequestContext);

        await expect(service.capture(event)).rejects.toThrow(
            'Supported Vendure EVENT trigger was published without RequestContext',
        );
    });
});

function createDelivery(): DataHubEventTriggerOutbox {
    const delivery = new DataHubEventTriggerOutbox();
    Object.assign(delivery, {
        id: 10,
        deliveryKey: 'a'.repeat(64),
        eventType: 'ProductEvent',
        pipelineId: 3,
        revisionId: 17,
        pipelineCode: 'product-event-sync',
        triggerKey: 'on-product',
        channelId: '7',
        channelToken: 'private-channel-token',
        languageCode: 'en',
        currencyCode: 'EUR',
        seedRecords: [{ event: 'ProductEvent', id: '42', __operation: 'UPDATE' }],
        status: EventTriggerOutboxStatus.QUEUED,
        attempts: 0,
        availableAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
        dispatchToken: 'dispatch-token',
        lastError: null,
        runId: null,
        deliveredAt: null,
        failedAt: null,
    });
    return delivery;
}

function createWorkerFixture(options?: {
    enqueueError?: Error;
    claimAffected?: number;
    expiredLeaseCount?: number;
    deliveryChannelId?: number;
    deliveredAffected?: number;
}) {
    const delivery = createDelivery();
    const run = Object.assign(new PipelineRun(), {
        id: 91,
        status: RunStatus.PENDING,
    });
    const outboxRepo = {
        find: vi.fn(async (findOptions?: { order?: Record<string, unknown> }) => {
            if (!findOptions?.order?.leaseExpiresAt) return [];
            return Array.from(
                { length: options?.expiredLeaseCount ?? 0 },
                (_, index) => ({ id: index + 1 }),
            );
        }),
        findOne: vi.fn(async () => delivery),
        update: vi.fn(async (_criteria: unknown, values?: { status?: string }) => ({
            affected: values?.status === EventTriggerOutboxStatus.DELIVERED
                ? options?.deliveredAffected ?? 1
                : options?.claimAffected ?? 1,
        })),
    };
    const connection = {
        getRepository: vi.fn(() => outboxRepo),
    };
    const adminCtx = { channelId: 1 } as RequestContext;
    const deliveryCtx = {
        channelId: options?.deliveryChannelId ?? 7,
    } as RequestContext;
    const requestContextService = {
        create: vi.fn(async (input: { channelOrToken?: string }) =>
            input.channelOrToken ? deliveryCtx : adminCtx),
    };
    let processJob: ((job: Job<OutboxJobData>) => Promise<unknown>) | undefined;
    const outboxQueue = { add: vi.fn(async () => undefined) };
    const jobQueueService = {
        createQueue: vi.fn(async (queueOptions: {
            process: (job: Job<OutboxJobData>) => Promise<unknown>;
        }) => {
            processJob = queueOptions.process;
            return outboxQueue;
        }),
    };
    const pipelineService = {
        runById: vi.fn(async () => null),
        startPinnedIdempotentRunWithSeed: vi.fn(async () => ({ run, duplicate: false })),
    };
    const enqueueRun = options?.enqueueError
        ? vi.fn(async () => Promise.reject(options.enqueueError))
        : vi.fn(async () => undefined);
    const runQueue = { enqueueRun };
    const domainEvents = { publishTriggerFired: vi.fn() };
    const { factory, logger } = createLoggerFactory();
    const service = new EventTriggerOutboxService(
        connection as unknown as TransactionalConnection,
        requestContextService as unknown as RequestContextService,
        jobQueueService as unknown as JobQueueService,
        pipelineService as unknown as PipelineService,
        runQueue as unknown as DataHubRunQueueHandler,
        domainEvents as unknown as DomainEventsService,
        factory,
    );

    return {
        service,
        delivery,
        run,
        outboxRepo,
        requestContextService,
        pipelineService,
        enqueueRun,
        domainEvents,
        logger,
        getProcessJob: () => {
            if (!processJob) throw new Error('Outbox queue processor was not initialized');
            return processJob;
        },
    };
}

function createJob(attempts = 1, retries = 2): Job<OutboxJobData> {
    return {
        id: 100,
        data: { deliveryId: '10', dispatchToken: 'dispatch-token' },
        attempts,
        retries,
    } as Job<OutboxJobData>;
}

describe('EventTriggerOutboxService delivery', () => {
    it('does not write when no leases have expired', async () => {
        const fixture = createWorkerFixture();

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.outboxRepo.find).toHaveBeenCalledWith(expect.objectContaining({
            order: { leaseExpiresAt: 'ASC' },
            take: 100,
        }));
        expect(fixture.outboxRepo.update).not.toHaveBeenCalled();
    });

    it('recovers expired leases with the guarded update', async () => {
        const fixture = createWorkerFixture({ expiredLeaseCount: 1 });

        await fixture.service.onModuleInit();
        fixture.service.onModuleDestroy();

        expect(fixture.outboxRepo.update).toHaveBeenCalledOnce();
        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                id: expect.anything(),
                status: expect.anything(),
                leaseExpiresAt: expect.anything(),
            }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.PENDING,
                leaseExpiresAt: null,
                dispatchToken: null,
            }),
        );
    });

    it('creates one deferred idempotent run, awaits enqueue, and marks delivery complete', async () => {
        const fixture = createWorkerFixture();
        await fixture.service.onModuleInit();

        await fixture.getProcessJob()(createJob());
        fixture.service.onModuleDestroy();

        expect(fixture.requestContextService.create).toHaveBeenCalledWith({
            apiType: 'admin',
            channelOrToken: 'private-channel-token',
            languageCode: 'en',
            currencyCode: 'EUR',
        });
        expect(fixture.pipelineService.startPinnedIdempotentRunWithSeed).toHaveBeenCalledWith(
            expect.objectContaining({ channelId: 7 }),
            3,
            17,
            fixture.delivery.seedRecords,
            expect.objectContaining({
                triggerKey: 'on-product',
                idempotencyKey: fixture.delivery.deliveryKey,
                deferQueueEnqueue: true,
            }),
        );
        expect(fixture.enqueueRun).toHaveBeenCalledOnce();
        expect(fixture.enqueueRun).toHaveBeenCalledWith(91);
        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: EventTriggerOutboxStatus.PROCESSING }),
            expect.objectContaining({ status: EventTriggerOutboxStatus.DELIVERED }),
        );
        expect(fixture.domainEvents.publishTriggerFired).toHaveBeenCalledOnce();
    });

    it('fails permanently when the stored channel token resolves to another channel', async () => {
        const fixture = createWorkerFixture({ deliveryChannelId: 8 });
        await fixture.service.onModuleInit();

        await expect(fixture.getProcessJob()(createJob())).resolves.toBeUndefined();
        fixture.service.onModuleDestroy();

        expect(fixture.pipelineService.startPinnedIdempotentRunWithSeed).not.toHaveBeenCalled();
        expect(fixture.enqueueRun).not.toHaveBeenCalled();
        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: EventTriggerOutboxStatus.PROCESSING }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.FAILED,
                lastError: 'Event trigger channel context is unavailable',
            }),
        );
    });

    it('does not publish trigger success when the delivery lease was superseded', async () => {
        const fixture = createWorkerFixture({ deliveredAffected: 0 });
        await fixture.service.onModuleInit();

        await fixture.getProcessJob()(createJob());
        fixture.service.onModuleDestroy();

        expect(fixture.enqueueRun).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishTriggerFired).not.toHaveBeenCalled();
    });

    it('keeps a failed run enqueue observable and retryable', async () => {
        const enqueueError = new Error('run queue unavailable');
        const fixture = createWorkerFixture({ enqueueError });
        await fixture.service.onModuleInit();

        await expect(fixture.getProcessJob()(createJob(1, 2))).rejects.toBe(enqueueError);
        fixture.service.onModuleDestroy();

        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: EventTriggerOutboxStatus.PROCESSING }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.QUEUED,
                attempts: 1,
                lastError: 'run queue unavailable',
            }),
        );
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Event outbox delivery attempt failed',
            enqueueError,
            expect.objectContaining({ retryScheduled: false }),
        );
    });

    it('marks an unpinned historical delivery as permanently failed', async () => {
        const fixture = createWorkerFixture();
        fixture.delivery.revisionId = null;
        await fixture.service.onModuleInit();

        await expect(fixture.getProcessJob()(createJob())).resolves.toBeUndefined();
        fixture.service.onModuleDestroy();

        expect(
            fixture.pipelineService.startPinnedIdempotentRunWithSeed,
        ).not.toHaveBeenCalled();
        expect(fixture.enqueueRun).not.toHaveBeenCalled();
        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: EventTriggerOutboxStatus.PROCESSING,
            }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.FAILED,
                failedAt: expect.any(Date),
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: expect.stringContaining('Published revision none is unavailable'),
            }),
        );
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Event outbox delivery failed permanently',
            expect.any(Error),
            { deliveryId: '10' },
        );
    });

    it.each([
        'Archived pipeline cannot run',
        'Pipeline is disabled',
    ])('marks a delivery permanently failed when its pipeline is no longer runnable: %s', async errorMessage => {
        const fixture = createWorkerFixture();
        fixture.pipelineService.startPinnedIdempotentRunWithSeed.mockRejectedValueOnce(
            new PipelineNotRunnableError(errorMessage),
        );
        await fixture.service.onModuleInit();

        await expect(fixture.getProcessJob()(createJob())).resolves.toBeUndefined();
        fixture.service.onModuleDestroy();

        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: EventTriggerOutboxStatus.PROCESSING,
            }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.FAILED,
                failedAt: expect.any(Date),
                lastError: errorMessage,
            }),
        );
        expect(fixture.enqueueRun).not.toHaveBeenCalled();
    });

    it('marks a delivery permanently failed when its pipeline was deleted', async () => {
        const fixture = createWorkerFixture();
        fixture.pipelineService.startPinnedIdempotentRunWithSeed.mockRejectedValueOnce(
            new EntityNotFoundError('Pipeline', fixture.delivery.pipelineId),
        );
        await fixture.service.onModuleInit();

        await expect(fixture.getProcessJob()(createJob())).resolves.toBeUndefined();
        fixture.service.onModuleDestroy();

        expect(fixture.outboxRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: EventTriggerOutboxStatus.PROCESSING,
            }),
            expect.objectContaining({
                status: EventTriggerOutboxStatus.FAILED,
                failedAt: expect.any(Date),
                leaseExpiresAt: null,
                dispatchToken: null,
                lastError: 'Pipeline "product-event-sync" no longer exists',
            }),
        );
        expect(fixture.enqueueRun).not.toHaveBeenCalled();
    });

    it('ignores stale duplicate jobs whose dispatch token no longer owns the row', async () => {
        const fixture = createWorkerFixture({ claimAffected: 0 });
        await fixture.service.onModuleInit();

        await fixture.getProcessJob()(createJob());
        fixture.service.onModuleDestroy();

        expect(fixture.pipelineService.startPinnedIdempotentRunWithSeed).not.toHaveBeenCalled();
        expect(fixture.enqueueRun).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishTriggerFired).not.toHaveBeenCalled();
    });
});

describe('DataHubEventTriggerService registration', () => {
    it('registers all advertised classes as one blocking transactional handler', async () => {
        let handler: ((event: ProductEvent) => Promise<void>) | undefined;
        const eventBus = {
            registerBlockingEventHandler: vi.fn((options: {
                event: unknown[];
                handler: (event: ProductEvent) => Promise<void>;
            }) => {
                handler = options.handler;
            }),
        };
        const outbox = { capture: vi.fn(async () => 1) };
        const { factory } = createLoggerFactory();
        const service = new DataHubEventTriggerService(
            eventBus as unknown as EventBus,
            outbox as unknown as EventTriggerOutboxService,
            factory,
        );

        service.onModuleInit();
        const registration = eventBus.registerBlockingEventHandler.mock.calls[0]?.[0];
        expect(registration?.event).toHaveLength(VENDURE_EVENT_TYPES.length);
        expect(service.getHealthMetrics()).toEqual({
            registeredEventHandlers: VENDURE_EVENT_TYPES.length,
            transactionalOutboxEnabled: true,
        });

        const event = createProductEvent({} as RequestContext);
        if (!handler) throw new Error('Blocking handler was not registered');
        await handler(event);
        expect(outbox.capture).toHaveBeenCalledWith(event);
    });
});
