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
    isOutcomeRunStatus,
    isSuccessfulRunStatus,
} from './metrics.helpers';

/**
 * Run statistics aggregation result
 */
interface RunStatsResult {
    recordsProcessedToday: number;
    recordsFailedToday: number;
    successfulRunsToday: number;
    successfulRunsWeek: number;
    outcomeRunsToday: number;
    outcomeRunsWeek: number;
    durations: number[];
}

/**
 * Success rates result
 */
interface SuccessRatesResult {
    successRateToday: number;
    successRateWeek: number;
}

/**
 * Overview metrics parameters
 */
interface OverviewMetricsParams {
    totalPipelines: number;
    enabledPipelines: number;
    runsToday: number;
    runsThisWeek: number;
    recordsProcessedToday: number;
    recordsFailedToday: number;
    successRateToday: number;
    successRateWeek: number;
    durations: number[];
}

export function getStartOfCalendarWeek(date: Date = new Date()): Date {
    const startOfWeek = new Date(date);
    const daysSinceMonday = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
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
    let outcomeRunsToday = 0;
    let outcomeRunsWeek = 0;
    const durations: number[] = [];

    for (const run of todayRuns) {
        const metrics = extractRunMetrics(run.metrics);
        recordsProcessedToday += metrics.recordsProcessed;
        recordsFailedToday += metrics.recordsFailed;
        if (metrics.durationMs) {
            durations.push(metrics.durationMs);
        }
        if (isSuccessfulRunStatus(run.status)) {
            successfulRunsToday++;
        }
        if (isOutcomeRunStatus(run.status)) {
            outcomeRunsToday++;
        }
    }

    for (const run of weekRuns) {
        if (isSuccessfulRunStatus(run.status)) {
            successfulRunsWeek++;
        }
        if (isOutcomeRunStatus(run.status)) {
            outcomeRunsWeek++;
        }
    }

    return {
        recordsProcessedToday,
        recordsFailedToday,
        successfulRunsToday,
        successfulRunsWeek,
        outcomeRunsToday,
        outcomeRunsWeek,
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
        enabledPipelines: params.enabledPipelines,
        runsToday: params.runsToday,
        runsThisWeek: params.runsThisWeek,
        successRateToday: params.successRateToday,
        successRateWeek: params.successRateWeek,
        recordsProcessedToday: params.recordsProcessedToday,
        recordsFailedToday: params.recordsFailedToday,
        avgDurationMsToday: calculateAverage(params.durations),
    };
}
