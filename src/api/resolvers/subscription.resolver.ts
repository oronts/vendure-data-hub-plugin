import { Args, Resolver, Subscription } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { DomainEventsService } from '../../services';
import { SubscribeDataHubEventsPermission } from '../../permissions';
import { filter, map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { RunStatus } from '../../constants/enums';
import { RUN_EVENT_TYPES, WEBHOOK_EVENT_TYPES, STEP_EVENT_TYPES, LOG_EVENT_TYPES } from '../../constants/events';
import { WebhookDeliveryStatus } from '../../services/webhooks/webhook.types';
import { PipelineRunUpdate, LogEntry, WebhookUpdate, StepProgress } from '../types';

@Resolver()
export class DataHubSubscriptionResolver {
    constructor(private domainEvents: DomainEventsService) {}

    @Subscription(() => Object, {
        name: 'onDataHubPipelineRunUpdated',
        resolve: (payload: PipelineRunUpdate) => payload,
    })
    @Allow(SubscribeDataHubEventsPermission.Permission)
    onDataHubPipelineRunUpdated(
        @Args('pipelineCode', { nullable: true }) pipelineCode?: string,
    ): Observable<PipelineRunUpdate> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isRunEvent = (RUN_EVENT_TYPES as readonly string[]).includes(event.type);

                if (!isRunEvent) return false;
                if (pipelineCode && event.payload?.pipelineCode !== pipelineCode) return false;

                return true;
            }),
            map(event => ({
                runId: String(event.payload?.runId ?? ''),
                pipelineCode: String(event.payload?.pipelineCode ?? ''),
                status: this.mapEventToStatus(event.type),
                progressPercent: Number(event.payload?.progressPercent ?? 0),
                progressMessage: event.payload?.progressMessage as string | undefined,
                recordsProcessed: Number(event.payload?.recordsProcessed ?? 0),
                recordsFailed: Number(event.payload?.recordsFailed ?? 0),
                currentStep: event.payload?.currentStep as string | undefined,
                startedAt: event.payload?.startedAt as Date | undefined,
                finishedAt: event.payload?.finishedAt as Date | undefined,
                error: event.payload?.error as string | undefined,
            } as PipelineRunUpdate)),
        );
    }

    @Subscription(() => Object, {
        name: 'onDataHubLogAdded',
        resolve: (payload: LogEntry) => payload,
    })
    @Allow(SubscribeDataHubEventsPermission.Permission)
    onDataHubLogAdded(
        @Args('pipelineCode', { nullable: true }) pipelineCode?: string,
        @Args('level', { type: () => [String], nullable: true }) level?: string[],
    ): Observable<LogEntry> {
        return this.domainEvents.events$.pipe(
            filter(event => (LOG_EVENT_TYPES as readonly string[]).includes(event.type)),
            filter(event => {
                if (pipelineCode && event.payload?.pipelineCode !== pipelineCode) return false;
                if (level?.length && !level.includes(event.payload?.level as string)) return false;
                return true;
            }),
            map(event => ({
                id: String(event.payload?.id || `log_${Date.now()}`),
                timestamp: (event.payload?.timestamp as Date) || new Date(),
                level: (event.payload?.level as LogEntry['level']) || 'INFO',
                message: String(event.payload?.message ?? ''),
                pipelineCode: event.payload?.pipelineCode as string | undefined,
                runId: event.payload?.runId as string | undefined,
                stepKey: event.payload?.stepKey as string | undefined,
                metadata: event.payload?.metadata as Record<string, unknown> | undefined,
            } as LogEntry)),
        );
    }

    @Subscription(() => Object, {
        name: 'onDataHubWebhookUpdated',
        resolve: (payload: WebhookUpdate) => payload,
    })
    @Allow(SubscribeDataHubEventsPermission.Permission)
    onDataHubWebhookUpdated(
        @Args('webhookId', { nullable: true }) webhookId?: string,
    ): Observable<WebhookUpdate> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isWebhookEvent = (WEBHOOK_EVENT_TYPES as readonly string[]).includes(event.type);

                if (!isWebhookEvent) return false;
                if (webhookId && event.payload?.webhookId !== webhookId) return false;

                return true;
            }),
            map(event => ({
                deliveryId: String(event.payload?.deliveryId ?? ''),
                webhookId: String(event.payload?.webhookId ?? ''),
                status: this.mapWebhookEventToStatus(event.type),
                attempts: Number(event.payload?.attempts ?? 0),
                lastAttemptAt: event.payload?.lastAttemptAt as Date | undefined,
                responseStatus: event.payload?.responseStatus as number | undefined,
                error: event.payload?.error as string | undefined,
            } as WebhookUpdate)),
        );
    }

    @Subscription(() => Object, {
        name: 'onDataHubStepProgress',
        resolve: (payload: StepProgress) => payload,
    })
    @Allow(SubscribeDataHubEventsPermission.Permission)
    onDataHubStepProgress(
        @Args('runId', { type: () => String }) runId: string,
    ): Observable<StepProgress> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isStepEvent = (STEP_EVENT_TYPES as readonly string[]).includes(event.type);

                if (!isStepEvent) return false;
                if (String(event.payload?.runId) !== String(runId)) return false;

                return true;
            }),
            map(event => ({
                runId: String(event.payload?.runId ?? ''),
                stepKey: String(event.payload?.stepKey ?? ''),
                status: event.type.replace('Step', '').replace('Record', ''),
                recordsIn: Number(event.payload?.recordsIn ?? 0),
                recordsOut: Number(event.payload?.recordsOut ?? 0),
                recordsFailed: Number(event.payload?.recordsFailed ?? 0),
                durationMs: Number(event.payload?.durationMs ?? 0),
            } as StepProgress)),
        );
    }

    private mapEventToStatus(eventType: string): RunStatus {
        switch (eventType) {
            case 'PipelineRunStarted':
                return RunStatus.RUNNING;
            case 'PipelineRunProgress':
                return RunStatus.RUNNING;
            case 'PipelineRunCompleted':
                return RunStatus.COMPLETED;
            case 'PipelineRunFailed':
                return RunStatus.FAILED;
            case 'PipelineRunCancelled':
                return RunStatus.CANCELLED;
            default:
                return RunStatus.PENDING;
        }
    }

    private mapWebhookEventToStatus(eventType: string): WebhookDeliveryStatus {
        switch (eventType) {
            case 'WebhookDeliveryAttempted':
                return WebhookDeliveryStatus.PENDING;
            case 'WebhookDeliverySucceeded':
                return WebhookDeliveryStatus.DELIVERED;
            case 'WebhookDeliveryFailed':
                return WebhookDeliveryStatus.FAILED;
            case 'WebhookDeliveryRetrying':
                return WebhookDeliveryStatus.RETRYING;
            case 'WebhookDeliveryDeadLetter':
                return WebhookDeliveryStatus.DEAD_LETTER;
            default:
                return WebhookDeliveryStatus.PENDING;
        }
    }
}
