/**
 * DataHub Logger Metrics
 *
 * Bounded in-memory counters and histograms. The optional OTLP exporter reads
 * snapshots from this registry for vendor-neutral telemetry delivery.
 */

import { Counter, Histogram } from './logger.types';
import { METRICS } from '../../constants/defaults/reliability-defaults';

interface CounterSeries {
    labels: Record<string, string>;
    value: number;
}

interface HistogramSeries {
    labels: Record<string, string>;
    values: number[];
    cumulativeCount: number;
    cumulativeSum: number;
}

function normalizeLabels(labels?: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(labels ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    );
}

function getSeriesKey(labels: Record<string, string>): string {
    return JSON.stringify(Object.entries(labels));
}

/**
 * In-memory counter implementation
 */
export class InMemoryCounter implements Counter {
    private series = new Map<string, CounterSeries>();

    constructor(
        public readonly name: string,
        public readonly description?: string,
        private readonly maxSeries: number = METRICS.MAX_SERIES,
    ) {}

    increment(value = 1, labels?: Record<string, string>): void {
        if (!Number.isFinite(value) || value < 0) {
            return;
        }
        const normalizedLabels = normalizeLabels(labels);
        const key = getSeriesKey(normalizedLabels);
        const existing = this.series.get(key);
        if (existing) {
            existing.value += value;
            return;
        }
        if (this.series.size >= this.maxSeries) {
            return;
        }
        this.series.set(key, {
            labels: normalizedLabels,
            value,
        });
    }

    getValue(labels?: Record<string, string>): number {
        const normalizedLabels = normalizeLabels(labels);
        return this.series.get(getSeriesKey(normalizedLabels))?.value ?? 0;
    }

    getTotalValue(): number {
        return Array.from(this.series.values())
            .reduce((total, entry) => total + entry.value, 0);
    }

    getSeriesSnapshot(): CounterSeries[] {
        return Array.from(this.series.values()).map(entry => ({
            labels: { ...entry.labels },
            value: entry.value,
        }));
    }

    reset(): void {
        this.series.clear();
    }
}

/**
 * In-memory histogram implementation for timing distributions
 */
export class InMemoryHistogram implements Histogram {
    private series = new Map<string, HistogramSeries>();

    constructor(
        public readonly name: string,
        public readonly description?: string,
        private readonly maxSamples: number = METRICS.MAX_SAMPLES,
        private readonly maxSeries: number = METRICS.MAX_SERIES,
    ) {}

    record(value: number, labels?: Record<string, string>): void {
        if (!Number.isFinite(value)) {
            return;
        }
        const normalizedLabels = normalizeLabels(labels);
        const key = getSeriesKey(normalizedLabels);
        let entry = this.series.get(key);
        if (!entry) {
            if (this.series.size >= this.maxSeries) {
                return;
            }
            entry = {
                labels: normalizedLabels,
                values: [],
                cumulativeCount: 0,
                cumulativeSum: 0,
            };
            this.series.set(key, entry);
        }
        entry.cumulativeCount += 1;
        entry.cumulativeSum += value;
        entry.values.push(value);
        // Keep only last N samples to prevent memory growth
        if (entry.values.length > this.maxSamples) {
            entry.values.shift();
        }
    }

    getPercentile(percentile: number, labels?: Record<string, string>): number | undefined {
        const normalizedLabels = normalizeLabels(labels);
        const arr = this.series.get(getSeriesKey(normalizedLabels))?.values;
        if (!arr || arr.length === 0) return undefined;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    getCount(labels?: Record<string, string>): number {
        const normalizedLabels = normalizeLabels(labels);
        return this.series.get(getSeriesKey(normalizedLabels))?.values.length ?? 0;
    }

    getSum(labels?: Record<string, string>): number {
        const normalizedLabels = normalizeLabels(labels);
        const arr = this.series.get(getSeriesKey(normalizedLabels))?.values;
        if (!arr) return 0;
        return arr.reduce((sum, v) => sum + v, 0);
    }

    getMean(labels?: Record<string, string>): number | undefined {
        const count = this.getCount(labels);
        if (count === 0) return undefined;
        return this.getSum(labels) / count;
    }

    getAggregatedCount(): number {
        return this.getAllSamples().length;
    }

    getAggregatedSum(): number {
        return this.getAllSamples().reduce((sum, value) => sum + value, 0);
    }

    getAggregatedPercentile(percentile: number): number | undefined {
        const samples = this.getAllSamples();
        if (samples.length === 0) return undefined;
        const sorted = samples.sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    getSeriesSnapshot(): Array<{
        labels: Record<string, string>;
        count: number;
        sum: number;
    }> {
        return Array.from(this.series.values()).map(entry => ({
            labels: { ...entry.labels },
            count: entry.cumulativeCount,
            sum: entry.cumulativeSum,
        }));
    }

    private getAllSamples(): number[] {
        return Array.from(this.series.values()).flatMap(entry => entry.values);
    }

    reset(): void {
        this.series.clear();
    }
}

/**
 * MetricsRegistry - Central registry for all metrics
 */
export class MetricsRegistry {
    private counters = new Map<string, InMemoryCounter>();
    private histograms = new Map<string, InMemoryHistogram>();

    constructor(
        private readonly maxMetrics: number = METRICS.MAX_METRICS,
    ) {}

    /**
     * Get or create a counter
     */
    getCounter(name: string, description?: string): Counter {
        let counter = this.counters.get(name);
        if (!counter) {
            if (this.counters.size + this.histograms.size >= this.maxMetrics) {
                return new InMemoryCounter(name, description, 0);
            }
            counter = new InMemoryCounter(name, description);
            this.counters.set(name, counter);
        }
        return counter;
    }

    /**
     * Get or create a histogram
     */
    getHistogram(name: string, description?: string): Histogram {
        let histogram = this.histograms.get(name);
        if (!histogram) {
            if (this.counters.size + this.histograms.size >= this.maxMetrics) {
                return new InMemoryHistogram(
                    name,
                    description,
                    METRICS.MAX_SAMPLES,
                    0,
                );
            }
            histogram = new InMemoryHistogram(name, description);
            this.histograms.set(name, histogram);
        }
        return histogram;
    }

    /**
     * Get all metrics as a snapshot
     */
    getSnapshot(): {
        counters: Array<{ name: string; value: number }>;
        histograms: Array<{ name: string; count: number; sum: number; p50?: number; p95?: number; p99?: number }>;
    } {
        return {
            counters: Array.from(this.counters.values()).map(c => ({
                name: c.name,
                value: c.getTotalValue(),
            })),
            histograms: Array.from(this.histograms.values()).map(h => ({
                name: h.name,
                count: h.getAggregatedCount(),
                sum: h.getAggregatedSum(),
                p50: h.getAggregatedPercentile(50),
                p95: h.getAggregatedPercentile(95),
                p99: h.getAggregatedPercentile(99),
            })),
        };
    }

    getSeriesSnapshot(): {
        counters: Array<{
            name: string;
            labels: Record<string, string>;
            value: number;
        }>;
        histograms: Array<{
            name: string;
            labels: Record<string, string>;
            count: number;
            sum: number;
        }>;
    } {
        return {
            counters: Array.from(this.counters.values()).flatMap(counter => (
                counter.getSeriesSnapshot().map(series => ({
                    name: counter.name,
                    ...series,
                }))
            )),
            histograms: Array.from(this.histograms.values()).flatMap(histogram => (
                histogram.getSeriesSnapshot().map(series => ({
                    name: histogram.name,
                    ...series,
                }))
            )),
        };
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        for (const counter of this.counters.values()) {
            counter.reset();
        }
        for (const histogram of this.histograms.values()) {
            histogram.reset();
        }
    }
}
