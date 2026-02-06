/**
 * Metrics Helpers
 *
 * Utilities for calculating analytics metrics.
 */

import { TRUNCATION } from '../../constants/index';

/**
 * Calculate percentile from sorted values
 */
export function percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

/**
 * Normalize error message for grouping
 * Removes unique identifiers to group similar errors together
 */
export function normalizeErrorMessage(message: string): string {
    return message
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'ID') // UUIDs
        .replace(/\b\d{10,}\b/g, 'ID') // Long numbers
        .replace(/"[^"]*"/g, '"..."') // Quoted strings
        .slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH);
}

/**
 * Calculate success rate as percentage
 */
export function calculateSuccessRate(successful: number, total: number): number {
    if (total === 0) return 100;
    return Math.round((successful / total) * 10000) / 100;
}

/**
 * Calculate average from array of numbers
 */
export function calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Pipeline run metrics shape
 */
export interface RunMetrics {
    recordsProcessed?: number;
    recordsFailed?: number;
    durationMs?: number;
    [key: string]: unknown;
}

/**
 * Extract metrics from a pipeline run
 */
export function extractRunMetrics(metrics: RunMetrics | null | undefined): {
    recordsProcessed: number;
    recordsFailed: number;
    durationMs: number;
} {
    return {
        recordsProcessed: metrics?.recordsProcessed ?? 0,
        recordsFailed: metrics?.recordsFailed ?? 0,
        durationMs: metrics?.durationMs ?? 0,
    };
}

/**
 * Calculate throughput metrics
 */
export function calculateThroughputRates(
    totalRecords: number,
    durationHours: number,
): {
    recordsPerSecond: number;
    recordsPerMinute: number;
    recordsPerHour: number;
} {
    const recordsPerHour = durationHours > 0 ? totalRecords / durationHours : 0;
    const recordsPerMinute = recordsPerHour / 60;
    const recordsPerSecond = recordsPerMinute / 60;

    return {
        recordsPerSecond: Math.round(recordsPerSecond * 100) / 100,
        recordsPerMinute: Math.round(recordsPerMinute * 100) / 100,
        recordsPerHour: Math.round(recordsPerHour),
    };
}

/**
 * Group errors by key
 */
export function groupErrorsByKey<T>(
    errors: T[],
    keyExtractor: (error: T) => string,
): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const error of errors) {
        const key = keyExtractor(error);
        grouped[key] = (grouped[key] || 0) + 1;
    }
    return grouped;
}

/**
 * Get top N errors by count
 */
export function getTopErrors(
    errors: Array<{ message: string; createdAt: Date }>,
    limit: number,
): Array<{ message: string; count: number; firstOccurrence: Date; lastOccurrence: Date }> {
    const errorMessages: Map<string, { count: number; firstOccurrence: Date; lastOccurrence: Date }> = new Map();

    for (const error of errors) {
        const normalizedMessage = normalizeErrorMessage(error.message);
        const existing = errorMessages.get(normalizedMessage);
        if (existing) {
            existing.count++;
            if (error.createdAt < existing.firstOccurrence) {
                existing.firstOccurrence = error.createdAt;
            }
            if (error.createdAt > existing.lastOccurrence) {
                existing.lastOccurrence = error.createdAt;
            }
        } else {
            errorMessages.set(normalizedMessage, {
                count: 1,
                firstOccurrence: error.createdAt,
                lastOccurrence: error.createdAt,
            });
        }
    }

    return Array.from(errorMessages.entries())
        .map(([message, data]) => ({ message, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
