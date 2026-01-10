/**
 * DataHub Logger Metrics
 *
 * In-memory metrics implementation for counters and histograms.
 * These can be replaced with OpenTelemetry-compatible implementations later.
 */

import { Counter, Histogram } from './logger.types';

/**
 * In-memory counter implementation
 */
export class InMemoryCounter implements Counter {
    private values = new Map<string, number>();

    constructor(
        public readonly name: string,
        public readonly description?: string,
    ) {}

    private getKey(labels?: Record<string, string>): string {
        if (!labels || Object.keys(labels).length === 0) return '__default__';
        return Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
    }

    increment(value = 1, labels?: Record<string, string>): void {
        const key = this.getKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + value);
    }

    getValue(labels?: Record<string, string>): number {
        return this.values.get(this.getKey(labels)) ?? 0;
    }

    reset(): void {
        this.values.clear();
    }
}

/**
 * In-memory histogram implementation for timing distributions
 */
export class InMemoryHistogram implements Histogram {
    private values = new Map<string, number[]>();

    constructor(
        public readonly name: string,
        public readonly description?: string,
        private readonly maxSamples = 1000,
    ) {}

    private getKey(labels?: Record<string, string>): string {
        if (!labels || Object.keys(labels).length === 0) return '__default__';
        return Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
    }

    record(value: number, labels?: Record<string, string>): void {
        const key = this.getKey(labels);
        let arr = this.values.get(key);
        if (!arr) {
            arr = [];
            this.values.set(key, arr);
        }
        arr.push(value);
        // Keep only last N samples to prevent memory growth
        if (arr.length > this.maxSamples) {
            arr.shift();
        }
    }

    getPercentile(percentile: number, labels?: Record<string, string>): number | undefined {
        const arr = this.values.get(this.getKey(labels));
        if (!arr || arr.length === 0) return undefined;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    getCount(labels?: Record<string, string>): number {
        return this.values.get(this.getKey(labels))?.length ?? 0;
    }

    getSum(labels?: Record<string, string>): number {
        const arr = this.values.get(this.getKey(labels));
        if (!arr) return 0;
        return arr.reduce((sum, v) => sum + v, 0);
    }

    getMean(labels?: Record<string, string>): number | undefined {
        const count = this.getCount(labels);
        if (count === 0) return undefined;
        return this.getSum(labels) / count;
    }

    reset(): void {
        this.values.clear();
    }
}

/**
 * MetricsRegistry - Central registry for all metrics
 */
export class MetricsRegistry {
    private counters = new Map<string, InMemoryCounter>();
    private histograms = new Map<string, InMemoryHistogram>();

    /**
     * Get or create a counter
     */
    getCounter(name: string, description?: string): Counter {
        let counter = this.counters.get(name);
        if (!counter) {
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
                value: c.getValue(),
            })),
            histograms: Array.from(this.histograms.values()).map(h => ({
                name: h.name,
                count: h.getCount(),
                sum: h.getSum(),
                p50: h.getPercentile(50),
                p95: h.getPercentile(95),
                p99: h.getPercentile(99),
            })),
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
