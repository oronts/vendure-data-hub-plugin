import { describe, expect, it } from 'vitest';
import { StepType } from '../../types';
import { reconcileCompletionOutcomes } from './outcome-metrics';

function createMetrics(
    overrides: Partial<Parameters<typeof reconcileCompletionOutcomes>[0]> = {},
) {
    return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        details: [],
        ...overrides,
    };
}

describe('completion outcome reconciliation', () => {
    it('classifies extraction and validation rejections exactly once', () => {
        const metrics = createMetrics({
            processed: 3,
            failed: 3,
            details: [
                { type: StepType.EXTRACT, out: 8, failed: 2 },
                { type: StepType.VALIDATE, out: 7 },
            ],
        });

        reconcileCompletionOutcomes(metrics);

        expect(metrics).toMatchObject({
            processed: 10,
            succeeded: 7,
            failed: 3,
            skipped: 0,
        });
    });

    it('classifies seeded records when execution bypasses extraction', () => {
        const metrics = createMetrics({
            details: [
                { type: StepType.TRIGGER, seeded: true },
                { type: StepType.TRANSFORM, out: 2 },
            ],
        });

        reconcileCompletionOutcomes(metrics, 2);

        expect(metrics).toMatchObject({ processed: 2, succeeded: 2 });
    });

    it.each([
        StepType.LOAD,
        StepType.EXPORT,
        StepType.FEED,
        StepType.SINK,
    ])('preserves authoritative %s outcomes', type => {
        const metrics = createMetrics({
            processed: 5,
            succeeded: 3,
            failed: 1,
            skipped: 1,
            details: [
                { type: StepType.EXTRACT, out: 5, failed: 0 },
                { type, ok: 3, fail: 1, skipped: 1 },
            ],
        });

        reconcileCompletionOutcomes(metrics);

        expect(metrics).toMatchObject({
            processed: 5,
            succeeded: 3,
            failed: 1,
            skipped: 1,
        });
    });

    it.each([{ paused: true }, { cancelled: true }])(
        'preserves partial metrics for $paused$cancelled execution',
        state => {
            const metrics = createMetrics({
                ...state,
                details: [{ type: StepType.EXTRACT, out: 5, failed: 0 }],
            });

            reconcileCompletionOutcomes(metrics);

            expect(metrics).toMatchObject({ processed: 0, succeeded: 0 });
        },
    );

    it('keeps an empty source at zero', () => {
        const metrics = createMetrics({
            details: [{ type: StepType.EXTRACT, out: 0, failed: 0 }],
        });

        reconcileCompletionOutcomes(metrics);

        expect(metrics).toMatchObject({ processed: 0, succeeded: 0 });
    });
});
