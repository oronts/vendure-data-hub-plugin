/**
 * Performance Helpers
 *
 * Helper functions for calculating pipeline performance metrics.
 */

import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { RunStatus } from '../../types/index';
import { PipelinePerformance } from './analytics.types';
import {
    percentile,
    calculateSuccessRate,
    calculateAverage,
    extractRunMetrics,
} from './metrics.helpers';

/**
 * Aggregated pipeline metrics result
 */
export interface AggregatedPipelineMetrics {
    durations: number[];
    totalRecordsProcessed: number;
    totalRecordsFailed: number;
    successfulRuns: number;
}

/**
 * Performance trends (percentiles) result
 */
export interface PerformanceTrends {
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
}

/**
 * Aggregate metrics for pipeline runs
 */
export function aggregatePipelineMetrics(runs: PipelineRun[]): AggregatedPipelineMetrics {
    const durations: number[] = [];
    let totalRecordsProcessed = 0;
    let totalRecordsFailed = 0;
    let successfulRuns = 0;

    for (const run of runs) {
        const metrics = extractRunMetrics(run.metrics);
        if (metrics.durationMs) {
            durations.push(metrics.durationMs);
        }
        totalRecordsProcessed += metrics.recordsProcessed;
        totalRecordsFailed += metrics.recordsFailed;
        if (run.status === RunStatus.COMPLETED) {
            successfulRuns++;
        }
    }

    return { durations, totalRecordsProcessed, totalRecordsFailed, successfulRuns };
}

/**
 * Calculate performance trends (percentiles) from durations
 */
export function calculatePerformanceTrends(durations: number[]): PerformanceTrends {
    // Sort durations for percentile calculations
    const sortedDurations = [...durations].sort((a, b) => a - b);
    return {
        avgDurationMs: calculateAverage(sortedDurations),
        p50DurationMs: percentile(sortedDurations, 50),
        p95DurationMs: percentile(sortedDurations, 95),
        p99DurationMs: percentile(sortedDurations, 99),
    };
}

/**
 * Build a performance report for a single pipeline
 */
export function buildPerformanceReport(
    pipeline: Pipeline,
    runs: PipelineRun[],
    aggregatedMetrics: AggregatedPipelineMetrics,
): PipelinePerformance {
    const trends = calculatePerformanceTrends(aggregatedMetrics.durations);
    return {
        pipelineId: pipeline.id.toString(),
        pipelineCode: pipeline.code,
        pipelineName: pipeline.name,
        totalRuns: runs.length,
        successfulRuns: aggregatedMetrics.successfulRuns,
        failedRuns: runs.length - aggregatedMetrics.successfulRuns,
        successRate: calculateSuccessRate(aggregatedMetrics.successfulRuns, runs.length),
        avgDurationMs: trends.avgDurationMs,
        p50DurationMs: trends.p50DurationMs,
        p95DurationMs: trends.p95DurationMs,
        p99DurationMs: trends.p99DurationMs,
        totalRecordsProcessed: aggregatedMetrics.totalRecordsProcessed,
        totalRecordsFailed: aggregatedMetrics.totalRecordsFailed,
        lastRunAt: runs[0]?.createdAt,
        lastRunStatus: runs[0]?.status,
    };
}
