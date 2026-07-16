import { describe, expect, it, vi } from 'vitest';
import {
    INTERNAL_EVENT_TYPES,
    STEP_EVENT_TYPES,
    WEBHOOK_EVENT_TYPES,
} from '../../constants/events';
import { DomainEventsService } from './domain-events.service';

describe('DomainEventsService', () => {
    it('keeps local delivery while consuming an asynchronous EventBus rejection', async () => {
        const eventBus = {
            publish: vi.fn(async () => {
                throw new Error('subscriber failed');
            }),
        };
        const service = new DomainEventsService(eventBus as never);
        const observed: string[] = [];
        const subscription = service.events$.subscribe(event => observed.push(event.type));

        expect(() => service.publish('PipelineRunStarted', { runId: '1' })).not.toThrow();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventBus.publish).toHaveBeenCalledOnce();
        expect(observed).toEqual(['PipelineRunStarted']);
        expect(service.list(1)).toEqual([
            expect.objectContaining({ name: 'PipelineRunStarted', payload: { runId: '1' } }),
        ]);

        subscription.unsubscribe();
        service.onModuleDestroy();
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
