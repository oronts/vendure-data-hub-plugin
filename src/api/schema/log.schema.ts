export const logSchema = `
    """
    Logs & Telemetry API
    """
    enum DataHubLogLevel {
        DEBUG
        INFO
        WARN
        ERROR
    }

    type DataHubLog implements Node {
        id: ID!
        createdAt: DateTime!
        level: DataHubLogLevel!
        message: String!
        stepKey: String
        context: JSON
        metadata: JSON
        pipeline: DataHubPipeline
        pipelineId: ID
        run: DataHubPipelineRun
        runId: ID
        durationMs: Int
        recordsProcessed: Int
        recordsFailed: Int
    }

    type DataHubLogList implements PaginatedList {
        items: [DataHubLog!]!
        totalItems: Int!
    }

    type DataHubLogStats {
        total: Int!
        byLevel: DataHubLogLevelCounts!
        errorsToday: Int!
        warningsToday: Int!
        avgDurationMs: Int!
    }

    type DataHubLogLevelCounts {
        DEBUG: Int!
        INFO: Int!
        WARN: Int!
        ERROR: Int!
    }

    input DataHubLogListOptions {
        skip: Int
        take: Int
        sort: JSON
        filter: JSON
        filterOperator: LogicalOperator
    }
`;

export const logQueries = `
    extend type Query {
        """
        Query logs with standard Vendure list options (filter, sort, pagination).
        Use the filter parameter with operators like: { pipelineId: { eq: "123" }, level: { eq: "ERROR" } }
        """
        dataHubLogs(options: DataHubLogListOptions): DataHubLogList!
        dataHubRunLogs(runId: ID!): [DataHubLog!]!
        dataHubLogStats(pipelineId: ID): DataHubLogStats!
        dataHubRecentLogs(limit: Int): [DataHubLog!]!
    }
`;
