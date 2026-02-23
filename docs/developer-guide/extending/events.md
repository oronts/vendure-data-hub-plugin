# Event Subscriptions

Subscribe to Data Hub domain events to build monitoring dashboards, send notifications, collect metrics, or integrate with external systems.

## Overview

Data Hub emits domain events at every stage of the pipeline lifecycle. These events are **fire-and-forget** -- subscribers cannot modify pipeline execution, but can react to events asynchronously.

There are two ways to subscribe:

1. **Vendure EventBus** (recommended for plugins) -- standard Vendure pattern, works with any `@VendurePlugin`
2. **DomainEventsService.events$** (internal) -- RxJS Observable for advanced use cases within the Data Hub module

## Available Events

### Pipeline Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `PipelineCreated` | `{ pipelineId, pipelineCode, createdAt }` | Pipeline definition created |
| `PipelineUpdated` | `{ pipelineId, pipelineCode, updatedAt }` | Pipeline definition updated |
| `PipelineDeleted` | `{ pipelineId, pipelineCode, deletedAt }` | Pipeline definition deleted |
| `PipelinePublished` | `{ pipelineId, pipelineCode, publishedAt }` | Pipeline published (made active) |
| `PipelineArchived` | `{ pipelineId, pipelineCode, archivedAt }` | Pipeline archived |
| `PipelinePaused` | `{ pipelineId, runId, stepKey }` | Pipeline paused at a gate step |

### Run Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `PipelineRunStarted` | `{ runId, pipelineCode, pipelineId, startedAt }` | Pipeline run started |
| `PipelineRunProgress` | `{ runId, pipelineCode, progressPercent, progressMessage, recordsProcessed, recordsFailed, currentStep }` | Run progress update |
| `PipelineRunCompleted` | `{ runId, pipelineCode, finishedAt, recordsProcessed, recordsFailed, metrics }` | Run completed successfully |
| `PipelineRunFailed` | `{ runId, pipelineCode, finishedAt, error }` | Run failed with error |
| `PipelineRunCancelled` | `{ runId, pipelineCode }` | Run cancelled by user |

### Step Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `StepStarted` | `{ runId, stepKey, stepType }` | Step execution started |
| `StepProgress` | `{ runId, stepKey, progressPercent }` | Step progress update [^1] |
| `StepCompleted` | `{ runId, stepKey, stepType, recordsIn, recordsOut, durationMs }` | Step completed |
| `StepFailed` | `{ runId, stepKey, stepType, error }` | Step failed with error |

### Record-Level Events

| Event | Payload | Description |
|-------|---------|-------------|
| `RECORD_EXTRACTED` | `{ runId, stepKey }` | Record extracted from source |
| `RECORD_TRANSFORMED` | `{ runId, stepKey }` | Record transformed |
| `RECORD_VALIDATED` | `{ runId, stepKey }` | Record validated |
| `RECORD_LOADED` | `{ runId, stepKey }` | Record loaded to target |
| `RECORD_REJECTED` | `{ runId, stepKey, message }` | Record rejected (validation failure) |
| `RECORD_DEAD_LETTERED` | `{ id, stepKey }` | Record sent to dead letter queue |

### Gate Events

| Event | Payload | Description |
|-------|---------|-------------|
| `GateApprovalRequested` | `{ runId, stepKey, pipelineCode, gateType }` | Gate step waiting for approval |
| `GateApproved` | `{ runId, stepKey, pipelineCode, approvedBy }` | Gate approval granted |
| `GateRejected` | `{ runId, stepKey, pipelineCode, rejectedBy, reason }` | Gate approval rejected |
| `GateTimeout` | `{ runId, stepKey, pipelineCode, timeoutMs }` | Gate approval timed out |

### Trigger Events

| Event | Payload | Description |
|-------|---------|-------------|
| `TriggerFired` | `{ pipelineCode, triggerType, triggerId }` | Trigger activated a pipeline run |
| `ScheduleActivated` | `{ pipelineCode, cronExpression, triggerId }` | Cron schedule activated |
| `ScheduleDeactivated` | `{ pipelineCode, triggerId }` | Cron schedule deactivated |

### Webhook Delivery

| Event | Payload | Description |
|-------|---------|-------------|
| `WebhookDeliveryAttempted` | `{ deliveryId, webhookId, lastAttemptAt }` | Webhook delivery attempted [^2] |
| `WebhookDeliverySucceeded` | `{ deliveryId, webhookId, lastAttemptAt, attempts, responseStatus }` | Webhook delivered successfully |
| `WebhookDeliveryFailed` | `{ deliveryId, webhookId, lastAttemptAt, attempts, responseStatus, error }` | Webhook delivery failed |
| `WebhookDeliveryRetrying` | `{ deliveryId, webhookId, lastAttemptAt, attempts }` | Webhook delivery being retried |
| `WebhookDeliveryDeadLetter` | `{ deliveryId, webhookId, lastAttemptAt, attempts, error }` | Webhook delivery exhausted retries |

### Internal Pipeline Events

| Event | Payload | Description |
|-------|---------|-------------|
| `PIPELINE_STARTED` | `{ pipelineId }` | Internal pipeline execution started |
| `PIPELINE_COMPLETED` | `{ pipelineId, processed, succeeded, failed }` | Internal pipeline execution completed |
| `PIPELINE_FAILED` | `{ pipelineId, processed, succeeded, failed }` | Internal pipeline execution failed |

### Log Events

| Event | Payload | Description |
|-------|---------|-------------|
| `LogAdded` | `{ id, timestamp, level, message, pipelineCode?, runId?, stepKey?, metadata? }` | Log entry added |

### Custom Hook Events

Hooks configured with `type: 'EMIT'` can publish arbitrary custom events:

| Event | Payload | Description |
|-------|---------|-------------|
| *(custom name)* | `{ stage, payload, record, runId }` | Custom event emitted from a hook action |

## Subscribing via Vendure EventBus

This is the recommended approach for external plugins. The `DataHubDomainEvent` class wraps all Data Hub events and is published to the standard Vendure `EventBus`.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { DataHubDomainEvent } from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class PipelineNotificationService implements OnModuleInit {
    constructor(private eventBus: EventBus) {}

    onModuleInit() {
        this.eventBus.ofType(DataHubDomainEvent).subscribe(event => {
            switch (event.name) {
                case 'PipelineRunCompleted':
                    this.sendSlackNotification(
                        `Pipeline "${event.payload?.pipelineCode}" completed. ` +
                        `Processed: ${event.payload?.recordsProcessed}, ` +
                        `Failed: ${event.payload?.recordsFailed}`,
                    );
                    break;

                case 'PipelineRunFailed':
                    this.sendPagerDutyAlert(
                        `Pipeline "${event.payload?.pipelineCode}" failed: ${event.payload?.error}`,
                    );
                    break;
            }
        });
    }

    private sendSlackNotification(message: string): void {
        // Your Slack integration
    }

    private sendPagerDutyAlert(message: string): void {
        // Your PagerDuty integration
    }
}
```

### DataHubDomainEvent Shape

```typescript
class DataHubDomainEvent<T = Record<string, unknown>> {
    readonly createdAt: Date;
    readonly name: string;        // Event name (e.g. 'PipelineRunCompleted')
    readonly payload?: T;         // Event-specific payload
}
```

### Filtering by Event Name

```typescript
import { filter } from 'rxjs/operators';

this.eventBus.ofType(DataHubDomainEvent).pipe(
    filter(event => event.name === 'PipelineRunCompleted'),
).subscribe(event => {
    // Only receives PipelineRunCompleted events
});
```

### Full Plugin Example

```typescript
import { VendurePlugin, OnModuleInit, PluginCommonModule } from '@vendure/core';
import { DataHubPlugin, DataHubDomainEvent } from '@oronts/vendure-data-hub-plugin';

@VendurePlugin({
    imports: [PluginCommonModule, DataHubPlugin],
    providers: [MetricsCollectorService],
})
export class MetricsPlugin {}

@Injectable()
class MetricsCollectorService implements OnModuleInit {
    constructor(private eventBus: EventBus) {}

    onModuleInit() {
        this.eventBus.ofType(DataHubDomainEvent).subscribe(event => {
            // Track all pipeline events in your metrics system
            this.recordMetric('datahub.event', {
                name: event.name,
                timestamp: event.createdAt.toISOString(),
                ...event.payload,
            });
        });
    }

    private recordMetric(name: string, data: Record<string, unknown>): void {
        // Your metrics system (Prometheus, Datadog, etc.)
    }
}
```

## Subscribing via DomainEventsService

For services running inside the Data Hub module, you can inject `DomainEventsService` directly and subscribe to the `events$` RxJS Observable.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEventsService, DataHubEvent } from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class AuditLogService implements OnModuleInit {
    constructor(private domainEvents: DomainEventsService) {}

    onModuleInit() {
        this.domainEvents.events$.subscribe((event: DataHubEvent) => {
            this.writeAuditLog({
                eventType: event.type,
                payload: event.payload,
                timestamp: event.createdAt,
            });
        });
    }

    private writeAuditLog(entry: Record<string, unknown>): void {
        // Write to audit log table, file, or external service
    }
}
```

### DataHubEvent Shape (Observable)

The `events$` Observable emits `DataHubEvent` objects, which have a slightly different shape from `DataHubDomainEvent`:

```typescript
interface DataHubEvent<T = Record<string, unknown>> {
    type: string;       // Event name (same as DataHubDomainEvent.name)
    payload: T;         // Event-specific payload (always defined, defaults to {})
    createdAt: Date;
}
```

### Querying the Event Buffer

`DomainEventsService` maintains an in-memory buffer of recent events (up to 200 by default). You can query it directly:

```typescript
// Get the last 50 events (most recent first)
const recentEvents = this.domainEvents.list(50);

// Get the total event count in the buffer
const count = this.domainEvents.count;
```

## Hooks vs Events

Data Hub has two systems for reacting to pipeline activity. Choose the right one for your use case.

| Feature | Hooks | Events |
|---------|-------|--------|
| **Scope** | Per-pipeline configuration | Global (all pipelines) |
| **Execution** | Inline during pipeline execution | Asynchronous, fire-and-forget |
| **Can modify records** | Yes (interceptor scripts) | No |
| **Can halt pipeline** | Yes (throw error or filter all records) | No |
| **Performance impact** | Adds latency to pipeline execution | Negligible |
| **Configuration** | Pipeline definition `hooks` section | Code in `onModuleInit` |
| **Stages** | 18 specific stages (BEFORE_EXTRACT, AFTER_LOAD, etc.) | All event types listed above |
| **Use case** | Data validation, transformation, enrichment | Monitoring, notifications, analytics |

### When to Use Hooks

- Validate or filter records at specific pipeline stages
- Enrich records with external data during processing
- Send per-pipeline webhooks at specific stages
- Trigger other pipelines from hook actions

### When to Use Events

- Send Slack/email notifications on pipeline completion or failure
- Collect metrics and build monitoring dashboards
- Write audit logs for compliance
- Sync pipeline state to external project management tools
- Trigger external workflows (CI/CD, data quality checks)

## Practical Examples

### Send Email on Pipeline Failure

```typescript
this.eventBus.ofType(DataHubDomainEvent).pipe(
    filter(event => event.name === 'PipelineRunFailed'),
).subscribe(event => {
    this.emailService.send({
        to: 'ops-team@example.com',
        subject: `Data Hub Pipeline Failed: ${event.payload?.pipelineCode}`,
        body: `Pipeline run ${event.payload?.runId} failed at ${event.createdAt.toISOString()}.\n` +
              `Error: ${event.payload?.error}`,
    });
});
```

### Track Pipeline Duration Metrics

```typescript
private runStartTimes = new Map<string, Date>();

onModuleInit() {
    this.eventBus.ofType(DataHubDomainEvent).subscribe(event => {
        if (event.name === 'PipelineRunStarted') {
            this.runStartTimes.set(String(event.payload?.runId), event.createdAt);
        }

        if (event.name === 'PipelineRunCompleted' || event.name === 'PipelineRunFailed') {
            const runId = String(event.payload?.runId);
            const startTime = this.runStartTimes.get(runId);
            if (startTime) {
                const durationMs = event.createdAt.getTime() - startTime.getTime();
                this.prometheus.histogram('datahub_pipeline_duration_ms', durationMs, {
                    pipeline: String(event.payload?.pipelineCode),
                    status: event.name === 'PipelineRunCompleted' ? 'success' : 'failure',
                });
                this.runStartTimes.delete(runId);
            }
        }
    });
}
```

### Webhook Delivery Monitoring

```typescript
this.eventBus.ofType(DataHubDomainEvent).pipe(
    filter(event => event.name.startsWith('WebhookDelivery')),
).subscribe(event => {
    this.prometheus.counter('datahub_webhook_deliveries_total', 1, {
        status: event.name.replace('WebhookDelivery', '').toLowerCase(),
        webhookId: String(event.payload?.webhookId),
    });
});
```

---

[^1]: `StepProgress` is planned for a future release. The event type is defined but not yet emitted by the runtime.
[^2]: `WebhookDeliveryAttempted` is defined but not currently emitted. It is redundant with `WebhookDeliverySucceeded`, `WebhookDeliveryFailed`, and `WebhookDeliveryRetrying`, which already cover all delivery attempt outcomes.
