import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { Subject, Observable, Subscription } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { DOMAIN_EVENTS, LOGGER_CONTEXTS } from '../../constants/index';
import { ActiveTaskSet } from '../../utils/async-operation-tracker';
import { toErrorOrUndefined } from '../../utils/error.utils';
import {
    DataHubLoggerFactory,
} from '../logger';
import type { DataHubLogger } from '../logger';

export type DomainEventPayload = Record<string, unknown>;

export class DataHubDomainEvent<T = DomainEventPayload> {
    public readonly createdAt = new Date();
    constructor(
        public readonly name: string,
        public readonly payload?: T,
        public ctx?: RequestContext,
        public readonly deferLocalDelivery = false,
    ) {}
}

export interface DataHubEvent<T = DomainEventPayload> {
    type: string;
    payload: T;
    createdAt: Date;
}

export interface BufferedEvent {
    name: string;
    payload?: DomainEventPayload;
    createdAt: Date;
}

@Injectable()
export class DomainEventsService implements OnModuleDestroy {
    private buffer: BufferedEvent[] = [];
    private readonly max = DOMAIN_EVENTS.MAX_EVENTS;
    private eventSubject = new Subject<DataHubEvent>();
    private readonly publications = new ActiveTaskSet();
    private readonly logger: DataHubLogger;
    private deferredSubscription?: Subscription;
    private destroying = false;
    readonly events$: Observable<DataHubEvent> = this.eventSubject.asObservable().pipe(share());

    constructor(
        @Optional() private eventBus?: EventBus,
        @Optional() loggerFactory?: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory
            ? loggerFactory.createLogger(LOGGER_CONTEXTS.DOMAIN_EVENTS_SERVICE)
            : DataHubLoggerFactory.create(LOGGER_CONTEXTS.DOMAIN_EVENTS_SERVICE);
        if (this.eventBus && typeof this.eventBus.ofType === 'function') {
            this.deferredSubscription = this.eventBus
                .ofType<DataHubDomainEvent>(DataHubDomainEvent)
                .pipe(filter(event => event.deferLocalDelivery))
                .subscribe(event => {
                    this.deliverLocal(event.name, event.payload, event.createdAt);
                });
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        await this.publications.settle();
        this.deferredSubscription?.unsubscribe();
        this.eventSubject.complete();
    }

    publish<T extends DomainEventPayload = DomainEventPayload>(name: string, payload?: T): void {
        if (this.destroying) return;
        try {
            const event = new DataHubDomainEvent<T>(name, payload);

            if (this.eventBus) {
                this.publishToVendure(event);
            }
            this.deliverLocal(name, payload, event.createdAt);
        } catch (error) {
            this.reportPublicationFailure(name, error);
        }
    }

    private publishAfterCommit<T extends DomainEventPayload>(
        ctx: RequestContext,
        name: string,
        payload: T,
    ): void {
        if (this.destroying) return;
        const event = new DataHubDomainEvent(name, payload, ctx, true);
        if (this.eventBus && this.deferredSubscription) {
            this.publishToVendure(event);
            return;
        }
        this.deliverLocal(name, payload, event.createdAt);
    }

    private publishToVendure(event: DataHubDomainEvent): void {
        const eventBus = this.eventBus;
        if (!eventBus || this.destroying) return;
        try {
            const publication = this.publications.run(() => eventBus.publish(event));
            void publication.catch(error => {
                this.reportPublicationFailure(event.name, error);
            });
        } catch (error) {
            this.reportPublicationFailure(event.name, error);
        }
    }

    private reportPublicationFailure(eventName: string, error: unknown): void {
        this.logger.error(
            'Vendure event publication failed',
            toErrorOrUndefined(error),
            { eventName },
        );
    }

    private deliverLocal<T extends DomainEventPayload>(
        name: string,
        payload: T | undefined,
        createdAt: Date,
    ): void {
        const event: BufferedEvent = { name, payload, createdAt };
        this.buffer.push(event);
        if (this.buffer.length > this.max) {
            this.buffer.splice(0, this.buffer.length - this.max);
        }
        this.eventSubject.next({
            type: name,
            payload: payload ?? {},
            createdAt,
        });
    }

    list(limit: number = DOMAIN_EVENTS.DEFAULT_LIMIT): BufferedEvent[] {
        const limitClamped = Math.max(1, Math.min(limit || DOMAIN_EVENTS.DEFAULT_LIMIT, this.max));
        return this.buffer.slice(-limitClamped).reverse();
    }

    clear(): void {
        this.buffer = [];
    }

    get count(): number {
        return this.buffer.length;
    }

    publishRunStarted(runId: string, pipelineCode: string, pipelineId?: string): void {
        this.publish('PipelineRunStarted', {
            runId,
            pipelineCode,
            pipelineId,
            startedAt: new Date(),
        });
    }

    publishRunProgress(
        runId: string,
        pipelineCode: string,
        progressPercent: number,
        progressMessage?: string,
        recordsProcessed?: number,
        recordsFailed?: number,
        currentStep?: string,
    ): void {
        this.publish('PipelineRunProgress', {
            runId,
            pipelineCode,
            progressPercent,
            progressMessage,
            recordsProcessed,
            recordsFailed,
            currentStep,
        });
    }

    publishRunCompleted(
        runId: string,
        pipelineCode: string,
        metrics: { processed: number; succeeded: number; failed: number; skipped: number; durationMs: number },
    ): void {
        this.publish('PipelineRunCompleted', {
            runId,
            pipelineCode,
            finishedAt: new Date(),
            recordsProcessed: metrics.processed,
            recordsFailed: metrics.failed,
            metrics,
        });
    }

    publishRunFailed(runId: string, pipelineCode: string, error: string): void {
        this.publish('PipelineRunFailed', {
            runId,
            pipelineCode,
            finishedAt: new Date(),
            error,
        });
    }

    publishPipelineCreated(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineCreated', {
            pipelineId,
            pipelineCode,
            createdAt: new Date(),
        });
    }

    publishPipelineUpdated(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineUpdated', {
            pipelineId,
            pipelineCode,
            updatedAt: new Date(),
        });
    }

    publishPipelineDeleted(
        pipelineId: string,
        pipelineCode: string,
        channelId?: string,
    ): void {
        this.publish('PipelineDeleted', {
            pipelineId,
            pipelineCode,
            channelId,
            deletedAt: new Date(),
        });
    }

    publishPipelinePublished(
        pipelineId: string,
        pipelineCode: string,
        ctx?: RequestContext,
    ): void {
        const payload = {
            pipelineId,
            pipelineCode,
            publishedAt: new Date(),
        };
        if (ctx) {
            this.publishAfterCommit(ctx, 'PipelinePublished', payload);
            return;
        }
        this.publish('PipelinePublished', payload);
    }

    publishPipelineArchived(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineArchived', {
            pipelineId,
            pipelineCode,
            archivedAt: new Date(),
        });
    }

    publishPipelineReactivated(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineReactivated', {
            pipelineId,
            pipelineCode,
            reactivatedAt: new Date(),
        });
    }

    publishWebhookDelivery(
        eventType: 'WebhookDeliverySucceeded' | 'WebhookDeliveryFailed' | 'WebhookDeliveryRetrying' | 'WebhookDeliveryDeadLetter',
        deliveryId: string,
        webhookId: string,
        details?: {
            attempts?: number;
            responseStatus?: number;
            error?: string;
        },
    ): void {
        this.publish(eventType, {
            deliveryId,
            webhookId,
            lastAttemptAt: new Date(),
            ...details,
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Step lifecycle events
    // ──────────────────────────────────────────────────────────────

    publishStepStarted(pipelineId: string | undefined, runId: string | undefined, stepKey: string, stepType: string): void {
        this.publish('StepStarted', {
            pipelineId,
            runId,
            stepKey,
            stepType,
            timestamp: new Date(),
        });
    }

    publishStepCompleted(
        pipelineId: string | undefined,
        runId: string | undefined,
        stepKey: string,
        stepType: string,
        recordsProcessed?: number,
    ): void {
        this.publish('StepCompleted', {
            pipelineId,
            runId,
            stepKey,
            stepType,
            recordsProcessed,
            timestamp: new Date(),
        });
    }

    publishStepFailed(
        pipelineId: string | undefined,
        runId: string | undefined,
        stepKey: string,
        stepType: string,
        error: string,
    ): void {
        this.publish('StepFailed', {
            pipelineId,
            runId,
            stepKey,
            stepType,
            error,
            timestamp: new Date(),
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Gate events
    // ──────────────────────────────────────────────────────────────

    publishGateApprovalRequested(pipelineId: string | undefined, runId: string | undefined, stepKey: string): void {
        this.publish('GateApprovalRequested', {
            pipelineId,
            runId,
            stepKey,
            timestamp: new Date(),
        });
    }

    publishGateApproved(
        pipelineId: string | undefined,
        runId: string | undefined,
        stepKey: string,
        approver?: string,
    ): void {
        this.publish('GateApproved', {
            pipelineId,
            runId,
            stepKey,
            approver,
            timestamp: new Date(),
        });
    }

    publishGateRejected(
        pipelineId: string | undefined,
        runId: string | undefined,
        stepKey: string,
        reason?: string,
    ): void {
        this.publish('GateRejected', {
            pipelineId,
            runId,
            stepKey,
            reason,
            timestamp: new Date(),
        });
    }

    publishGateTimeout(pipelineId: string | undefined, runId: string | undefined, stepKey: string): void {
        this.publish('GateTimeout', {
            pipelineId,
            runId,
            stepKey,
            timestamp: new Date(),
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Run cancellation
    // ──────────────────────────────────────────────────────────────

    publishRunCancelled(pipelineId: string | undefined, runId: string, cancelledBy?: string): void {
        this.publish('PipelineRunCancelled', {
            pipelineId,
            runId,
            cancelledBy,
            cancelledAt: new Date(),
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Trigger lifecycle events
    // ──────────────────────────────────────────────────────────────

    publishTriggerFired(pipelineId: string | undefined, triggerType: string, details?: Record<string, unknown>): void {
        this.publish('TriggerFired', {
            pipelineId,
            triggerType,
            details,
            timestamp: new Date(),
        });
    }

    publishScheduleActivated(pipelineId: string | undefined, pipelineCode: string, scheduleCount: number): void {
        this.publish('ScheduleActivated', {
            pipelineId,
            pipelineCode,
            scheduleCount,
            timestamp: new Date(),
        });
    }

    publishScheduleDeactivated(pipelineId: string | undefined, pipelineCode: string, reason?: string): void {
        this.publish('ScheduleDeactivated', {
            pipelineId,
            pipelineCode,
            reason,
            timestamp: new Date(),
        });
    }

}
