import { describe, expect, it } from 'vitest';
import {
    LineageOutcome,
    RecordProcessingState,
    SANDBOX,
} from '../../../constants';
import { DataLineageTracker } from './data-lineage-tracker';

const options = {
    maxRecords: SANDBOX.MAX_RECORDS,
    maxSamplesPerStep: SANDBOX.MAX_SAMPLES_PER_STEP,
    includeLineage: true,
    seedData: [],
    stopOnError: false,
    timeoutMs: SANDBOX.DEFAULT_TIMEOUT_MS,
    skipSteps: [],
    startFromStep: '',
};

describe('DataLineageTracker', () => {
    it('retains the final record ID and derives final outcomes from runtime states', () => {
        const tracker = new DataLineageTracker(options);
        tracker.initialize([
            { sku: 'SKU-1' },
            { sku: 'SKU-2' },
            { sku: 'SKU-3' },
        ]);

        tracker.trackState('transform', 'TRANSFORM', 0, RecordProcessingState.TRANSFORMED, { sku: 'SKU-1-NORMALIZED' });
        tracker.trackState('validate', 'VALIDATE', 1, RecordProcessingState.FILTERED, { sku: 'SKU-2' });
        tracker.trackState('load', 'LOAD', 2, RecordProcessingState.ERROR, { sku: 'SKU-3' });

        expect(tracker.getLineageRecords()).toEqual([
            expect.objectContaining({
                originalRecordId: 'SKU-1',
                finalRecordId: 'SKU-1-NORMALIZED',
                finalOutcome: LineageOutcome.LOADED,
            }),
            expect.objectContaining({
                originalRecordId: 'SKU-2',
                finalRecordId: 'SKU-2',
                finalOutcome: LineageOutcome.FILTERED,
            }),
            expect.objectContaining({
                originalRecordId: 'SKU-3',
                finalRecordId: 'SKU-3',
                finalOutcome: LineageOutcome.ERROR,
            }),
        ]);
    });

    it('distinguishes loader skips from transform filtering', () => {
        const tracker = new DataLineageTracker(options);
        tracker.initialize([{ id: 42 }]);

        tracker.trackState('load', 'LOAD', 0, RecordProcessingState.FILTERED, { id: 42 });
        tracker.setFinalOutcome(0, LineageOutcome.SKIPPED, { id: 42 });

        expect(tracker.getLineageRecords()[0]).toMatchObject({
            finalRecordId: '42',
            finalOutcome: LineageOutcome.SKIPPED,
        });
    });
});
