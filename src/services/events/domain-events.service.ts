import * as crypto from 'crypto';
import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { Subject, Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { DOMAIN_EVENTS } from '../../constants/index';

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
            id: `log_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 6)}`,
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
}
