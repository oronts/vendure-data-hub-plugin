/**
 * Time Series Helpers
 *
 * Utilities for calculating time series data and date ranges.
 */

import { TIME } from '../../constants/index';
import { TimeRange, TimeSeriesPoint, ThroughputDataPoint } from './analytics.types';

/**
 * Get start date based on time range
 */
export function getStartDate(timeRange: TimeRange): Date {
    const now = new Date();
    switch (timeRange) {
        case '1h':
            return new Date(now.getTime() - TIME.ONE_HOUR_MS);
        case '24h':
            return new Date(now.getTime() - TIME.ONE_DAY_MS);
        case '7d':
            return new Date(now.getTime() - TIME.SEVEN_DAYS_MS);
        case '30d':
            return new Date(now.getTime() - TIME.THIRTY_DAYS_MS);
        case '90d':
            return new Date(now.getTime() - TIME.NINETY_DAYS_MS);
        default:
            return new Date(now.getTime() - TIME.SEVEN_DAYS_MS);
    }
}

/**
 * Get bucket size in milliseconds based on time range
 */
export function getBucketSizeMs(timeRange: TimeRange): number {
    switch (timeRange) {
        case '1h':
            return TIME.FIVE_MINUTES_MS;
        case '24h':
            return TIME.ONE_HOUR_MS;
        case '7d':
            return TIME.SIX_HOURS_MS;
        default:
            return TIME.ONE_DAY_MS;
    }
}

/**
 * Calculate time series from timestamps
 */
export function calculateTimeSeries(timestamps: Date[], timeRange: TimeRange): TimeSeriesPoint[] {
    const startDate = getStartDate(timeRange);
    const now = new Date();
    const bucketMs = getBucketSizeMs(timeRange);

    const buckets: Map<number, number> = new Map();

    // Initialize buckets
    for (let t = startDate.getTime(); t <= now.getTime(); t += bucketMs) {
        buckets.set(t, 0);
    }

    // Count into buckets
    for (const ts of timestamps) {
        const bucketTime = Math.floor(ts.getTime() / bucketMs) * bucketMs;
        if (buckets.has(bucketTime)) {
            buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
        }
    }

    return Array.from(buckets.entries())
        .map(([timestamp, value]) => ({ timestamp: new Date(timestamp), value }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Calculate throughput time series from data points
 */
export function calculateThroughputTimeSeries(
    points: ThroughputDataPoint[],
    timeRange: TimeRange,
): TimeSeriesPoint[] {
    const startDate = getStartDate(timeRange);
    const now = new Date();

    let bucketMs: number;
    switch (timeRange) {
        case '1h':
            bucketMs = TIME.FIVE_MINUTES_MS;
            break;
        case '24h':
            bucketMs = TIME.ONE_HOUR_MS;
            break;
        default:
            bucketMs = TIME.SIX_HOURS_MS;
    }

    const buckets: Map<number, { records: number; durationMs: number }> = new Map();

    // Initialize buckets
    for (let t = startDate.getTime(); t <= now.getTime(); t += bucketMs) {
        buckets.set(t, { records: 0, durationMs: 0 });
    }

    // Aggregate into buckets
    for (const point of points) {
        const bucketTime = Math.floor(point.timestamp.getTime() / bucketMs) * bucketMs;
        const bucket = buckets.get(bucketTime);
        if (bucket) {
            bucket.records += point.records;
            bucket.durationMs += point.durationMs;
        }
    }

    return Array.from(buckets.entries())
        .map(([timestamp, data]) => ({
            timestamp: new Date(timestamp),
            value: data.durationMs > 0 ? Math.round((data.records / (data.durationMs / 1000)) * 100) / 100 : 0,
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
