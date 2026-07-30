import { createHash, randomUUID } from 'crypto';
import type { ID, RequestContext, VendureEvent } from '@vendure/core';
import type { VendureEventType } from '../../../shared/types';
import { EVENT_TRIGGER_OUTBOX, RunStatus } from '../../constants';
import {
    DataHubEventTriggerOutbox,
    EventTriggerOutboxStatus,
} from '../../entities/pipeline';
import { getErrorMessage } from '../../utils/error.utils';
import type { DiscoveredEventTrigger } from './event-trigger.contract';

export const RECOVERABLE_OUTBOX_STATUSES = [
    EventTriggerOutboxStatus.DISPATCHING,
    EventTriggerOutboxStatus.QUEUED,
    EventTriggerOutboxStatus.PROCESSING,
] as const;

export function getVendureEventContext(vendureEvent: VendureEvent): RequestContext {
    const ctx = (vendureEvent as VendureEvent & { ctx?: RequestContext }).ctx;
    if (!ctx) {
        throw new Error('Supported Vendure EVENT trigger was published without RequestContext');
    }
    return ctx;
}

export function createOutboxDispatchToken(): string {
    return createHash('sha256').update(randomUUID()).digest('hex');
}

export function createEventTriggerDeliveries(
    ctx: RequestContext,
    eventType: VendureEventType,
    triggers: readonly DiscoveredEventTrigger[],
    seedRecords: Array<Record<string, unknown>>,
): DataHubEventTriggerOutbox[] {
    const eventDeliveryId = randomUUID();
    const availableAt = new Date();
    return triggers.map(trigger => {
        const delivery = Object.assign(new DataHubEventTriggerOutbox(), {
            deliveryKey: createDeliveryKey(eventDeliveryId, trigger.pipelineId, trigger.triggerKey),
            eventType,
            pipelineId: trigger.pipelineId,
            revisionId: trigger.revisionId,
            pipelineCode: trigger.pipelineCode,
            triggerKey: trigger.triggerKey,
            channelId: String(ctx.channelId),
            channelToken: ctx.channel.token,
            languageCode: ctx.languageCode,
            currencyCode: ctx.currencyCode,
            status: EventTriggerOutboxStatus.PENDING,
            attempts: 0,
            availableAt,
            leaseExpiresAt: null,
            dispatchToken: null,
            lastError: null,
            runId: null,
            deliveredAt: null,
            failedAt: null,
        });
        delivery.seedRecords = seedRecords;
        return delivery;
    });
}

export function isQueueableRunStatus(status: RunStatus): boolean {
    return status === RunStatus.PENDING;
}

export function outboxRetryDelayMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(
        EVENT_TRIGGER_OUTBOX.RETRY_BASE_DELAY_MS * 2 ** exponent,
        EVENT_TRIGGER_OUTBOX.RETRY_MAX_DELAY_MS,
    );
}

export function nextOutboxLeaseExpiry(now = Date.now()): Date {
    return new Date(now + EVENT_TRIGGER_OUTBOX.LEASE_DURATION_MS);
}

export function truncateOutboxError(error: unknown): string {
    return getErrorMessage(error).slice(0, EVENT_TRIGGER_OUTBOX.LAST_ERROR_MAX_LENGTH);
}

function createDeliveryKey(
    eventDeliveryId: string,
    pipelineId: ID,
    triggerKey: string,
): string {
    return createHash('sha256')
        .update(`${eventDeliveryId}:${String(pipelineId)}:${triggerKey}`)
        .digest('hex');
}
