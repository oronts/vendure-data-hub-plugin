# Permissions

The plugin registers 27 Vendure custom permissions: two four-operation CRUD
groups and 19 task-specific permissions. Assign permissions through Vendure
roles and use the smallest set required for each operator.

## Registered Permissions

### Pipeline CRUD

`DataHubPipelinePermission` registers:

| Permission | Purpose |
| ---------- | ------- |
| `CreateDataHubPipeline` | Create pipeline records |
| `ReadDataHubPipeline` | Read pipeline metadata and definitions |
| `UpdateDataHubPipeline` | Edit pipeline records and definitions |
| `DeleteDataHubPipeline` | Delete pipelines |

### Secret CRUD

`DataHubSecretPermission` registers:

| Permission | Purpose |
| ---------- | ------- |
| `CreateDataHubSecret` | Create a write-only secret value |
| `ReadDataHubSecret` | Read secret metadata and value status, never the value |
| `UseDataHubSecret` | Resolve a referenced secret during an authorized pipeline execution, preview, or sandbox |
| `UpdateDataHubSecret` | Replace, retain, clear, or change a secret |
| `DeleteDataHubSecret` | Delete a database-backed secret |

### Operations and Administration

| Permission | Purpose |
| ---------- | ------- |
| `RunDataHubPipeline` | Start, cancel, preview, sandbox, and otherwise control pipeline runs; effective pipeline capabilities are also enforced |
| `ViewDataHubRuns` | Read run history and run details |
| `ManageDataHubAdapters` | Open the adapter catalog and read adapter capability metadata used by pipeline editors |
| `ManageDataHubConnections` | Create, read, update, and delete connections |
| `UseDataHubConnection` | Use a referenced connection during an authorized pipeline execution, preview, or sandbox |
| `ViewDataHubQuarantine` | Read quarantined or failed records |
| `EditDataHubQuarantine` | Modify quarantined records, including retry payload patches |
| `ReplayDataHubRecord` | Retry a record unchanged from its recorded failure point |
| `PublishDataHubPipeline` | Publish an executable pipeline revision |
| `ReviewDataHubPipeline` | Review and approve pipeline changes |
| `UpdateDataHubSettings` | Change Data Hub settings |
| `ViewDataHubAnalytics` | Read analytics |
| `ManageDataHubWebhooks` | Manage webhook operations |
| `ManageDataHubDestinations` | Manage export destinations |
| `ManageDataHubFeeds` | Manage feed resources |
| `ViewDataHubEntitySchemas` | Read entity-schema metadata |
| `ManageDataHubFiles` | Upload, register, and delete Data Hub files |
| `ReadDataHubFiles` | Read or download Data Hub files |


## Assigning Roles

Use **Settings → Roles** in the Vendure Dashboard:

1. create or edit a role;
2. assign the role to the intended channel or channels;
3. select the required Data Hub permissions;
4. save the role; and
5. assign the role to the appropriate administrator.

The superadmin role has every registered permission.

### Example Role Sets

A monitoring role commonly needs:

```text
ReadDataHubPipeline
ViewDataHubRuns
ViewDataHubQuarantine
ViewDataHubAnalytics
```

A pipeline operator commonly adds:

```text
RunDataHubPipeline
ReplayDataHubRecord
ReadDataHubFiles
```

Publishing, reverting, interactive execution, extract preview, hook testing,
impact analysis, and sandbox operations enforce the effective pipeline
capabilities in addition to their operation permission. Adapter-declared
permissions are combined with resource references. A definition that references
a connection requires `UseDataHubConnection` and `UseDataHubSecret`, because the
saved connection can contain indirect Secret Codes. A direct Secret Code
reference requires `UseDataHubSecret`. These use permissions do not grant
connection management or secret-metadata access. Superadmins satisfy the derived
checks.

Scheduled, event, file-watch, message, and authenticated incoming-webhook
triggers execute an already-approved published revision under the plugin's
system context. They do not inherit a transient administrator role. The
publication gate is therefore the capability boundary for those automated
executions.

HTTP and GraphQL authentication must be attached to a saved connection with an
HTTP(S) `baseUrl`. A connection-backed request can use relative paths or an
absolute URL on that same origin. Cross-origin absolute URLs and redirects are
rejected before credentials are sent.

A pipeline author commonly adds:

```text
CreateDataHubPipeline
UpdateDataHubPipeline
DeleteDataHubPipeline
ViewDataHubEntitySchemas
ManageDataHubAdapters
```

Keep review and publish permissions in a separate role when change approval must
be independent from authoring. Secret, connection, webhook, destination, feed,
settings, and file-management permissions should be added only for operators who
own those resources.

## Backend Checks

Resolvers and controllers use Vendure's `@Allow()` decorator with the exported
permission definitions:

```ts
import { Mutation, Query } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import {
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
} from '@oronts/vendure-data-hub-plugin';

@Allow(ViewDataHubRunsPermission.Permission)
@Query()
dataHubPipelineRuns() {}

@Allow(RunDataHubPipelinePermission.Permission)
@Mutation()
startDataHubPipelineRun() {}
```

For a programmatic check, `RequestContext.userHasPermissions()` takes an array
and uses OR semantics:

```ts
import type { RequestContext } from '@vendure/core';
import { RunDataHubPipelinePermission } from '@oronts/vendure-data-hub-plugin';

export function canRunDataHubPipeline(ctx: RequestContext): boolean {
    return ctx.userHasPermissions([RunDataHubPipelinePermission.Permission]);
}
```

The installed Vendure 3.5 API provides `userHasPermissions()`. The singular
`userHasPermission()` method shown in older examples is not the current API.

## Dashboard Checks

Use the dashboard package's public guard for individual actions:

```tsx
import { PermissionGuard } from '@vendure/dashboard';

<PermissionGuard requires={['RunDataHubPipeline']}>
    <RunPipelineButton />
</PermissionGuard>
```

Route and navigation permission requirements should also be declared so users do
not see links to pages they cannot open. Backend `@Allow()` checks remain the
security boundary; a hidden dashboard control is only a usability measure.

## Channel Scope

Pipelines, connections, database-backed secrets, and schemas are `ChannelAware`.
Creation assigns them to Vendure's default channel and the active request channel.
List, detail, validation, and runtime lookup paths require an assignment to
`ctx.channelId`. The Admin API exposes explicit bounded assign/remove mutations;
the caller needs the resource permission in the target channel, and resources must
already be visible in the active source channel. Resources cannot be removed from
the default channel.

Deleting one of these resources from a non-default active channel removes that
channel assignment rather than deleting the database row. Default-channel deletion
is rejected while the resource is assigned to another channel. Global code
uniqueness is retained, so rename and physical-delete guards inspect published
definitions and nonterminal run snapshots across all channels. Channel fields show
all assignments only in the default channel; other channels see only themselves.

Code-first secrets are process configuration rather than database entities. They
are visible in the default channel and only in additional channel codes explicitly
declared with `channelCodes`. Runs, checkpoints, logs, settings, errors, export
destinations, and feeds retain their documented channel/global contracts and are
not made `ChannelAware` by this resource assignment model.

Before user-initiated execution, dry-run, sandbox, step testing, publication, or
revert, Data Hub resolves every statically configured target channel. This
includes the pipeline channel token, effective `EXPLICIT` and `MULTI` channel
IDs, step overrides, and a loader's static `channel` code. Pipeline context
channels are resolved as Vendure tokens; loader channels are resolved as codes.
Data Hub then uses
Vendure's `RoleService.userHasAllPermissionsOnChannel()` to require the operation
permission and all effective adapter/capability permissions on every target.
Unknown targets fail before a run or revision is persisted.

A loader `channelsField` selects channels from runtime records, so its complete
target set cannot be authorized in advance. Pipelines using that option require
`SuperAdmin` for user execution and publication. Automated schedules, event
triggers, webhooks, file watchers, messages, and pipeline hooks execute immutable
published revisions as trusted system work. These target checks complement, rather
than replace, managed-resource channel assignment checks.
