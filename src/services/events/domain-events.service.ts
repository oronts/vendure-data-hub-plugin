import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { Subject, Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { DOMAIN_EVENTS } from '../../constants/index';
import { generateTimestampedId } from '../../utils/id-generation.utils';

export type DomainEventPayload = Record<string, unknown>;

export class DataHubDomainEvent<T = DomainEventPayload> {
    public readonly createdAt = new Date();
    constructor(
        public readonly name: string,
        public readonly payload?: T,
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
    readonly events$: Observable<DataHubEvent> = this.eventSubject.asObservable().pipe(share());

    constructor(@Optional() private eventBus?: EventBus) {}

    onModuleDestroy(): void {
        this.eventSubject.complete();
    }

    publish<T extends DomainEventPayload = DomainEventPayload>(name: string, payload?: T): void {
        try {
            const createdAt = new Date();

            if (this.eventBus) {
                this.eventBus.publish(new DataHubDomainEvent<T>(name, payload));
            }

            const ev: BufferedEvent = { name, payload, createdAt };
            this.buffer.push(ev);
            if (this.buffer.length > this.max) this.buffer.splice(0, this.buffer.length - this.max);

            this.eventSubject.next({
                type: name,
                payload: payload ?? {},
                createdAt,
            });
        } catch {
            // Domain event buffering is non-critical - silently ignore errors to avoid disrupting main flow
        }
    }

    list(limit = 50): BufferedEvent[] {
        const limitClamped = Math.max(1, Math.min(limit || 50, this.max));
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
        metrics: { processed: number; succeeded: number; failed: number; durationMs: number },
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

    publishPipelineDeleted(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineDeleted', {
            pipelineId,
            pipelineCode,
            deletedAt: new Date(),
        });
    }

    publishPipelinePublished(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelinePublished', {
            pipelineId,
            pipelineCode,
            publishedAt: new Date(),
        });
    }

    publishPipelineArchived(pipelineId: string, pipelineCode: string): void {
        this.publish('PipelineArchived', {
            pipelineId,
            pipelineCode,
            archivedAt: new Date(),
        });
    }

    publishLog(
        level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
        message: string,
        options?: {
            pipelineCode?: string;
            runId?: string;
            stepKey?: string;
            metadata?: Record<string, unknown>;
        },
    ): void {
        this.publish('LogAdded', {
            id: generateTimestampedId('log', 6),
            timestamp: new Date(),
            level,
            message,
            ...options,
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
