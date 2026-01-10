/**
 * Analytics Types
 *
 * Type definitions for analytics service components.
 */

/**
 * Time range for analytics queries
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
    timestamp: Date;
    value: number;
}

/**
 * Analytics overview
 */
export interface AnalyticsOverview {
    totalPipelines: number;
    activePipelines: number;
    runsToday: number;
    recordsProcessedToday: number;
    recordsFailedToday: number;
    successRate: number;
    avgDurationMs: number;
}

/**
 * Pipeline performance metrics
 */
export interface PipelinePerformance {
    pipelineId: string;
    pipelineCode: string;
    pipelineName: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    totalRecordsProcessed: number;
    totalRecordsFailed: number;
    lastRunAt?: Date;
    lastRunStatus?: string;
}

/**
 * Error analytics
 */
export interface ErrorAnalytics {
    totalErrors: number;
    errorsByStep: Record<string, number>;
    errorsByPipeline: Record<string, number>;
    topErrors: Array<{
        message: string;
        count: number;
        lastOccurrence: Date;
    }>;
    errorTrend: TimeSeriesPoint[];
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
    recordsPerSecond: number;
    recordsPerMinute: number;
    recordsPerHour: number;
    peakThroughput: number;
    peakThroughputAt: Date;
    throughputTrend: TimeSeriesPoint[];
}

/**
 * Run history item
 */
export interface RunHistoryItem {
    id: string | number;
    pipelineId?: string | number;
    pipelineCode?: string;
    pipelineName?: string;
    status: string;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    durationMs?: number;
    recordsProcessed: number;
    recordsFailed: number;
    error?: string | null;
}

/**
 * Real-time stats
 */
export interface RealTimeStats {
    activeRuns: number;
    queuedRuns: number;
    recentErrors: number;
    recordsLastMinute: number;
}

/**
 * Throughput data point for calculations
 */
export interface ThroughputDataPoint {
    timestamp: Date;
    records: number;
    durationMs: number;
}
