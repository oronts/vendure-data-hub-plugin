import { describe, expect, it } from 'vitest';
import { normalizeRunMetrics } from './run-metrics';

describe('normalizeRunMetrics', () => {
    it('normalizes finite counters and preserves extension metrics', () => {
        expect(normalizeRunMetrics({
            processed: 4,
            failed: Number.POSITIVE_INFINITY,
            customRate: 0.75,
            details: [{
                stepKey: 'load-products',
                ok: 3,
                counters: { created: 2, invalid: '1', skipped: Number.NaN },
                connectorLatencyMs: 12,
            }],
        })).toEqual({
            processed: 4,
            succeeded: undefined,
            failed: undefined,
            skipped: undefined,
            sourceRecords: undefined,
            durationMs: undefined,
            customRate: 0.75,
            details: [{
                stepKey: 'load-products',
                type: undefined,
                adapterCode: undefined,
                ok: 3,
                fail: undefined,
                skipped: undefined,
                durationMs: undefined,
                counters: { created: 2 },
                connectorLatencyMs: 12,
            }],
        });
    });

    it('rejects non-object metrics and malformed detail entries', () => {
        expect(normalizeRunMetrics(null)).toBeUndefined();
        expect(normalizeRunMetrics(['not', 'metrics'])).toBeUndefined();
        expect(normalizeRunMetrics({ details: [null, 'invalid', { ok: 1 }] })?.details)
            .toEqual([{
                stepKey: undefined,
                type: undefined,
                adapterCode: undefined,
                ok: 1,
                fail: undefined,
                skipped: undefined,
                durationMs: undefined,
            }]);
    });
});
