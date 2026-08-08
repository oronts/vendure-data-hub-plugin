# Event Subscriptions

Data Hub publishes process-local domain events for observability and extension
code. External Vendure plugins should subscribe through Vendure's `EventBus`.

## Delivery Contract

Each call to `DomainEventsService.publish()` does three things in the process
that emitted the event:

1. publishes a `DataHubDomainEvent` to Vendure's `EventBus`;
2. appends the event to an in-memory buffer containing at most 200 entries;
3. emits the same event through the service's internal RxJS `events$` subject.

These paths are observational and are not a durable message queue:

- API and worker processes have separate event streams and buffers;
- restart clears the buffer;
- `dataHubEvents(limit)` reads only the process serving that Admin API request;
- the publisher does not wait for subscriber work before pipeline execution
  continues;
- a subscriber cannot change an already-published pipeline result.

Use the Vendure `JobQueueService` or an external durable transport when the
reaction must survive a crash. See Vendure's
[EventBus reference](https://docs.vendure.io/current/core/reference/typescript-api/events/event-bus)
and [JobQueueService reference](https://docs.vendure.io/current/core/reference/typescript-api/job-queue/job-queue-service).

`DomainEventsService.events$` is an internal implementation surface. Although
its TypeScript class is exported, the Data Hub Nest module does not export the
provider for injection into another plugin. Use `EventBus` for a consumer
plugin.

## Runtime Event Catalog

The tables below list events emitted by current call sites. Optional values can
be absent when the executing path does not have that context.

### Pipeline Definitions

| Name | Payload |
| --- | --- |
| `PipelineCreated` | `{ pipelineId, pipelineCode, createdAt }` |
| `PipelineUpdated` | `{ pipelineId, pipelineCode, updatedAt }` |
| `PipelineDeleted` | `{ pipelineId, pipelineCode, deletedAt }` |
| `PipelinePublished` | `{ pipelineId, pipelineCode, publishedAt }` |
| `PipelineArchived` | `{ pipelineId, pipelineCode, archivedAt }` |

### Runs

| Name | Payload |
| --- | --- |
| `PipelineRunStarted` | `{ runId, pipelineCode, pipelineId?, startedAt }` |
| `PipelineRunProgress` | `{ runId, pipelineCode, progressPercent, progressMessage?, recordsProcessed?, recordsFailed?, currentStep? }` |
| `PipelineRunCompleted` | `{ runId, pipelineCode, finishedAt, recordsProcessed, recordsFailed, metrics }` |
| `PipelineRunFailed` | `{ runId, pipelineCode, finishedAt, error }` |
| `PipelineRunCancelled` | `{ pipelineId?, runId?, stepKey?, cancelledBy?, cancelledAt }` |

Cancellation is emitted by both the run service and executor paths. `runId`,
`stepKey`, `cancelledBy`, and the timestamp representation therefore depend on
which path observed cancellation.

### Steps and Gates

| Name | Payload |
| --- | --- |
| `StepStarted` | `{ pipelineId?, runId?, stepKey, stepType, timestamp }` |
| `StepCompleted` | `{ pipelineId?, runId?, stepKey, stepType, recordsProcessed?, timestamp }` |
| `StepFailed` | `{ pipelineId?, runId?, stepKey, stepType, error, timestamp }` |
| `GateApprovalRequested` | `{ pipelineId?, runId?, stepKey, timestamp }` |
| `GateApproved` | `{ pipelineId?, runId?, stepKey, approver?, timestamp }` |
| `GateRejected` | `{ pipelineId?, runId?, stepKey, reason?, timestamp }` |
| `GateTimeout` | `{ pipelineId?, runId?, stepKey, timestamp }` |

`GateTimeout` is emitted only after the atomic timeout approval has committed.
An event-observer failure is logged but does not roll back or repeat approval.

### Trigger and Delivery Events

| Name | Payload |
| --- | --- |
| `TriggerFired` | `{ pipelineId?, triggerType, details?, timestamp }` |
| `ScheduleActivated` | `{ pipelineId?, pipelineCode, scheduleCount, timestamp }` |
| `ScheduleDeactivated` | `{ pipelineId?, pipelineCode, reason?, timestamp }` |
| `WebhookDeliverySucceeded` | `{ deliveryId, webhookId, lastAttemptAt, attempts?, responseStatus? }` |
| `WebhookDeliveryFailed` | `{ deliveryId, webhookId, lastAttemptAt, attempts?, responseStatus?, error? }` |
| `WebhookDeliveryRetrying` | `{ deliveryId, webhookId, lastAttemptAt, attempts?, responseStatus?, error? }` |
| `WebhookDeliveryDeadLetter` | `{ deliveryId, webhookId, lastAttemptAt, attempts?, responseStatus?, error? }` |

An unsuccessful outgoing webhook attempt emits `WebhookDeliveryFailed` plus
either `WebhookDeliveryRetrying` or `WebhookDeliveryDeadLetter`. A successful
attempt emits `WebhookDeliverySucceeded`.

### Record and Executor Events

| Name | Payload |
| --- | --- |
| `RECORD_REJECTED` | `{ runId, stepKey, message }` |
| `RECORD_DEAD_LETTERED` | `{ id, stepKey }` |
| `RECORD_EXTRACTED` | `{ stepKey, count }` |
| `RECORD_TRANSFORMED` | `{ stepKey, count, stage? }` |
| `RECORD_VALIDATED` | `{ stepKey, count }` |
| `RECORD_LOADED` | `{ stepKey, ok, fail }` |
| `RECORD_EXPORTED` | `{ stepKey, ok, fail, pipelineId?, runId? }` |
| `RECORD_INDEXED` | `{ stepKey, ok, fail, pipelineId?, runId? }` |
| `FEED_GENERATED` | `{ stepKey, ok, fail, outputPath?, pipelineId?, runId? }` |
| `PIPELINE_STARTED` | `{ pipelineId }` |
| `PIPELINE_COMPLETED` | `{ pipelineId, processed, succeeded, failed }` |
| `PIPELINE_FAILED` | `{ pipelineId, processed, succeeded, failed }` |
| `PipelinePaused` | `{ pipelineId?, runId?, stepKey, pausedAt }` |
| `PipelineStepSkipped` | `{ pipelineId?, stepKey, reason }` |

The uppercase executor events are lower-level runtime signals. Prefer the run
lifecycle events for external operational integration because their payloads
include the run ID and pipeline code.

### Custom Events

An `EMIT` hook publishes the configured event name with:

```ts
{
    stage,
    payload,
    record,
    runId,
}
```

A custom step result can also supply an event name and payload. Custom event
schemas are owned by that hook or step implementation and are not validated as
one of the built-in event payloads.

### Unsupported Event Names

`StepProgress`, `WebhookDeliveryAttempted`, and `LogAdded` are not Data Hub
runtime event names. Use `PipelineRunProgress`, the documented webhook delivery
events, and persisted logs respectively.

## Subscribe from a Vendure Plugin

`DataHubDomainEvent` wraps every built-in and custom Data Hub event:

```ts
class DataHubDomainEvent<T = Record<string, unknown>> {
    readonly createdAt: Date
    readonly name: string
    readonly payload?: T
}
```

Register a normal Vendure provider and retain the RxJS subscription for clean
shutdown:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
    EventBus,
    Logger,
    PluginCommonModule,
    VendurePlugin,
} from '@vendure/core';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DataHubDomainEvent } from '@oronts/vendure-data-hub-plugin';

@Injectable()
class PipelineFailureSubscriber implements OnModuleInit, OnModuleDestroy {
    private subscription?: Subscription;

    constructor(private readonly eventBus: EventBus) {}

    onModuleInit(): void {
        this.subscription = this.eventBus
            .ofType(DataHubDomainEvent)
            .pipe(filter(event => event.name === 'PipelineRunFailed'))
            .subscribe(event => {
                Logger.error(
                    `Pipeline ${String(event.payload?.pipelineCode ?? 'unknown')} failed`,
                    'PipelineFailureSubscriber',
                );
            });
    }

    onModuleDestroy(): void {
        this.subscription?.unsubscribe();
    }
}

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [PipelineFailureSubscriber],
})
export class PipelineFailurePlugin {}
```

Configure `DataHubPlugin` and the consumer plugin independently in the host
`VendureConfig`. Do not import `DataHubPlugin` into the consumer plugin's Nest
module.

The subscriber callback should remain small. Enqueue notification, metrics, or
audit work when it can block, retry, or fail independently.

Data Hub consumes a rejected `EventBus.publish()` promise so an observer failure
does not create an unhandled rejection or prevent delivery to the local event
buffer. This is failure isolation, not durability; subscribers still own retry
and durable handoff for their work.

## Inspect the In-Memory Buffer

The permission-protected Admin API exposes recent buffered events:

```graphql
query RecentDataHubEvents {
    dataHubEvents(limit: 50) {
        name
        createdAt
        payload
    }
}
```

Results are newest first and capped by the 200-entry process-local buffer. This
query is useful for recent diagnostics and the Hooks page; it is not an audit
log or cluster-wide event history.

## Hooks Versus Events

| Concern | Pipeline hooks | Domain events |
| --- | --- | --- |
| Configuration | Per pipeline definition | Subscriber code |
| Timing | Inline with pipeline execution | Observer notification |
| Can modify a record | Interceptor hooks can | No |
| Failure isolation | Hook failure can affect the run | Event path is intended for observation |
| Durability | Part of the active run only | Process-local unless subscriber enqueues durable work |

Use hooks for pipeline-local interception or actions. Use domain events for
monitoring and to hand work to a durable integration. Neither process-local
event delivery nor the recent-event buffer replaces a database audit trail.
