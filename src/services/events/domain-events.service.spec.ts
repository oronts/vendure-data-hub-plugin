import { RequestContext } from '@vendure/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
    INTERNAL_EVENT_TYPES,
    STEP_EVENT_TYPES,
    WEBHOOK_EVENT_TYPES,
} from '../../constants/events';
import { DataHubDomainEvent, DomainEventsService } from './domain-events.service';

describe('DomainEventsService', () => {
    it('keeps local delivery while consuming an asynchronous EventBus rejection', async () => {
        const logger = { error: vi.fn() };
        const loggerFactory = { createLogger: vi.fn(() => logger) };
        const eventBus = {
            publish: vi.fn(async () => {
                throw new Error('subscriber failed');
            }),
        };
        const service = new DomainEventsService(
            eventBus as never,
            loggerFactory as never,
        );
        const observed: string[] = [];
        const subscription = service.events$.subscribe(event => observed.push(event.type));

        expect(() => service.publish('PipelineRunStarted', { runId: '1' })).not.toThrow();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventBus.publish).toHaveBeenCalledOnce();
        expect(observed).toEqual(['PipelineRunStarted']);
        expect(service.list(1)).toEqual([
            expect.objectContaining({ name: 'PipelineRunStarted', payload: { runId: '1' } }),
        ]);
        expect(logger.error).toHaveBeenCalledWith(
            'Vendure event publication failed',
            expect.objectContaining({ message: 'subscriber failed' }),
            { eventName: 'PipelineRunStarted' },
        );

        subscription.unsubscribe();
        await service.onModuleDestroy();
    });

    it('delivers publication locally only after Vendure releases the transaction event', async () => {
        const released = new Subject<DataHubDomainEvent>();
        let published: DataHubDomainEvent | undefined;
        const eventBus = {
            ofType: vi.fn(() => released.asObservable()),
            publish: vi.fn(async (event: DataHubDomainEvent) => {
                published = event;
            }),
        };
        const service = new DomainEventsService(eventBus as never);
        const observed: string[] = [];
        service.events$.subscribe(event => observed.push(event.type));
        const ctx = {} as RequestContext;

        service.publishPipelinePublished('1', 'catalog', ctx);
        await Promise.resolve();

        expect(observed).toEqual([]);
        expect(service.count).toBe(0);
        expect(published).toMatchObject({
            name: 'PipelinePublished',
            ctx,
            deferLocalDelivery: true,
        });

        released.next(published as DataHubDomainEvent);
        expect(observed).toEqual(['PipelinePublished']);
        expect(service.count).toBe(1);
        await service.onModuleDestroy();
    });

    it('drains active Vendure publications before completing local events', async () => {
        let releasePublication: (() => void) | undefined;
        const eventBus = {
            publish: vi.fn(() => new Promise<void>(resolve => {
                releasePublication = resolve;
            })),
        };
        const service = new DomainEventsService(eventBus as never);
        let completed = false;
        service.events$.subscribe({ complete: () => { completed = true; } });

        service.publish('PipelineRunStarted', { runId: '1' });
        const destroy = service.onModuleDestroy();
        await Promise.resolve();

        expect(completed).toBe(false);
        releasePublication?.();
        await destroy;

        expect(completed).toBe(true);
        service.publish('PipelineRunCompleted', { runId: '1' });
        expect(eventBus.publish).toHaveBeenCalledOnce();
    });

    it('advertises only webhook events emitted by the delivery service', () => {
        expect(WEBHOOK_EVENT_TYPES).toEqual([
            'WebhookDeliverySucceeded',
            'WebhookDeliveryFailed',
            'WebhookDeliveryRetrying',
            'WebhookDeliveryDeadLetter',
        ]);
    });

    it('retains record events forwarded by step executors and removes StepProgress', () => {
        expect(STEP_EVENT_TYPES).toEqual([
            'StepStarted',
            'StepCompleted',
            'StepFailed',
            'RECORD_EXTRACTED',
            'RECORD_TRANSFORMED',
            'RECORD_VALIDATED',
            'RECORD_LOADED',
            'RECORD_EXPORTED',
            'RECORD_INDEXED',
            'FEED_GENERATED',
        ]);
    });

    it('advertises all internal executor lifecycle events', () => {
        expect(INTERNAL_EVENT_TYPES).toEqual([
            'PIPELINE_STARTED',
            'PIPELINE_COMPLETED',
            'PIPELINE_FAILED',
            'PipelineStepSkipped',
            'PipelinePaused',
            'RECORD_REJECTED',
            'RECORD_DEAD_LETTERED',
        ]);
    });
});
