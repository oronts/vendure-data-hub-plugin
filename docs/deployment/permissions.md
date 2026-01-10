# Permissions

The Data Hub plugin defines custom permissions for fine-grained access control.

## Permission Definitions

### Pipeline Permissions

| Permission | Description |
|------------|-------------|
| `CreateDataHubPipeline` | Create new pipelines |
| `ReadDataHubPipeline` | View pipelines and definitions |
| `UpdateDataHubPipeline` | Modify existing pipelines |
| `DeleteDataHubPipeline` | Delete pipelines |
| `RunDataHubPipeline` | Execute pipelines |
| `PublishDataHubPipeline` | Publish pipeline versions |
| `ReviewDataHubPipeline` | Review and approve pipelines |

### Secret Permissions

| Permission | Description |
|------------|-------------|
| `CreateDataHubSecret` | Create new secrets |
| `ReadDataHubSecret` | View secret metadata (not values) |
| `UpdateDataHubSecret` | Modify secrets |
| `DeleteDataHubSecret` | Delete secrets |

### Operational Permissions

| Permission | Description |
|------------|-------------|
| `ViewDataHubRuns` | View execution history |
| `RetryDataHubRecord` | Retry failed records |
| `ManageDataHubConnections` | Manage external connections |
| `ManageDataHubAdapters` | Configure adapters |
| `UpdateDataHubSettings` | Modify plugin settings |

### Quarantine Permissions

| Permission | Description |
|------------|-------------|
| `ViewQuarantine` | View quarantined records |
| `EditQuarantine` | Modify quarantined records |
| `ReplayRecord` | Replay processed records |

## Assigning Permissions

### Via Admin UI

1. Go to **Administrator > Roles**
2. Create or edit a role
3. In the permissions list, find "Data Hub" section
4. Enable required permissions
5. Save the role
6. Assign role to administrators

### Via Code

```typescript
import { bootstrap } from '@vendure/core';

const config: VendureConfig = {
    // ...
};

bootstrap(config).then(async app => {
    const roleService = app.get(RoleService);

    await roleService.create({
        code: 'data-hub-operator',
        description: 'Can run and monitor pipelines',
        permissions: [
            'ReadDataHubPipeline',
            'RunDataHubPipeline',
            'ViewDataHubRuns',
            'ViewQuarantine',
        ],
    });
});
```

## Role Examples

### Read-Only Access

View pipelines and runs without making changes:

```
Permissions:
- ReadDataHubPipeline
- ViewDataHubRuns
- ViewQuarantine
```

### Pipeline Operator

Run pipelines and handle errors:

```
Permissions:
- ReadDataHubPipeline
- RunDataHubPipeline
- ViewDataHubRuns
- ViewQuarantine
- RetryDataHubRecord
```

### Pipeline Developer

Create and modify pipelines:

```
Permissions:
- CreateDataHubPipeline
- ReadDataHubPipeline
- UpdateDataHubPipeline
- DeleteDataHubPipeline
- RunDataHubPipeline
- ViewDataHubRuns
- ViewQuarantine
- RetryDataHubRecord
```

### Data Hub Administrator

Full access to all features:

```
Permissions:
- CreateDataHubPipeline
- ReadDataHubPipeline
- UpdateDataHubPipeline
- DeleteDataHubPipeline
- RunDataHubPipeline
- PublishDataHubPipeline
- ReviewDataHubPipeline
- CreateDataHubSecret
- ReadDataHubSecret
- UpdateDataHubSecret
- DeleteDataHubSecret
- ViewDataHubRuns
- RetryDataHubRecord
- ManageDataHubConnections
- ManageDataHubAdapters
- UpdateDataHubSettings
- ViewQuarantine
- EditQuarantine
- ReplayRecord
```

## Permission Checks

### In GraphQL Resolvers

The plugin uses Vendure's `@Allow` decorator:

```typescript
@Allow(Permission.ReadDataHubPipeline)
@Query()
dataHubPipelines() { ... }

@Allow(Permission.RunDataHubPipeline)
@Mutation()
runDataHubPipeline() { ... }
```

### Programmatic Checks

```typescript
import { RequestContext, PermissionGuard } from '@vendure/core';

async function checkCanRun(ctx: RequestContext): Promise<boolean> {
    return ctx.userHasPermission('RunDataHubPipeline');
}
```

## Super Admin

The Super Admin role automatically has all permissions, including Data Hub permissions.

## Channel Permissions

Permissions are scoped to channels. An administrator with `ReadDataHubPipeline` in Channel A cannot view pipelines in Channel B.

To allow cross-channel access, assign the permission in each required channel or use the global channel.
