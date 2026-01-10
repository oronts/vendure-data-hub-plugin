import { CrudPermissionDefinition, PermissionDefinition } from '@vendure/core';

// Permission definitions (for config)
export const DataHubPipelinePermission = new CrudPermissionDefinition('DataHubPipeline');
export const DataHubSecretPermission = new CrudPermissionDefinition('DataHubSecret');
export const RunDataHubPipelinePermission = new PermissionDefinition({ name: 'RunDataHubPipeline' });
export const ViewDataHubRunsPermission = new PermissionDefinition({ name: 'ViewDataHubRuns' });
export const RetryDataHubRecordPermission = new PermissionDefinition({ name: 'RetryDataHubRecord' });
export const ManageDataHubAdaptersPermission = new PermissionDefinition({ name: 'ManageDataHubAdapters' });
export const ManageDataHubConnectionsPermission = new PermissionDefinition({ name: 'ManageDataHubConnections' });
export const ViewQuarantinePermission = new PermissionDefinition({ name: 'ViewQuarantine' });
export const EditQuarantinePermission = new PermissionDefinition({ name: 'EditQuarantine' });
export const ReplayRecordPermission = new PermissionDefinition({ name: 'ReplayRecord' });
export const PublishDataHubPipelinePermission = new PermissionDefinition({ name: 'PublishDataHubPipeline' });
export const ReviewDataHubPipelinePermission = new PermissionDefinition({ name: 'ReviewDataHubPipeline' });
export const UpdateDataHubSettingsPermission = new PermissionDefinition({ name: 'UpdateDataHubSettings' });

// Definitions list for config.authOptions.customPermissions
export const DATAHUB_PERMISSION_DEFINITIONS = [
    DataHubPipelinePermission,
    DataHubSecretPermission,
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
    RetryDataHubRecordPermission,
    ManageDataHubAdaptersPermission,
    ManageDataHubConnectionsPermission,
    ViewQuarantinePermission,
    EditQuarantinePermission,
    ReplayRecordPermission,
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
    UpdateDataHubSettingsPermission,
];
