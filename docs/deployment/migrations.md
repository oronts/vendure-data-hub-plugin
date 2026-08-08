# Database and Upgrade Migrations

This guide covers schema changes and safe upgrades for
`@oronts/vendure-data-hub-plugin`. Database migrations belong to the host
Vendure application. This package registers entities with Vendure; it does not
ship a separate `data-hub-migrate` command or a pipeline-migration CLI.

For the authoritative Vendure workflow, see
[Database migrations](https://docs.vendure.io/current/core/developer-guide/migrations)
and the [Vendure CLI migrate command](https://docs.vendure.io/current/core/developer-guide/cli#the-migrate-command).

## Compatibility

The package currently declares:

| Component         | Supported range |
| ----------------- | --------------- |
| Data Hub          | `0.1.x`         |
| Vendure Core      | `>=3.5.7 <3.6.0` |
| Vendure Dashboard | `>=3.5.7 <3.6.0` |
| TypeORM           | `>=0.3.29 <0.4.0` |
| Node.js           | `>=20.0.0`      |

Check `package.json`, the lockfile, and `CHANGELOG.md` for the exact release
being deployed. Do not infer upgrade steps from unreleased version numbers.

### Upgrading an actual 0.1.6 database

Do not create a synthetic 0.1.6 PostgreSQL baseline from the tagged entity
metadata. That release contains explicit TypeORM `datetime` columns, which are
not a PostgreSQL column type. Generate the 0.1.7 migration against a disposable
copy of the host's actual database and review the resulting driver-specific
delta. For MySQL, also review existing indexes before accepting generated
`CREATE INDEX` statements; do not suppress a duplicate-index error without
proving the existing index has the required columns and uniqueness.

There is no universal checked-in 0.1.6-to-0.1.7 migration because migrations
belong to the host Vendure application and depend on its database driver,
custom fields, naming strategy, and existing schema. A new-install migration
or an empty-schema apply/revert test is not evidence that historical production
data can be upgraded. Rehearse the exact host copy, preserve row counts and
critical hashes, and boot both API and worker with `synchronize: false` before
the maintenance window.

### Resource-Use Permission Upgrade

Version 0.1.7 adds `UseDataHubConnection` and `UseDataHubSecret`. Vendure does
not add new custom permissions to existing non-superadmin roles automatically.
Before enabling 0.1.7, grant the appropriate use permissions to roles that
publish, revert, run, preview, test hooks, or analyze pipelines which reference
connections or Secret Codes. Connection-backed definitions require both use
permissions because a saved connection can contain indirect Secret Codes.

The use permissions do not grant connection management or secret-metadata
access. Superadmins continue to satisfy all derived permission checks.

### Exact Adapter Version Upgrade

Published pipeline revisions and run snapshots pin each adapter's exact
`version` and `apiVersion`. Do not replace an adapter while a `PENDING`,
`RUNNING`, `PAUSED`, or `CANCEL_REQUESTED` run still references a different
contract. API and worker startup validate every bounded nonterminal run after
adapter registration and fail closed when an exact binding is unavailable.

Before deploying an adapter upgrade:

1. Stop schedules, events, webhooks, and other producers that can create runs.
2. Allow every nonterminal run using the previous adapter version to finish, or
   cancel it with the normal audited lifecycle action.
3. Deploy the new adapter version to API and worker processes from the same
   application build.
4. Create and publish a new pipeline revision so its bindings pin the newly
   installed adapter contract.
5. Re-enable producers only after startup and one representative run succeed.

Terminal history retains its immutable snapshot and exact bindings for audit;
it does not block an upgrade. Do not rewrite stored run snapshots or bindings
to bypass the preflight. If a run cannot be drained, keep the previous
application artifact and adapter versions deployed until that run reaches a
terminal state.

### Database Cursor Pagination Upgrade

Database extractor definitions using `pagination.type: 'CURSOR'` must add a
different, unique, and stable `pagination.cursorTieBreakerColumn` before they
are published or run. A common pair is `updated_at` plus the primary key `id`.
Both columns must be selected by the query and contain non-null boundary
values. No database schema migration is required for this configuration change.

### CDC Composite Checkpoint Upgrade

CDC checkpoints now store the primary key beside each tracking or soft-delete
value. Before upgrading a pipeline that has already run a `cdc` step, stop its
schedule and inspect `dataHubCheckpoint(pipelineId: ...)`. Use
`updateDataHubCheckpoint` to remove that step's checkpoint entry while
preserving unrelated step entries, or reseed it from a known row with both
`lastTrackingValue` and `lastTrackingPrimaryKey` and, when delete tracking is
enabled, both `lastDeleteValue` and `lastDeletePrimaryKey`. Sending an empty
checkpoint object resets every step in the pipeline.

Single-value CDC checkpoints are intentionally rejected after the upgrade.
There is no implicit fallback because resuming from a tracking value without
its primary-key boundary can silently drop rows that share that value. No
database schema migration is required.

### Multi-Join Configuration Upgrade

Version 0.1.7 removes `rightDataPath` from `multiJoin`. Replace it with a
literal `rightData` array when the reference set is static. For dynamic data,
model both sources as explicit pipeline steps and combine them in a custom
operator; `multiJoin` does not read another step's output from ambient context.
Definitions that still contain only `rightDataPath` fail publication because
`rightData` is required, and runtime execution also fails closed.

The right dataset is limited to 10,000 objects. Output defaults to a 10,000
record ceiling and can be raised to at most 100,000 with `maxOutputRecords`.
Audit one-to-many joins before upgrading because the operator throws before the
first record beyond the ceiling instead of silently truncating results. Null,
missing, composite, and non-finite join keys no longer match each other.

## Why a Migration Is Required

The plugin registers 16 TypeORM entities. A new installation or an upgrade that
changes any of these entities can require a host-project migration:

- `data_hub_pipeline`
- `data_hub_pipeline_run`
- `data_hub_pipeline_log`
- `data_hub_pipeline_revision`
- `data_hub_event_trigger_outbox`
- `data_hub_webhook_delivery`
- `data_hub_checkpoint`
- `data_hub_record_error`
- `data_hub_record_retry_audit`
- `data_hub_connection`
- `data_hub_export_destination`
- `data_hub_feed`
- `data_hub_secret`
- `data_hub_settings`
- `data_hub_lock`
- `data_hub_schema`

The generated migration can also contain unrelated Vendure or application schema
changes. Review the complete migration rather than assuming every statement came
from this plugin.

### Managed Resource Channel Upgrade

Pipelines, connections, database-backed secrets, and schemas implement Vendure's
`ChannelAware` contract. The host-generated migration must create a many-to-many
channel junction table for each of these four entities. Exact table and column
names follow the host TypeORM naming strategy, so do not copy names from another
installation. Review that every junction table has foreign keys to the managed
resource and Vendure `channel` table, plus uniqueness for each resource/channel
pair.

Existing resources have no junction rows immediately after the migration. On the
first server startup, Data Hub acquires its configuration-sync lock and assigns
unassigned resources to Vendure's default channel before code-first synchronization,
schedulers, or runtime discovery can use them. The backfill is bounded and fails
closed if it exceeds the safety limit or makes no progress. Workers wait until the
server-owned backfill is complete. Start one API server first, verify the backfill,
then start workers and additional API replicas. Do not insert guessed channel IDs in
the migration or enable TypeORM `synchronize` in production.

### Entity ID Strategy

Data Hub entity references use Vendure's `@EntityId()` decorator and `ID`
type, so a new database follows the host's configured
`entityOptions.entityIdStrategy`. Vendure supports numeric
`AutoIncrementIdStrategy` IDs and string `UuidIdStrategy` IDs. The decorator
selects the corresponding database column type at runtime; see Vendure's
[EntityId decorator](https://docs.vendure.io/current/core/reference/typescript-api/configuration/entity-id-decorator)
and [EntityIdStrategy reference](https://docs.vendure.io/current/core/reference/typescript-api/configuration/entity-id-strategy).

Choose the ID strategy before creating the database and keep it stable. Vendure
explicitly warns that changing an existing integer database to UUIDs breaks
foreign-key references and requires a fresh database. This plugin does not
provide an in-place integer-to-UUID conversion.

When upgrading an existing Data Hub installation, generate the host migration
with the same ID strategy used by that database. Review any type changes for
pipeline, run, revision, log, checkpoint, error, retry-audit, and event-outbox ID
reference columns. An auto-increment installation should retain integer
references; a UUID installation should retain string references. Do not apply a
generated cast or column recreation until it has been tested against a restored
copy of the target database.

### Pipeline Optimistic Concurrency Upgrade

A build that adds pipeline lifecycle concurrency protection requires a generated
host migration for `data_hub_pipeline`. Review that the migration adds the
non-null integer `rowVersion` column with a default and initial value of `1`
for existing rows.
The column is an internal TypeORM `VersionColumn`; every pipeline update advances
it automatically, and conditional lifecycle writes reject stale editors rather
than overwriting a concurrent publish, archive, draft save, or restore.

Do not expose or manually edit `rowVersion`, and do not run older API or worker
processes after applying the migration because they do not include the version
predicate. Apply the migration during the same maintenance window in which all
Data Hub processes are upgraded, then verify that a draft save, publication, and
archive each complete successfully.

### Code-First Ownership Upgrade

The persisted ownership contract requires a host migration for both
`data_hub_pipeline` and `data_hub_connection`. Review that the generated
migration adds a non-null `configurationSource varchar(20)` column to each
table, with `DATABASE` as the default and backfill value for every existing
row. Do not label existing rows `CODE_FIRST` in the migration: ownership is
claimed only after the running application validates the active deployed
definition with the same code.

Apply this migration while every old API and worker process is stopped. On the
first API startup, one process acquires the configuration-sync lock and marks
each active deployed pipeline and connection as `CODE_FIRST`; workers wait for
that exact persisted source and definition before starting discovery. The
Dashboard then exposes the resource as read-only. Pipeline review, publication,
execution, export, history, and comparison remain available, but definition,
lifecycle, draft, and connection mutations are rejected by the API as well as
disabled in the Dashboard.

Removing a deployed definition does not delete its database row. The next API
startup changes its source back to `DATABASE`, preserving pipeline revisions,
runs, and connection data and returning edit and delete control to the
Dashboard. Review released resources before enabling schedules or triggers;
delete one only through the normal Dashboard/API workflow after confirming it
is no longer referenced. Deploy the migration and the new API/worker build in
one maintenance window because older processes neither claim ownership nor
wait for its reconciliation.

### Pipeline Run Channel Upgrade

A build that adds execution-channel persistence to `data_hub_pipeline_run`
requires a generated host migration before API or worker startup. Review that
the migration adds a nullable entity-ID-compatible `revisionId` column,
nullable `channelId` and `channelToken` varchar columns,
nullable `queueRequestedAt` and `queueDispatchedAt` timestamp columns, and
the `(status, queueRequestedAt)` recovery index. These fields remain nullable
so existing terminal history can be retained without an unsafe guessed
backfill; every newly created run writes its active published revision, channel,
and durable queue request.

Stop run producers and drain `PENDING`, `RUNNING`, and `PAUSED` runs before the
upgrade. A worker restores the saved channel from `channelToken` and verifies
that Vendure resolves it to the saved `channelId`. Missing metadata, a deleted
channel, or an ID/token mismatch is retried according to the run queue policy
and then marks the run `FAILED`; execution never falls back to the current
default channel.

The run row is also the durable handoff record for `data-hub.run`.
`queueRequestedAt` remains set until a worker owns execution, and
`queueDispatchedAt` is an atomic dispatch claim. API and worker startup
reconcile missing or stale claims, so a process failure between committing the
run and adding the Vendure job does not strand the run permanently. Duplicate
recovery jobs are safe because execution is protected by the distributed
pipeline lock and terminal runs are ignored.

Version timelines attribute run counts and outcomes only when `revisionId` is
present. Existing historical runs remain visible in the run log but are not
guessed into a revision. If an external audit record can prove an old run's
revision, backfill it explicitly after validating the entity ID type.

### Durable Gate Timeout Upgrade

Version 0.1.7 stores actionable gate timeout state on each
`data_hub_pipeline_run` row. Generate a host migration that adds these nullable
columns:

- `gateStepKey varchar(255)`
- `gateTimeoutAt` timestamp
- `gateTimeoutLeaseToken varchar(64)`
- `gateTimeoutLeaseExpiresAt` timestamp

Review that the migration also creates indexes on `(status, gateTimeoutAt)` and
`(status, gateTimeoutLeaseExpiresAt)`. Pending records and the one-time approval
marker remain in the pipeline checkpoint; the selected gate, deadline, and
maintenance lease belong to the individual run.

Stop producers and drain `PENDING`, `RUNNING`, and `PAUSED` runs before applying
this migration. Do not run old and new API or worker processes together: older
processes do not populate the run deadline, so the bounded timeout scanner cannot
discover their checkpoint-only timeout gates. The safest upgrade is to resolve
or cancel every paused gate before deployment.

If a paused run must be preserved, backfill `gateStepKey` from
`metrics.pausedAtStep` only after verifying that its immutable
`definitionSnapshot` contains that exact GATE and its run-scoped pending
checkpoint exists. For a TIMEOUT gate, derive `gateTimeoutAt` from the pending
checkpoint's original `pausedAt` plus the validated immutable
`timeoutSeconds`. Never derive it from deployment time. Leave both lease fields
null. If any evidence is missing, leave the deadline null and resolve the gate
manually after an audited backfill; do not guess.

The server process checks at most 100 due gates every 30 seconds and claims each
row with a 60-second lease before using the same atomic approval transition as a
manual action. A failed attempt becomes eligible again after the lease expires.
`GateTimeout` is published only after durable approval succeeds.

### Checkpoint Uniqueness Upgrade

Generate a host migration that replaces the non-unique checkpoint pipeline
index with a unique index on `data_hub_checkpoint.pipelineId`. Before applying
it to an older database, identify duplicate rows per pipeline, retain the newest
valid checkpoint, and archive the others for audit. Do not let the migration
choose an arbitrary duplicate: incremental source cursors and pending gate records
may differ. Runtime creation handles a concurrent insert by updating the row
that won the unique constraint.

On MySQL, review the generated statement order as well as the final schema.
The foreign key on `pipelineId` can use one of the old indexes as its supporting
index, and MySQL rejects an attempt to drop that index while the foreign key is
still present. Order the migration to drop the checkpoint foreign key first,
drop the old indexes, create the unique index, and then recreate the foreign
key. Verify that `down()` restores both old indexes and the foreign key, and
rehearse both directions against the same MySQL major version used in production.

### Durable FILE Intent Upgrade

FILE-watch cursors and pending-run intents are stored inside the existing
`data_hub_checkpoint.data` JSON value, so this change does not add a database
column. New pending intents include the exact published `revisionId` and
`connectionCode` captured when the file was discovered. A restart or later
publication resumes that file against the captured revision instead of silently
switching its source or executable definition.

Before upgrading, stop FILE watchers and let every pending file run complete.
Older pending JSON without both fields fails closed and must not be assigned the
pipeline's current revision by guesswork. If an old intent cannot be drained,
archive its checkpoint and either reconstruct the two values from audited
deployment records or clear the intent and deliberately reprocess the file.
After deployment, test a pending file across both a process restart and a new
pipeline publication; the resulting run must retain the revision recorded by
the original intent.

### Settings Singleton Upgrade

Generate a host migration that adds `scope varchar(32) NOT NULL DEFAULT
'global'` to `data_hub_settings` and creates a unique index on `scope`.
Before applying the unique index, merge duplicate legacy settings rows
deliberately and retain one `global` row. Runtime initialization uses an
atomic insert-or-ignore operation, so concurrent API and worker startup cannot
create multiple singleton rows.

After applying the migration, start the API and worker and verify a controlled
manual run in a non-default channel plus one scheduled run. Confirm that loaders,
record errors, hooks, and execution logs operate in the channel captured when
the run was created, even if the worker processes the job later.

### Durable Message Consumer Intent Upgrade

Generate a host migration that adds nullable `consumerControlOverrides` to
`data_hub_settings`. The entity uses TypeORM `simple-json`, so review the
driver-specific serialized text type generated by the host rather than changing
it to a database-specific JSON type by hand. Existing rows should remain `NULL`;
`NULL` and an empty object both mean that each message trigger follows its
`autoStart` default.

Manual start and stop mutations persist booleans keyed by published pipeline
code and trigger key. All settings mutations are serialized in-process and use
one service-owned transaction. PostgreSQL, MySQL, MariaDB, and other supported
production drivers also lock the singleton row before saving, so retention or
AutoMapper changes cannot overwrite consumer intent and concurrent replicas
cannot lose updates to different keys. SQLite, better-sqlite3, and sql.js do not
support TypeORM pessimistic row locks and are therefore single-process-only for
Data Hub settings mutations.

After applying the migration, verify a manual stop across an API restart and a
manual start for a trigger configured with `autoStart: false`.

`desiredEnabled` is durable cluster-wide intent and status queries read its
latest persisted value. `isActive` is only local-replica ownership; a desired
consumer can report inactive on one replica because another replica owns its
distributed lock or because it is awaiting retry. The local owner applies a
manual stop immediately. A mutation handled by a non-owning replica persists the
stop immediately, while the remote owner converges during its refresh cycle,
which is 60 seconds by default.

### Durable EVENT Trigger Upgrade

A build that introduces `data_hub_event_trigger_outbox` requires a generated
host migration before API or worker startup. Review that the migration creates
the unique `deliveryKey` index and the status/availability, status/lease, and
pipeline/date indexes.

When upgrading an installation that already has this table, the generated
migration must also add nullable entity-ID-compatible `revisionId`, nullable
`failedAt`, and the `(status, deliveredAt)` and `(status, failedAt)`
indexes. Keep `revisionId` nullable for historical rows; do not guess a
revision from the pipeline's current pointer.

Before applying this upgrade, stop EVENT producers and drain
`PENDING`, `DISPATCHING`, `QUEUED`, and `PROCESSING` rows. If a complete
drain is impossible, archive the remaining rows for audit and accept that
legacy rows without a revision pin become `FAILED` when dispatched. Missing,
archived, disabled, or deleted target pipelines also terminalize captured
deliveries instead of retrying forever.

There is no process-local EVENT backlog to migrate from older behavior. After
applying the migration, use a persistent Vendure job-queue strategy and activate
`data-hub.event-trigger-outbox` and `data-hub.run` on a worker. Validate one
controlled event, its channel context, pinned `revisionId`, the outbox
transition to `DELIVERED`, and the resulting run before re-enabling
high-volume event sources. Also verify the generated migration against a
restored database using the host's numeric or UUID entity-ID strategy.

### Durable Outgoing Webhook Upgrade

A build that introduces `data_hub_webhook_delivery` requires a generated host
migration before API or worker startup. Review that the migration creates the
channel/idempotency unique index plus status/availability, lease, channel/date,
and webhook/date indexes.

Outgoing webhook replay envelopes use AES-256-GCM and require the same
`DATAHUB_MASTER_KEY` on every process that creates or consumes
`data-hub.webhook-retry` jobs. Configure and verify the key before re-enabling
observation hooks. Losing or changing the key leaves the encrypted payload
recoverable only after restoring the original key; the Admin API never exposes
the encrypted envelope or decrypted request material.

The previous process-local retry Maps were not database state and cannot be
migrated. Drain pending outgoing hooks before replacing an older process if
those deliveries must complete.

### Durable Export Destination Upgrade

A build that introduces `data_hub_export_destination` requires a generated host
migration before destination registration, listing, testing, or delivery. Review
that the migration creates a unique `(channelId, destinationId)` index and the
channel/type and channel/enabled lookup indexes.

The table stores validated destination definitions and Secret Codes only. It
must never contain resolved credentials. All API and worker processes must use
the same database and have access to the referenced secrets.

### Durable Feed Upgrade

A build that introduces `data_hub_feed` requires a generated host migration
before feed creation, listing, generation, or scheduling. Review that the
migration creates a unique `(channelId, code)` index and a schedule-enabled
lookup index. The row stores the feed definition, the last claimed schedule
minute, and metadata for the current generated artifact.

Older feed definitions lived only in process memory, so there is no database
state to migrate. Record required definitions before stopping the old process,
then recreate them through `createDataHubFeed` after the migration. Definitions
are isolated by the active Vendure channel; an input `channelToken` cannot
override the caller's channel.

Creation rejects an existing channel/code pair. Definition replacement uses
`updateDataHubFeed` with the persisted feed ID, and deletion uses
`deleteDataHubFeed`. Both resolve the ID within the active channel. Definition
changes and deletions clean up the current generated artifact while coordinating
with manual and scheduled generation through the same distributed lock.

Generated content is stored through the Data Hub storage backend and downloaded
through the permissioned `/data-hub/files/:id/download` route. Use shared S3
storage for multiple API or worker instances, or mount the same persistent local
storage path on every process that must serve artifacts. Scheduled generation
uses the configured distributed-lock backend; do not use process-local locking
for a multi-instance deployment.

Previous destination registrations lived only in process memory and cannot be
recovered after that process stops. Record any required definitions before the
upgrade, apply the migration, then register each destination again in its
intended Vendure channel. Verify channel-isolated list, test, and controlled
delivery operations before re-enabling scheduled exports.

### Schema Registry Upgrade

A build that introduces `data_hub_schema` requires a generated host migration
before the schema registry API or Dashboard route is used. Review that the
migration creates the table with `schemaId`, `version`, `compatibility`,
`definition`, and nullable `metadata` columns, plus a unique composite index on
`(schemaId, version)`.

Schema definitions and compatibility modes are immutable after creation.
Metadata can be updated, but a contract change requires a new version. The
plugin intentionally does not rewrite existing pipeline JSON during migration;
add `schemaRef` bindings through the Dashboard or SDK after the referenced
versions exist.

## Development and Production Modes

The repository's development server uses:

```ts
dbConnectionOptions: {
    type: 'better-sqlite3',
    synchronize: true,
}
```

That setting is convenient for disposable local data. Do not copy it to
production. Vendure warns that `synchronize: true` can make destructive schema
changes automatically.

A production host should use `synchronize: false` and configure its migration
files, for example:

```ts
import path from 'node:path';

export const config: VendureConfig = {
    // ...
    dbConnectionOptions: {
        // database connection options
        synchronize: false,
        migrations: [path.join(__dirname, 'migrations/*.+(js|ts)')],
    },
    plugins: [
        DataHubPlugin.init({
            // plugin options
        }),
    ],
};
```

Generate migrations from the host application after the plugin has been added to
that same Vendure configuration. Vendure's helpers include plugin entities and
custom fields; a standalone TypeORM CLI does not have all of that configuration
context.

## New Installation

Run these steps in the host Vendure project, not in the plugin source repository.

1. Install compatible, pinned package versions and commit the host lockfile.
2. Add `DataHubPlugin.init(...)` to the Vendure configuration used by the
   migration command.
3. Keep `synchronize: false`.
4. Back up the database before applying schema changes.
5. Generate a migration:

    ```bash
    npx vendure migrate -g add-data-hub
    ```

    Interactive mode is also available:

    ```bash
    npx vendure migrate
    ```

6. Review the generated `up()` and `down()` methods. Confirm table names,
   indexes, foreign keys, nullability, defaults, and database-specific types.
7. Test the migration against a disposable copy of the target database.
8. Run pending migrations:

    ```bash
    npx vendure migrate -r
    ```

9. Start the API and worker with the same application build and configuration.

A host created with a recent Vendure project template may call `runMigrations()`
before `bootstrap()`. If so, normal application startup applies pending
migrations. Keep the explicit deployment step if it provides better operational
control, but do not run the same deployment concurrently from several processes.

## Upgrading the Plugin

### Before the Maintenance Window

- Read every `CHANGELOG.md` entry between the installed and target versions.
- Pin the target Data Hub and Vendure versions; do not deploy an unreviewed
  `latest` range.
- Back up the database and test that the backup can be restored.
- Back up persistent local/object artifact storage at the same logical recovery
  point as the database. Restored checkpoints and pending remote intents must
  be reconciled with remote files before producers restart.
- Back up the exact application artifact, configuration, environment-variable
  names, lockfile, and `DATAHUB_MASTER_KEY`.
- Export or otherwise record critical pipeline definitions as a second recovery
  aid. A definition-only export does not replace a database backup because it
  excludes revisions, runs, logs, checkpoints, errors, settings, connections,
  and secrets.
- Clone or sanitize production data into staging and run representative imports,
  exports, schedules, webhooks, message consumers, retries, and dry runs.
- Record the number and status of pipelines, connections, destinations, secrets,
  active runs, and pending jobs before deployment.

### Generate and Review the Schema Delta

Use the host configuration with the target plugin version installed:

```bash
npx vendure migrate -g upgrade-data-hub
```

Review the migration for:

- destructive `DROP`, truncation, or column recreation;
- type or length changes that can reject existing data;
- new non-null columns without safe defaults or backfills;
- unique constraints that existing rows violate;
- long-running index creation and table locks;
- foreign-key ordering and cascade behavior;
- reversible `down()` logic.

An empty migration is valid when the target release does not change persisted
entities. Do not add placeholder SQL merely to create a version marker.

### Deploy

1. Stop or quiesce trigger sources that can create new work.
2. Allow `PENDING`, `RUNNING`, `PAUSED`, and `CANCEL_REQUESTED` runs to reach a
   terminal state. An adapter upgrade is blocked while any nonterminal run is
   incompatible with the target build.
3. Stop API and worker processes that can read or write Data Hub tables.
4. Apply the reviewed migration once:

    ```bash
    npx vendure migrate -r
    ```

5. Deploy the API and worker from the same build.
6. Provide the same secret environment variables, master key, plugin
   configuration, and adapter registrations to every process that needs them.
7. Start workers and API processes, then re-enable external triggers.
8. Complete the validation checklist below before declaring the deployment
   healthy.

Vendure/TypeORM normally attempts to wrap a migration in a transaction. MySQL and
MariaDB cannot transactionally roll back every DDL operation, so a failed
migration can still leave a partial schema. A tested backup is mandatory.

## Configuration and Data Semantics

### Code-First Pipelines and Connections

At application bootstrap, file-based definitions are loaded first and inline
plugin options are applied after them. Code-first pipelines and connections are
upserted into the database by code and marked `CODE_FIRST`. Matching records are
read-only through Dashboard and public mutations while the deployed definition
is active, so a user edit cannot be silently overwritten at the next bootstrap.

Removing a code-first definition releases the persisted row to `DATABASE`
ownership on the next API startup; it does not delete the row. Review the
released connection or pipeline, its references, schedules, triggers, revision
history, and runs before editing, enabling, or deliberately deleting it.

### Secrets

Code-first secrets are held in an in-memory startup snapshot and override
same-code database rows for that process. They are not copied into the database.
Removing a code-first secret can therefore reactivate a historical database row
on the next startup.

Production code-first secrets must use `provider: 'ENV'`. Database-backed
`INLINE` values require the same `DATAHUB_MASTER_KEY` on every API and worker.
Back up the key separately from the database. Changing or losing it makes
existing ciphertext unreadable.

Before removing or renaming any secret:

1. identify every pipeline and connection reference;
2. inspect whether a same-code database row exists;
3. create and verify the replacement;
4. update all consumers;
5. run a safe validation;
6. remove the old definition only after the cutover.

See [Secrets](../user-guide/secrets.md) for storage modes and key rotation.

### Pipeline Definition Versions

The canonical pipeline definition currently uses `version: 1`. Database schema
migrations do not rewrite arbitrary JSON definitions automatically. If a release
announces a definition change, validate each stored and code-first definition
with the target build in staging before production deployment.

Do not edit pipeline JSON directly in SQL. Use the dashboard or Admin API so
validation, revisions, permissions, and status transitions remain in effect.

## Validation Checklist

After a new installation or upgrade:

- the API and worker start without schema, decryption, adapter-registration, or
  configuration-sync errors;
- the Vendure Dashboard loads the Data Hub routes;
- pipeline, connection, secret-status, run, log, checkpoint, and error lists can
  be queried with appropriately permissioned roles;
- destination listings contain only the active channel's definitions;
- unauthenticated and underprivileged requests are rejected;
- secret API responses expose status metadata but never stored or resolved
  values;
- code-first pipelines, connections, and secrets show the intended runtime
  source;
- representative pipeline definitions validate;
- a non-destructive dry run succeeds;
- one controlled queued run is processed by a worker;
- retry, checkpoint, schedule, webhook, and message-consumer behavior needed by
  the deployment is exercised;
- existing published pipelines remain published only when their executable
  definition was not changed;
- logs and metrics contain no credentials or sensitive payloads;
- counts and statuses match the pre-deployment record.

Keep the migration output, application logs, and validation evidence with the
deployment record.

## Rollback

Rollback is an application-and-data decision, not only a schema command.

### Preferred Recovery

If the previous application version can read the new schema, stop the new
processes and redeploy the previous application/configuration without reversing
the schema. Verify this compatibility in staging first.

If the schema or data is incompatible, restore the database backup together with
the previous application artifact, configuration, lockfile, environment, and
master key. Restoring only one part can leave ciphertext, definitions, and schema
out of sync.

### Reverting the Last Migration

Vendure can execute the last migration's `down()` method:

```bash
npx vendure migrate --revert
```

Use this only after reviewing the exact `down()` method and confirming that it
will not discard data needed for recovery. A migration that drops new tables or
columns is not a safe rollback once production data has been written.

After any rollback, repeat the startup, permission, secret, pipeline, and worker
validation checks. Keep trigger sources paused until data integrity is confirmed.

## Troubleshooting

### The CLI Cannot Find the Vendure Configuration

Run the command from the host project and use the CLI's configuration selection
when the project has a nonstandard layout. Confirm that the chosen configuration
includes `DataHubPlugin` and points at the intended database.

### No Schema Changes Are Generated

Confirm that:

- the target plugin version is installed in the host lockfile;
- the migration command loads the same Vendure configuration as production;
- `DataHubPlugin` is present in `plugins`;
- the database already contains the expected schema; and
- no environment-specific conditional omitted the plugin.

An empty delta is expected for a release with no entity changes.

### Startup Reports Missing Tables or Columns

Do not enable `synchronize` as a production repair. Stop affected processes,
compare the deployed migration files with the database migration table, apply
the reviewed pending migration, and restart.

### Encrypted Secrets Cannot Be Read

Verify that every process has the exact original `DATAHUB_MASTER_KEY`. If the
key is unavailable or the ciphertext is corrupted, the value cannot be derived
from the database. Restore the key from the protected backup or replace the
credential at its source and save a new value.
