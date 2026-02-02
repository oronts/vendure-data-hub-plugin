export const analyticsSchema = `
    """
    Analytics API - Comprehensive stats and metrics
    """
    type DataHubAnalyticsOverview {
        totalPipelines: Int!
        activePipelines: Int!
        totalJobs: Int!
        activeJobs: Int!
        runsToday: Int!
        runsThisWeek: Int!
        successRateToday: Float!
        successRateWeek: Float!
        recordsProcessedToday: Int!
        recordsFailedToday: Int!
        avgDurationMsToday: Float!
    }

    type DataHubPipelinePerformance {
        pipelineCode: String!
        pipelineName: String!
        runCount: Int!
        successCount: Int!
        failureCount: Int!
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
        peakRecordsPerSecond: Float!
        avgBatchSize: Float!
        timeSeries: [DataHubTimeSeries!]!
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
        dataHubPipelinePerformance(pipelineCode: String, fromDate: DateTime, toDate: DateTime, limit: Int): [DataHubPipelinePerformance!]!
        dataHubErrorAnalytics(pipelineCode: String, fromDate: DateTime, toDate: DateTime): DataHubErrorAnalytics!
        dataHubThroughputMetrics(pipelineCode: String, intervalMinutes: Int, periods: Int): DataHubThroughputMetrics!
        dataHubRealTimeStats: DataHubRealTimeStats!
    }
`;
