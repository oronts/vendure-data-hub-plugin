import { Injectable, Optional } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { Subject, Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { DOMAIN_EVENTS } from '../../constants/index';

/**
 * Domain event payload type
 */
export type DomainEventPayload = Record<string, unknown>;

export class DataHubDomainEvent<T = DomainEventPayload> {
    public readonly createdAt = new Date();
    constructor(
        public readonly name: string,
        public readonly payload?: T,
    ) {}
}

/**
 * Domain event structure for subscriptions
 */
export interface DataHubEvent<T = DomainEventPayload> {
    type: string;
    payload: T;
    createdAt: Date;
}

/**
 * Buffered event structure
 */
export interface BufferedEvent {
    name: string;
    payload?: DomainEventPayload;
    createdAt: Date;
}

@Injectable()
export class DomainEventsService {
    private buffer: BufferedEvent[] = [];
    private readonly max = DOMAIN_EVENTS.MAX_EVENTS;

    /** RxJS Subject for real-time event streaming */
    private eventSubject = new Subject<DataHubEvent>();

    /** Observable stream of all domain events (shared/multicasted) */
    readonly events$: Observable<DataHubEvent> = this.eventSubject.asObservable().pipe(share());

    constructor(@Optional() private eventBus?: EventBus) {}

    /**
     * Publish a domain event
     * Events are:
     * 1. Published to Vendure EventBus (if available)
     * 2. Stored in memory buffer for quick access
     * 3. Emitted to RxJS Subject for real-time subscriptions
     */
    publish<T extends DomainEventPayload = DomainEventPayload>(name: string, payload?: T): void {
        try {
            const createdAt = new Date();

            // Publish to Vendure EventBus for integration with other plugins
            if (this.eventBus) {
                this.eventBus.publish(new DataHubDomainEvent<T>(name, payload));
            }

            // Store in memory buffer for quick admin UI access
            const ev: BufferedEvent = { name, payload, createdAt };
            this.buffer.push(ev);
            if (this.buffer.length > this.max) this.buffer.splice(0, this.buffer.length - this.max);

            // Emit to RxJS Subject for GraphQL subscriptions
            this.eventSubject.next({
                type: name,
                payload: payload ?? {},
                createdAt,
            });
        } catch {
            // Best-effort, never throw from domain event publishing
        }
    }

    /**
     * Get recent events from memory buffer
     */
    list(limit = 50): BufferedEvent[] {
        const n = Math.max(1, Math.min(limit || 50, this.max));
        return this.buffer.slice(-n).reverse();
    }

    /**
     * Clear the event buffer
     */
    clear(): void {
        this.buffer = [];
    }

    /**
     * Get count of events in buffer
     */
    get count(): number {
        return this.buffer.length;
    }

    /**
     * Publish pipeline run started event
     */
    publishRunStarted(runId: string, pipelineCode: string, pipelineId?: string): void {
        this.publish('PipelineRunStarted', {
            runId,
            pipelineCode,
            pipelineId,
            startedAt: new Date(),
        });
    }

    /**
     * Publish pipeline run progress event
     */
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

    /**
     * Publish pipeline run completed event
     */
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

    /**
     * Publish pipeline run failed event
     */
    publishRunFailed(runId: string, pipelineCode: string, error: string): void {
        this.publish('PipelineRunFailed', {
            runId,
            pipelineCode,
            finishedAt: new Date(),
            error,
        });
    }

    /**
     * Publish log entry event
     */
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
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date(),
            level,
            message,
            ...options,
        });
    }

    /**
     * Publish webhook delivery event
     */
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
}
