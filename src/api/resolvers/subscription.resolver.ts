import { Args, Resolver, Subscription } from '@nestjs/graphql';
import { Allow, Permission } from '@vendure/core';
import { DomainEventsService } from '../../services';
import { filter, map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Resolver()
export class DataHubSubscriptionResolver {
    constructor(private domainEvents: DomainEventsService) {}

    @Subscription(() => Object, {
        name: 'dataHubPipelineRunUpdated',
        resolve: (payload: any) => payload,
    })
    @Allow(Permission.SuperAdmin)
    dataHubPipelineRunUpdated(
        @Args('pipelineCode', { nullable: true }) pipelineCode?: string,
    ): Observable<any> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isRunEvent = [
                    'PipelineRunStarted',
                    'PipelineRunProgress',
                    'PipelineRunCompleted',
                    'PipelineRunFailed',
                    'PipelineRunCancelled',
                ].includes(event.type);

                if (!isRunEvent) return false;
                if (pipelineCode && event.payload?.pipelineCode !== pipelineCode) return false;

                return true;
            }),
            map(event => ({
                runId: event.payload?.runId,
                pipelineCode: event.payload?.pipelineCode,
                status: this.mapEventToStatus(event.type),
                progressPercent: event.payload?.progressPercent ?? 0,
                progressMessage: event.payload?.progressMessage,
                recordsProcessed: event.payload?.recordsProcessed ?? 0,
                recordsFailed: event.payload?.recordsFailed ?? 0,
                currentStep: event.payload?.currentStep,
                startedAt: event.payload?.startedAt,
                finishedAt: event.payload?.finishedAt,
                error: event.payload?.error,
            })),
        );
    }

    @Subscription(() => Object, {
        name: 'dataHubLogAdded',
        resolve: (payload: any) => payload,
    })
    @Allow(Permission.SuperAdmin)
    dataHubLogAdded(
        @Args('pipelineCode', { nullable: true }) pipelineCode?: string,
        @Args('level', { type: () => [String], nullable: true }) level?: string[],
    ): Observable<any> {
        return this.domainEvents.events$.pipe(
            filter(event => event.type === 'LogAdded'),
            filter(event => {
                if (pipelineCode && event.payload?.pipelineCode !== pipelineCode) return false;
                if (level?.length && !level.includes(event.payload?.level as string)) return false;
                return true;
            }),
            map(event => ({
                id: event.payload?.id || `log_${Date.now()}`,
                timestamp: event.payload?.timestamp || new Date(),
                level: event.payload?.level || 'INFO',
                message: event.payload?.message,
                pipelineCode: event.payload?.pipelineCode,
                runId: event.payload?.runId,
                stepKey: event.payload?.stepKey,
                metadata: event.payload?.metadata,
            })),
        );
    }

    @Subscription(() => Object, {
        name: 'dataHubWebhookUpdated',
        resolve: (payload: any) => payload,
    })
    @Allow(Permission.SuperAdmin)
    dataHubWebhookUpdated(
        @Args('webhookId', { nullable: true }) webhookId?: string,
    ): Observable<any> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isWebhookEvent = [
                    'WebhookDeliveryAttempted',
                    'WebhookDeliverySucceeded',
                    'WebhookDeliveryFailed',
                    'WebhookDeliveryRetrying',
                    'WebhookDeliveryDeadLetter',
                ].includes(event.type);

                if (!isWebhookEvent) return false;
                if (webhookId && event.payload?.webhookId !== webhookId) return false;

                return true;
            }),
            map(event => ({
                deliveryId: event.payload?.deliveryId,
                webhookId: event.payload?.webhookId,
                status: this.mapWebhookEventToStatus(event.type),
                attempts: event.payload?.attempts ?? 0,
                lastAttemptAt: event.payload?.lastAttemptAt,
                responseStatus: event.payload?.responseStatus,
                error: event.payload?.error,
            })),
        );
    }

    @Subscription(() => Object, {
        name: 'dataHubStepProgress',
        resolve: (payload: any) => payload,
    })
    @Allow(Permission.SuperAdmin)
    dataHubStepProgress(
        @Args('runId', { type: () => String }) runId: string,
    ): Observable<any> {
        return this.domainEvents.events$.pipe(
            filter(event => {
                const isStepEvent = [
                    'StepStarted',
                    'StepProgress',
                    'StepCompleted',
                    'StepFailed',
                    'RecordExtracted',
                    'RecordTransformed',
                    'RecordValidated',
                    'RecordLoaded',
                ].includes(event.type);

                if (!isStepEvent) return false;
                if (String(event.payload?.runId) !== String(runId)) return false;

                return true;
            }),
            map(event => ({
                runId: event.payload?.runId,
                stepKey: event.payload?.stepKey,
                status: event.type.replace('Step', '').replace('Record', ''),
                recordsIn: event.payload?.recordsIn ?? 0,
                recordsOut: event.payload?.recordsOut ?? 0,
                recordsFailed: event.payload?.recordsFailed ?? 0,
                durationMs: event.payload?.durationMs ?? 0,
            })),
        );
    }

    private mapEventToStatus(eventType: string): string {
        switch (eventType) {
            case 'PipelineRunStarted':
                return 'RUNNING';
            case 'PipelineRunProgress':
                return 'RUNNING';
            case 'PipelineRunCompleted':
                return 'COMPLETED';
            case 'PipelineRunFailed':
                return 'FAILED';
            case 'PipelineRunCancelled':
                return 'CANCELLED';
            default:
                return 'PENDING';
        }
    }

    private mapWebhookEventToStatus(eventType: string): string {
        switch (eventType) {
            case 'WebhookDeliveryAttempted':
                return 'PENDING';
            case 'WebhookDeliverySucceeded':
                return 'DELIVERED';
            case 'WebhookDeliveryFailed':
                return 'FAILED';
            case 'WebhookDeliveryRetrying':
                return 'RETRYING';
            case 'WebhookDeliveryDeadLetter':
                return 'DEAD_LETTER';
            default:
                return 'PENDING';
        }
    }
}
