export const analyticsSchema = `
    """
    Analytics API - Stats and metrics
    """
    type DataHubAnalyticsOverview {
        totalPipelines: Int!
        activePipelines: Int!
        runsToday: Int!
        runsThisWeek: Int!
        successRateToday: Float!
        successRateWeek: Float!
        recordsProcessedToday: Int!
        recordsFailedToday: Int!
        avgDurationMsToday: Float!
    }

    type DataHubPipelinePerformance {
        pipelineId: ID!
        pipelineCode: String!
        pipelineName: String!
        totalRuns: Int!
        successfulRuns: Int!
        failedRuns: Int!
        successRate: Float!
        avgDurationMs: Float!
        p50DurationMs: Float!
        p95DurationMs: Float!
        p99DurationMs: Float!
        totalRecordsProcessed: Int!
        totalRecordsFailed: Int!
        lastRunAt: DateTime
        lastRunStatus: String
    }

    type DataHubErrorAnalytics {
        totalErrors: Int!
        errorsByStep: [DataHubStepErrorCount!]!
        errorsByPipeline: [DataHubPipelineErrorCount!]!
        topErrors: [DataHubTopError!]!
        errorTrend: [DataHubTimeSeries!]!
    }

    type DataHubStepErrorCount {
        stepKey: String!
        count: Int!
    }

    type DataHubPipelineErrorCount {
        pipelineCode: String!
        count: Int!
    }

    type DataHubTopError {
        message: String!
        count: Int!
        firstOccurrence: DateTime!
        lastOccurrence: DateTime!
    }

    type DataHubTimeSeries {
        timestamp: DateTime!
        value: Float!
    }

    type DataHubThroughputMetrics {
        recordsPerSecond: Float!
        recordsPerMinute: Float!
        recordsPerHour: Float!
        peakThroughput: Float!
        peakThroughputAt: DateTime!
        throughputTrend: [DataHubTimeSeries!]!
    }

    type DataHubRealTimeStats {
        activeRuns: Int!
        queuedRuns: Int!
        recentErrors: Int!
        recordsLastMinute: Int!
    }
`;

export const analyticsQueries = `
    extend type Query {
        dataHubAnalyticsOverview: DataHubAnalyticsOverview!
        dataHubPipelinePerformance(pipelineId: ID, timeRange: String, limit: Int): [DataHubPipelinePerformance!]!
        dataHubErrorAnalytics(pipelineId: ID, timeRange: String): DataHubErrorAnalytics!
        dataHubThroughputMetrics(pipelineId: ID, timeRange: String): DataHubThroughputMetrics!
        dataHubRealTimeStats: DataHubRealTimeStats!
    }
`;
