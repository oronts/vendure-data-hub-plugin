# Trigger Integrations

Data Hub has built-in pipeline triggers for manual runs, schedules, webhooks,
Vendure events, watched files, and message brokers. A third-party custom trigger
adapter is not currently a supported runtime extension point.

The public SDK does not expose a custom trigger runtime adapter. Registering
trigger metadata cannot start a consumer or enqueue a run, so do not present
metadata-only trigger definitions as an operational integration contract.

## Choose a Supported Trigger

| Source | Trigger | Use when |
| ------ | ------- | -------- |
| Administrator or automation | `MANUAL` | A caller starts a published pipeline explicitly |
| Time | `SCHEDULE` | A cron expression starts recurring work |
| HTTP sender | `WEBHOOK` | The upstream system can deliver a request |
| Vendure domain event | `EVENT` | A supported Vendure entity event starts work |
| File arrival | `FILE` | A configured watch source detects a new file |
| Broker message | `MESSAGE` | A supported queue connection supplies records |

GraphQL subscriptions are not registered in the current Admin API. An `EVENT`
trigger means an internal Vendure event subscription, not a public GraphQL
subscription transport.

## Integrating a New External Source

### HTTP Producers

Use a `WEBHOOK` trigger when the source can send HTTP:

1. create a pipeline with a webhook trigger;
2. publish and enable it;
3. configure HMAC, JWT, or another supported authentication mode;
4. give the upstream system the deterministic pipeline endpoint;
5. send a stable event identifier in the configured idempotency header when the
   source supports one; and
6. monitor the queued run and record failures.

Treat webhook delivery as at-least-once. Make downstream loaders idempotent and
deduplicate with a stable source key. Never use unauthenticated webhooks for
sensitive or write-capable pipelines.

### Message Brokers

Use a `MESSAGE` trigger for a broker supported by the connection and message
consumer implementation. Configure the connection, queue/topic, consumer
identity, and acknowledgement behavior through the built-in schema.

Acknowledge a source message only after the pipeline run has been durably
accepted according to the selected adapter's contract. Validate this failure
path in staging by stopping the worker between receipt and processing; do not
infer durability from a successful happy-path run.

### Vendure Events

Use an `EVENT` trigger with an exact event class name exposed by the Data Hub
configuration catalog. The pipeline should declare the catalog/order/customer
permissions required by its downstream steps in addition to its run permission.

Data Hub registers a blocking Vendure handler that writes one outbox row per
matching pipeline trigger through the event's transaction-bound `RequestContext`.
The row contains the channel context and safe seed records; if that write fails,
the publishing operation fails rather than silently losing the trigger. After
commit, a leased worker creates one idempotent pipeline run and awaits its run-queue
enqueue. Queue errors retain attempt and error details and retry with backoff.

Use a persistent Vendure job-queue strategy in production and activate both
`data-hub.event-trigger-outbox` and `data-hub.run` on a worker. An in-memory queue
cannot preserve an already-enqueued run across a process crash. See Vendure's
[EventBus](https://docs.vendure.io/current/core/reference/typescript-api/events/event-bus)
and [JobQueueService](https://docs.vendure.io/current/core/reference/typescript-api/job-queue/job-queue-service) documentation.


### Outgoing Observation Hooks

A `WEBHOOK` hook is different from an incoming `WEBHOOK` trigger. It stores one
`data_hub_webhook_delivery` row in the active channel and queues only the row ID
plus a lease token on `data-hub.webhook-retry`. Enable that queue on a worker
and use a persistent Vendure job-queue strategy in production.

Set the same `DATAHUB_MASTER_KEY` and Secret Code providers on every API and
worker. Replay request material is encrypted; signing and sensitive header
values stay as Secret Code references and are resolved for each attempt.
Idempotency is scoped by channel, and conflicting key reuse is rejected.

### File Producers

Use a `FILE` trigger only for watch transports supported by the configured
connection. Confirm whether the deployment uses local files, FTP/SFTP, or object
storage and test that exact transport.

A file cursor must advance only after durable acceptance. Test duplicate file
names, partial uploads, reconnects, worker restart, and poison files. Archive or
move processed files according to an explicit retention policy.

## Example Webhook Pipeline

```ts
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

export const supplierWebhook = createPipeline()
    .name('Supplier webhook')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('supplier-event', {
        type: 'WEBHOOK',
        authentication: 'HMAC',
        secretCode: 'supplier-webhook-secret',
    })
    .transform('normalize', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'externalSku',
                        name: 'title',
                    },
                },
            },
        ],
    })
    .load('products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'name',
    })
    .edge('supplier-event', 'normalize')
    .edge('normalize', 'products')
    .build();
```

Register the definition through `DataHubPlugin.init({ pipelines: [...] })` or
create it through the Admin API/dashboard. Secret values are configured
separately; the definition stores only the secret code.

## When a New First-Class Trigger Type Is Required

A new trigger type currently requires a change to Data Hub itself, not only
consumer-side SDK registration. A complete implementation must include:

- a canonical trigger type and configuration schema;
- backend validation and permission derivation;
- lifecycle ownership for API versus worker processes;
- durable source acknowledgement and idempotency;
- secret and connection resolution without value disclosure;
- enqueueing through the normal immutable pipeline-run path;
- shutdown, reconnect, retry, and dead-letter behavior;
- dashboard configuration and unavailable-capability states;
- documentation generated from the registered schema; and
- integration tests for duplicate delivery, crash recovery, authorization,
  invalid configuration, and multi-process startup.

Until that contract exists, adapt the source to `WEBHOOK`, `MESSAGE`,
`EVENT`, or `FILE` rather than creating a metadata-only trigger adapter.

## Verification Checklist

For every trigger integration, verify:

- the pipeline must be published and enabled;
- an unauthorized caller cannot invoke or configure it;
- required secrets and connections resolve in every executing process;
- the event is durably accepted before the source is acknowledged;
- repeated delivery does not create unintended duplicate changes;
- a worker restart does not lose accepted work;
- invalid payloads become visible failures rather than successful empty runs;
- cancellation and retry preserve a clear audit trail; and
- logs and errors do not expose credentials or sensitive payload fields.

See [Scheduling and triggers](../../user-guide/scheduling.md), [Queue and Messaging](../../user-guide/queue-messaging.md),
and [Security Policy](../../../SECURITY.md) for the supported operational
surfaces and security boundaries.
