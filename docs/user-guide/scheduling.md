# Scheduling and Triggers

Start pipelines manually or from schedules, incoming webhooks, Vendure events,
watched files, and message brokers.

## Trigger Types

| Type | Runtime source |
| --- | --- |
| `MANUAL` | Dashboard Run action or Admin API mutation |
| `SCHEDULE` | Five-field cron expression or fixed interval |
| `WEBHOOK` | Authenticated HTTP `POST` request |
| `EVENT` | Supported Vendure `EventBus` event |
| `FILE` | File watch service for a supported source |
| `MESSAGE` | Supported message-broker consumer |

A trigger is active only when its trigger step is enabled and the pipeline is
enabled and published. Saving a draft definition does not activate it.

## Manual Triggers

Run a published pipeline with the Dashboard **Run** action or the Admin API
`startDataHubPipelineRun` mutation:

```ts
.trigger('start', { type: 'MANUAL' })
```

The package does not provide a Data Hub command-line runner.

## Schedule Triggers

A schedule trigger requires exactly one timing mode:

- `cron`: a valid five-field cron expression;
- `intervalSec`: a positive integer number of seconds.

Configuring both fields, or neither field, fails pipeline validation.

### Cron Schedule

```ts
.trigger('daily-import', {
    type: 'SCHEDULE',
    cron: '0 2 * * *',
    timezone: 'UTC',
})
```

The fields are minute, hour, day of month, month, and day of week:

```text
minute hour day-of-month month day-of-week
  *      *        *        *        *
```

| Expression | Meaning |
| --- | --- |
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every five minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 02:00 |
| `0 0 * * 0` | Sunday at midnight |
| `0 0 1 * *` | First day of each month |
| `0 6,18 * * *` | At 06:00 and 18:00 |
| `0 0 * * 1-5` | Weekdays at midnight |

`timezone` is optional. When present it must be a valid IANA timezone such as
`UTC`, `Europe/Berlin`, or `America/New_York`. Without it, cron matching uses
the server timezone.

Cron expressions have minute precision. The scheduler polls at
`runtime.scheduler.checkIntervalMs` (30 seconds by default) and suppresses a
second fire for the same trigger in the same minute.

### Fixed Interval

```ts
.trigger('frequent-sync', {
    type: 'SCHEDULE',
    intervalSec: 300,
})
```

The effective interval cannot be shorter than
`runtime.scheduler.minIntervalMs` (one second by default). `timezone` does not
change fixed-interval timing.

### Activation and Changes

The schedule handler discovers enabled schedule steps from each enabled,
non-archived pipeline's selected published revision. A DRAFT or REVIEW working
copy continues to run the previous published revision; editing the working copy
does not change runtime triggers. Publishing, disabling, archiving, or
re-enabling is observed after the handler reloads definitions on
`runtime.scheduler.refreshIntervalMs` (60 seconds by default), not necessarily
immediately.

The Dashboard does not currently show a computed next-run time or an
"Upcoming Schedules" view. Confirm activation and firing through pipeline run
history and **Data Hub > Logs & Analytics**.

### Overlap and Multi-Process Behavior

Scheduled occurrences are skipped when the same pipeline already has a
`PENDING`, `RUNNING`, or `PAUSED` run. A skipped occurrence is not queued for
later. There is no schedule option for queueing overlaps or allowing concurrent
runs.

Each occurrence claims a distributed lease scoped to the pipeline, trigger,
timing mode, and deterministic cron-minute or interval bucket. The claim stays
leased until that occurrence ends instead of being released after run creation,
so a second process cannot start the same occurrence later in the same window.
Configure Redis or PostgreSQL locking for multi-process deployments;
process-local memory locking is safe only for one process.

Five consecutive failures to create a scheduled run open the handler's
in-memory circuit breaker for that pipeline. The handler emits
`ScheduleDeactivated` and skips that schedule until its failure state is reset
by process restart or the handler's internal reset path. Monitor scheduler logs
for this condition; there is no Dashboard reset control.

The schedule handler uses timers directly. Only the run it creates is handed to
the `data-hub.run` queue.

## File Watch Triggers

File watch triggers poll an FTP, SFTP, or S3 connection and seed a run with a
reference to each eligible remote file. Connect the trigger directly to the
matching `ftp` or `s3` extractor so the runtime can fetch that reference.

```ts
.trigger('incoming-catalog', {
    type: 'FILE',
    fileWatch: {
        connectionCode: 'supplier-sftp',
        path: '/incoming',
        pattern: '*.csv',
        recursive: false,
        minFileAge: 30,
        pollIntervalMs: 300_000,
    },
})
```

`path` is a remote directory for FTP/SFTP and an object prefix for S3. The
optional `pattern` is a glob matched against the discovered file name after
listing. `recursive` defaults to `true`. `minFileAge` is an integer number of
seconds from `0` to `604,800` and defaults to 30; zero processes files without
an age delay. `pollIntervalMs` is an integer from `30,000` to `86,400,000` and
defaults to `300,000`. Invalid persisted values disable that watcher instead of
being silently clamped.

The watcher stores a cursor and pending-run state per trigger, pins the
published revision that discovered the file, and advances only after the run
reaches a terminal success state. Stable file identity makes restart and
duplicate discovery idempotent for seven days. In multi-process deployments,
configure Redis or PostgreSQL distributed locking; memory locking is safe only
for a single process. Remote listing is bounded by directory-depth, entry, and
page limits, so split very large roots into narrower prefixes.

## Webhook Triggers

### Configuration

```ts
.trigger('supplier-webhook', {
    type: 'WEBHOOK',
    authentication: 'HMAC',
    secretCode: 'supplier-webhook-secret',
    hmacAlgorithm: 'SHA256',
    requireIdempotencyKey: true,
    idempotencyKeyHeader: 'X-Request-ID',
    idempotencyTtlSec: 86_400,
})
```

The endpoint is deterministic:

```text
POST /data-hub/webhook/{pipeline-code}
```

The body must be JSON. The controller accepts an object or array and seeds the
pipeline run from it. Configure one of `API_KEY`, `HMAC`, `BASIC`, or `JWT` for
write-capable pipelines; `NONE` is available but intentionally logs a security
error.

For HMAC authentication, sign the exact request bytes with the configured
secret and send either a raw hexadecimal digest or an algorithm-prefixed value:

```text
X-DataHub-Signature: sha256=<hex-digest>
```

Send webhook JSON with identity content encoding. Compressed request bodies are
rejected with 415 because decompression would change the byte sequence covered
by the signature.

The plugin installs an early Vendure JSON middleware on `*splat`. Webhook paths
use a route-aware parser that retains the exact bytes for HMAC verification and
enforces the 10 MiB plugin limit; other JSON paths use the normal Express JSON
parser. Because Vendure's `beforeListen` middleware is placed before the
automatic parser, no separate Nest `rawBody` bootstrap option is required. A
reverse proxy can still impose a smaller limit.

See Vendure's
[middleware contract](https://docs.vendure.io/current/core/reference/typescript-api/common/middleware)
and Nest's [raw-body guidance](https://docs.nestjs.com/faq/raw-body) for the
ordering and signature-verification rationale.

### Idempotency

When idempotency is required, send a non-empty unique value in the configured
header. Reusing the same key with the same request returns the existing run;
reusing it with a different request is rejected as a conflict. The scope is the
pipeline and trigger for the configured TTL.

## Vendure Event Triggers

```ts
.trigger('on-order', {
    type: 'EVENT',
    event: 'OrderPlacedEvent',
})
```

`event` must be an exact class name from the Dashboard catalog. Wildcards,
dotted action suffixes, trigger-level filters, debounce, and batching are not
supported. Apply record-level conditions in a downstream transform, route, or
gate.

Supported event classes are:

- `ProductEvent`, `ProductVariantEvent`, `ProductVariantPriceEvent`;
- `CollectionModificationEvent`, `AssetEvent`, `StockMovementEvent`;
- `OrderStateTransitionEvent`, `OrderPlacedEvent`;
- `RefundStateTransitionEvent`, `PaymentStateTransitionEvent`;
- `CustomerEvent`, `AccountRegistrationEvent`, `CustomerAddressEvent`.

The trigger seeds safe identifiers and operation or transition metadata, not a
copy of the full Vendure entity. Load current entity data in a following
extractor when it is needed.

Matching events are inserted into `data_hub_event_trigger_outbox` in the
Vendure event transaction together with the exact published revision ID. A
worker leases each row, reconstructs its channel, creates an idempotent run from
that immutable revision, and waits for the run queue to accept it. Production
workers need a persistent Vendure job queue and must consume both
`data-hub.event-trigger-outbox` and `data-hub.run`.

The run queue also reconstructs a permission-bearing Vendure context. Manual
runs retain their initiating user; automated runs use the revision publisher.
Current roles and channel assignments are reloaded when the worker starts the
run, so deleting the user or revoking access prevents execution. Code-first
pipelines without a stored actor use the configured Vendure superadmin account.

See Vendure's [EventBus reference](https://docs.vendure.io/current/core/reference/typescript-api/events/event-bus)
for the underlying event model.

## Operational Checklist

- Publish and enable the pipeline and the intended trigger step.
- Use HMAC, API key, JWT, or Basic authentication for incoming webhooks.
- Give repeated source deliveries stable idempotency keys.
- Stagger expensive schedules and account for the configured timezone.
- Use a persistent job queue and distributed lock backend in multi-process
  production deployments.
- Check run history, queue state, and persisted logs after changing a trigger.
- Test duplicate delivery, worker restart, disabled pipelines, invalid
  credentials, and a source outage before production rollout.
