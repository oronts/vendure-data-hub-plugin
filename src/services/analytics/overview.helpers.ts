/**
 * Overview Helpers
 *
 * Helper functions for calculating analytics overview metrics.
 */

import { RunStatus, PipelineMetrics } from '../../types/index';
import { AnalyticsOverview } from './analytics.types';
import {
    calculateSuccessRate,
    calculateAverage,
    extractRunMetrics,
} from './metrics.helpers';

/**
 * Run statistics aggregation result
 */
export interface RunStatsResult {
    recordsProcessedToday: number;
    recordsFailedToday: number;
    successfulRunsToday: number;
    successfulRunsWeek: number;
    durations: number[];
}

/**
 * Success rates result
 */
export interface SuccessRatesResult {
    successRateToday: number;
    successRateWeek: number;
}

/**
 * Overview metrics parameters
 */
export interface OverviewMetricsParams {
    totalPipelines: number;
    activePipelines: number;
    runsToday: number;
    runsThisWeek: number;
    activeJobs: number;
    recordsProcessedToday: number;
    recordsFailedToday: number;
    successRateToday: number;
    successRateWeek: number;
    durations: number[];
}

/**
 * Aggregate run statistics from pipeline runs
 */
export function aggregateRunStats(
    todayRuns: Array<{ status: RunStatus; metrics: PipelineMetrics | null }>,
    weekRuns: Array<{ status: RunStatus }>,
): RunStatsResult {
    let recordsProcessedToday = 0;
    let recordsFailedToday = 0;
    let successfulRunsToday = 0;
    let successfulRunsWeek = 0;
    const durations: number[] = [];

    for (const run of todayRuns) {
        const metrics = extractRunMetrics(run.metrics);
        recordsProcessedToday += metrics.recordsProcessed;
        recordsFailedToday += metrics.recordsFailed;
        if (metrics.durationMs) {
            durations.push(metrics.durationMs);
        }
        if (run.status === RunStatus.COMPLETED) {
            successfulRunsToday++;
        }
    }

    for (const run of weekRuns) {
        if (run.status === RunStatus.COMPLETED) {
            successfulRunsWeek++;
        }
    }

    return {
        recordsProcessedToday,
        recordsFailedToday,
        successfulRunsToday,
        successfulRunsWeek,
        durations,
    };
}

/**
 * Calculate success rates for today and this week
 */
export function calculateSuccessRates(
    successfulRunsToday: number,
    totalRunsToday: number,
    successfulRunsWeek: number,
    totalRunsWeek: number,
): SuccessRatesResult {
    return {
        successRateToday: calculateSuccessRate(successfulRunsToday, totalRunsToday),
        successRateWeek: calculateSuccessRate(successfulRunsWeek, totalRunsWeek),
    };
}

/**
 * Build the final overview metrics object
 */
export function buildOverviewMetrics(params: OverviewMetricsParams): AnalyticsOverview {
    return {
        totalPipelines: params.totalPipelines,
        activePipelines: params.activePipelines,
        totalJobs: params.runsToday,
        activeJobs: params.activeJobs,
        runsToday: params.runsToday,
        runsThisWeek: params.runsThisWeek,
        successRateToday: params.successRateToday,
        successRateWeek: params.successRateWeek,
        recordsProcessedToday: params.recordsProcessedToday,
        recordsFailedToday: params.recordsFailedToday,
        avgDurationMsToday: calculateAverage(params.durations),
    };
}
