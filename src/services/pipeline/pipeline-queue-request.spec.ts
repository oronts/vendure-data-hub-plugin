import { describe, expect, it, vi } from 'vitest';
import type { EventBus, RequestContext } from '@vendure/core';
import type { DataHubLogger } from '../logger';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { publishPipelineQueueRequest } from './pipeline-queue-request';

describe('pipeline queue request publication', () => {
    it('observes blocking-handler failures without rejecting the run request', async () => {
        const failure = new Error('blocking handler failed');
        const eventBus = { publish: vi.fn().mockRejectedValue(failure) };
        const logger = { error: vi.fn() };
        const event = new PipelineQueueRequestEvent(
            {} as RequestContext,
            'run-1',
            'pipeline-1',
            'manual',
        );

        publishPipelineQueueRequest(
            eventBus as unknown as EventBus,
            logger as unknown as DataHubLogger,
            event,
        );
        await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());

        expect(eventBus.publish).toHaveBeenCalledWith(event);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to publish pipeline queue request; reconciliation will retry it',
            failure,
            { pipelineId: 'pipeline-1', runId: 'run-1' },
        );
    });
});
