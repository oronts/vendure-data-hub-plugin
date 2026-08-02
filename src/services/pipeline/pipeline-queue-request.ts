import type { EventBus } from '@vendure/core';
import type { DataHubLogger } from '../logger';
import { toErrorOrUndefined } from '../../utils/error.utils';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';

export function publishPipelineQueueRequest(
    eventBus: EventBus,
    logger: DataHubLogger,
    event: PipelineQueueRequestEvent,
): void {
    void eventBus.publish(event).catch(error => {
        logger.error(
            'Failed to publish pipeline queue request; reconciliation will retry it',
            toErrorOrUndefined(error),
            {
                pipelineId: event.pipelineId,
                runId: event.runId,
            },
        );
    });
}
