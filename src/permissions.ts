import { CrudPermissionDefinition, PermissionDefinition } from '@vendure/core';

export const DataHubPipelinePermission = new CrudPermissionDefinition('DataHubPipeline');
export const DataHubSecretPermission = new CrudPermissionDefinition('DataHubSecret');
export const RunDataHubPipelinePermission = new PermissionDefinition({ name: 'RunDataHubPipeline' });
export const ViewDataHubRunsPermission = new PermissionDefinition({ name: 'ViewDataHubRuns' });
export const RetryDataHubRecordPermission = new PermissionDefinition({ name: 'RetryDataHubRecord' });
export const ManageDataHubAdaptersPermission = new PermissionDefinition({ name: 'ManageDataHubAdapters' });
export const ManageDataHubConnectionsPermission = new PermissionDefinition({ name: 'ManageDataHubConnections' });
export const ViewDataHubQuarantinePermission = new PermissionDefinition({ name: 'ViewDataHubQuarantine' });
export const EditDataHubQuarantinePermission = new PermissionDefinition({ name: 'EditDataHubQuarantine' });
export const ReplayDataHubRecordPermission = new PermissionDefinition({ name: 'ReplayDataHubRecord' });
export const PublishDataHubPipelinePermission = new PermissionDefinition({ name: 'PublishDataHubPipeline' });
export const ReviewDataHubPipelinePermission = new PermissionDefinition({ name: 'ReviewDataHubPipeline' });
export const UpdateDataHubSettingsPermission = new PermissionDefinition({ name: 'UpdateDataHubSettings' });
export const ViewDataHubAnalyticsPermission = new PermissionDefinition({ name: 'ViewDataHubAnalytics' });
export const ManageDataHubWebhooksPermission = new PermissionDefinition({ name: 'ManageDataHubWebhooks' });
export const ManageDataHubDestinationsPermission = new PermissionDefinition({ name: 'ManageDataHubDestinations' });
export const ManageDataHubFeedsPermission = new PermissionDefinition({ name: 'ManageDataHubFeeds' });
export const ViewDataHubEntitySchemasPermission = new PermissionDefinition({ name: 'ViewDataHubEntitySchemas' });
export const SubscribeDataHubEventsPermission = new PermissionDefinition({ name: 'SubscribeDataHubEvents' });
export const ManageDataHubFilesPermission = new PermissionDefinition({ name: 'ManageDataHubFiles' });
export const ReadDataHubFilesPermission = new PermissionDefinition({ name: 'ReadDataHubFiles' });

export const DATAHUB_PERMISSION_DEFINITIONS = [
    DataHubPipelinePermission,
    DataHubSecretPermission,
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
    RetryDataHubRecordPermission,
    ManageDataHubAdaptersPermission,
    ManageDataHubConnectionsPermission,
    ViewDataHubQuarantinePermission,
    EditDataHubQuarantinePermission,
    ReplayDataHubRecordPermission,
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
    UpdateDataHubSettingsPermission,
    ViewDataHubAnalyticsPermission,
    ManageDataHubWebhooksPermission,
    ManageDataHubDestinationsPermission,
    ManageDataHubFeedsPermission,
    ViewDataHubEntitySchemasPermission,
    SubscribeDataHubEventsPermission,
    ManageDataHubFilesPermission,
    ReadDataHubFilesPermission,
];
