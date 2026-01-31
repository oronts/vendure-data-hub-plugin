/**
 * Pipeline Events
 *
 * Custom events for pipeline operations that break circular dependencies
 * by using event-based communication instead of direct service injection.
 */

import { VendureEvent, ID } from '@vendure/core';
import { JsonObject } from '../../types/index';

/**
 * Event published when a pipeline run needs to be queued for execution.
 * The DataHubRunQueueHandler subscribes to this event and enqueues the run.
 *
 * This pattern breaks the circular dependency:
 * PipelineService -> DataHubRunQueueHandler -> PipelineService
 *
 * By using events, PipelineService no longer directly depends on DataHubRunQueueHandler.
 */
export class PipelineQueueRequestEvent extends VendureEvent {
    constructor(
        public readonly runId: ID,
        public readonly pipelineId: ID,
        public readonly triggeredBy: string,
        public readonly payload?: JsonObject,
    ) {
        super();
    }
}
