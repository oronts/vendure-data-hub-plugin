export const queueSchema = `
    type DataHubQueueStats {
        pending: Int!
        running: Int!
        failed: Int!
        completedToday: Int!
        byPipeline: [DataHubQueueByPipeline!]!
        recentFailed: [DataHubRecentFailedRun!]!
    }

    type DataHubQueueByPipeline {
        code: String!
        pending: Int!
        running: Int!
    }

    type DataHubRecentFailedRun {
        id: ID!
        code: String!
        finishedAt: DateTime
        error: String
    }

    type DataHubEvent {
        name: String!
        createdAt: DateTime!
        payload: JSON
    }

    """
    Message consumer status for queue-triggered pipelines
    """
    type DataHubConsumerStatus {
        pipelineCode: String!
        queueName: String!
        isActive: Boolean!
        messagesProcessed: Int!
        messagesFailed: Int!
        lastMessageAt: DateTime
    }

    """
    Log persistence levels - controls what gets saved to database for the dashboard.
    Higher levels include all events from lower levels.
    """
    enum LogPersistenceLevel {
        "Only errors are persisted to database"
        ERROR_ONLY
        "Pipeline start/complete/fail + errors (default)"
        PIPELINE
        "All pipeline events + step start/complete events"
        STEP
        "All events including debug-level information"
        DEBUG
    }

    type DataHubSettings {
        retentionDaysRuns: Int
        retentionDaysErrors: Int
        retentionDaysLogs: Int
        "Controls what level of logs are persisted to the database"
        logPersistenceLevel: LogPersistenceLevel!
    }

    input DataHubSettingsInput {
        retentionDaysRuns: Int
        retentionDaysErrors: Int
        retentionDaysLogs: Int
        "Controls what level of logs are persisted to the database"
        logPersistenceLevel: LogPersistenceLevel
    }
`;

export const queueQueries = `
    extend type Query {
        dataHubQueueStats: DataHubQueueStats!
        dataHubEvents(limit: Int): [DataHubEvent!]!
        dataHubSettings: DataHubSettings!
        dataHubConsumers: [DataHubConsumerStatus!]!
    }
`;

export const queueMutations = `
    extend type Mutation {
        updateDataHubSettings(input: DataHubSettingsInput!): DataHubSettings!
        startDataHubConsumer(pipelineCode: String!): Boolean!
        stopDataHubConsumer(pipelineCode: String!): Boolean!
    }
`;
