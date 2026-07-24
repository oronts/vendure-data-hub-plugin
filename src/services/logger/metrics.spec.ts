import { describe, expect, it } from 'vitest';
import { InMemoryCounter, MetricsRegistry } from './metrics';

describe('MetricsRegistry snapshots', () => {
    it('aggregates counter values across label series', () => {
        const registry = new MetricsRegistry();
        const counter = registry.getCounter('records_total');
        counter.increment(2, { pipeline: 'catalog' });
        counter.increment(3, { pipeline: 'inventory' });

        expect(registry.getSnapshot().counters).toEqual([
            { name: 'records_total', value: 5 },
        ]);
    });

    it('aggregates histogram statistics across label series', () => {
        const registry = new MetricsRegistry();
        const histogram = registry.getHistogram('duration_ms');
        histogram.record(10, { step: 'extract' });
        histogram.record(20, { step: 'load' });
        histogram.record(30, { step: 'load' });

        expect(registry.getSnapshot().histograms).toEqual([{
            name: 'duration_ms',
            count: 3,
            sum: 60,
            p50: 20,
            p95: 30,
            p99: 30,
        }]);
    });

    it('preserves normalized label objects for OTLP series without changing aggregation', () => {
        const registry = new MetricsRegistry();
        const counter = registry.getCounter('records_total');
        counter.increment(2, { status: 'ok', pipeline: 'catalog' });
        counter.increment(3, { pipeline: 'catalog', status: 'error' });
        counter.increment(1, { pipeline: 'a,status=error' });

        expect(registry.getSnapshot().counters).toEqual([
            { name: 'records_total', value: 6 },
        ]);
        expect(registry.getSeriesSnapshot().counters).toEqual([
            {
                name: 'records_total',
                labels: { pipeline: 'catalog', status: 'ok' },
                value: 2,
            },
            {
                name: 'records_total',
                labels: { pipeline: 'catalog', status: 'error' },
                value: 3,
            },
            {
                name: 'records_total',
                labels: { pipeline: 'a,status=error' },
                value: 1,
            },
        ]);
    });

    it('bounds distinct retained label series', () => {
        const counter = new InMemoryCounter('bounded_total', undefined, 1);
        counter.increment(1, { pipeline: 'first' });
        counter.increment(1, { pipeline: 'second' });
        counter.increment(2, { pipeline: 'first' });

        expect(counter.getSeriesSnapshot()).toEqual([
            { labels: { pipeline: 'first' }, value: 3 },
        ]);
    });

    it('bounds dynamic metric names while preserving registered metric instances', () => {
        const registry = new MetricsRegistry(1);
        const retained = registry.getCounter('retained_total');
        retained.increment();
        const discarded = registry.getCounter('dynamic_total');
        discarded.increment(100);
        registry.getHistogram('dynamic_duration_ms').record(50);

        expect(registry.getCounter('retained_total')).toBe(retained);
        retained.increment(2);
        expect(registry.getSnapshot()).toEqual({
            counters: [{ name: 'retained_total', value: 3 }],
            histograms: [],
        });
        expect(registry.getSeriesSnapshot()).toEqual({
            counters: [{ name: 'retained_total', labels: {}, value: 3 }],
            histograms: [],
        });
    });

    it('ignores invalid monotonic counter increments without throwing', () => {
        const registry = new MetricsRegistry();
        const counter = registry.getCounter('valid_total');

        expect(() => {
            counter.increment(-1);
            counter.increment(Number.NaN);
            counter.increment(Number.POSITIVE_INFINITY);
        }).not.toThrow();
        counter.increment(2);

        expect(registry.getSnapshot().counters).toEqual([
            { name: 'valid_total', value: 2 },
        ]);
    });
});
