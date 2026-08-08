import type { ID, RequestContext } from '@vendure/core';
import type { ActiveConsumer } from './consumer-lifecycle';
import type { waitForSuccessfulQueueRun } from './message-run-waiter';

export interface ConsumedMessage {
    messageId: string;
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
    deliveryTag?: string;
}

export interface EnqueuedMessageRun {
    ctx: RequestContext;
    runId: ID;
}

export type QueueRunWaiter = typeof waitForSuccessfulQueueRun;

export class ConsumerLeaseLostError extends Error {
    constructor(pipelineCode: string, phase: string) {
        super(`Message consumer lease for pipeline "${pipelineCode}" was lost before ${phase}`);
        this.name = 'ConsumerLeaseLostError';
    }
}

export function assertConsumerLease(consumer: ActiveConsumer, phase: string): void {
    if (!consumer.running) {
        throw new ConsumerLeaseLostError(consumer.config.pipelineCode, phase);
    }
}
