/**
 * Throughput Helpers
 *
 * Helper functions for calculating throughput metrics.
 */

import { PipelineMetrics } from '../../types/index';
import { TimeRange, ThroughputMetrics, ThroughputDataPoint } from './analytics.types';
import { extractRunMetrics, calculateThroughputRates } from './metrics.helpers';
import { calculateThroughputTimeSeries } from './time-series.helpers';

/**
 * Throughput data calculation result
 */
interface ThroughputDataResult {
    totalRecords: number;
    peakThroughput: number;
    peakThroughputAt: Date;
    throughputPoints: ThroughputDataPoint[];
}

/**
 * Process runs to calculate throughput data points and peak throughput
 */
export function calculateThroughputData(
    runs: Array<{ metrics: PipelineMetrics | null; createdAt: Date }>,
): ThroughputDataResult {
    let totalRecords = 0;
    let peakThroughput = 0;
    let peakThroughputAt = new Date();
    const throughputPoints: ThroughputDataPoint[] = [];

    for (const run of runs) {
        const metrics = extractRunMetrics(run.metrics);
        const records = metrics.recordsProcessed;
        const durationMs = metrics.durationMs || 1;
        totalRecords += records;

        const throughput = records / (durationMs / 1000); // records per second
        if (throughput > peakThroughput) {
            peakThroughput = throughput;
            peakThroughputAt = run.createdAt;
        }

        throughputPoints.push({ timestamp: run.createdAt, records, durationMs });
    }

    return { totalRecords, peakThroughput, peakThroughputAt, throughputPoints };
}

/**
 * Build the final throughput metrics result
 */
export function buildThroughputResult(
    throughputData: ThroughputDataResult,
    durationHours: number,
    timeRange: TimeRange,
): ThroughputMetrics {
    const rates = calculateThroughputRates(throughputData.totalRecords, durationHours);
    const throughputTrend = calculateThroughputTimeSeries(throughputData.throughputPoints, timeRange);

    return {
        recordsPerSecond: rates.recordsPerSecond,
        recordsPerMinute: rates.recordsPerMinute,
        recordsPerHour: rates.recordsPerHour,
        peakThroughput: Math.round(throughputData.peakThroughput * 100) / 100,
        peakThroughputAt: throughputData.peakThroughputAt,
        throughputTrend,
    };
}
