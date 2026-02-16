export const DATAHUB_PERMISSIONS = {
    // Pipeline CRUD permissions
    CREATE_PIPELINE: 'CreateDataHubPipeline',
    READ_PIPELINE: 'ReadDataHubPipeline',
    UPDATE_PIPELINE: 'UpdateDataHubPipeline',
    DELETE_PIPELINE: 'DeleteDataHubPipeline',

    // Secret CRUD permissions
    CREATE_SECRET: 'CreateDataHubSecret',
    READ_SECRET: 'ReadDataHubSecret',
    UPDATE_SECRET: 'UpdateDataHubSecret',
    DELETE_SECRET: 'DeleteDataHubSecret',

    // Pipeline execution permissions
    RUN_PIPELINE: 'RunDataHubPipeline',
    VIEW_RUNS: 'ViewDataHubRuns',
    PUBLISH_PIPELINE: 'PublishDataHubPipeline',
    REVIEW_PIPELINE: 'ReviewDataHubPipeline',

    // Configuration management permissions
    MANAGE_ADAPTERS: 'ManageDataHubAdapters',
    MANAGE_CONNECTIONS: 'ManageDataHubConnections',
    UPDATE_SETTINGS: 'UpdateDataHubSettings',

    // Quarantine/error handling permissions (using consistent naming)
    VIEW_QUARANTINE: 'ViewDataHubQuarantine',
    EDIT_QUARANTINE: 'EditDataHubQuarantine',
    REPLAY_RECORD: 'ReplayDataHubRecord',

    // Analytics and monitoring permissions
    VIEW_ANALYTICS: 'ViewDataHubAnalytics',
    MANAGE_WEBHOOKS: 'ManageDataHubWebhooks',
    MANAGE_DESTINATIONS: 'ManageDataHubDestinations',
    MANAGE_FEEDS: 'ManageDataHubFeeds',
    VIEW_ENTITY_SCHEMAS: 'ViewDataHubEntitySchemas',
    SUBSCRIBE_EVENTS: 'SubscribeDataHubEvents',

    // File management permissions
    MANAGE_FILES: 'ManageDataHubFiles',
    READ_FILES: 'ReadDataHubFiles',
} as const;
