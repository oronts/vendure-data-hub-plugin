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
| `UpdateDataHubSecret` | Replace, retain, clear, or change a secret |
| `DeleteDataHubSecret` | Delete a database-backed secret |

### Operations and Administration

| Permission | Purpose |
| ---------- | ------- |
| `RunDataHubPipeline` | Start, cancel, and otherwise control pipeline runs |
| `ViewDataHubRuns` | Read run history and run details |
| `ManageDataHubAdapters` | Read and manage adapter capabilities |
| `ManageDataHubConnections` | Create, read, update, and delete connections |
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

Pipeline, secret, connection, run, checkpoint, log, settings, and error entities
in this plugin are not `ChannelAware`. Their services query global Data Hub
records rather than filtering those records by `ctx.channelId`.

Vendure evaluates a role's permission in the active channel, but that must not be
interpreted as Data Hub record isolation between channels. An administrator who
passes a Data Hub permission check can access the corresponding global plugin
resource. Use globally trusted administrative roles until channel-aware entities,
assignments, query filters, migrations, and isolation tests are implemented.

Entity loaders can still target Vendure channels according to their own
configuration and Vendure service permissions. That target-channel behavior does
not make the Data Hub configuration records themselves channel-scoped.
