import { describe, expect, it } from 'vitest';
import { buildRunSummaryMessages, findPausedGateStep } from './run-details-format';

describe('run details formatting', () => {
    it('returns normalized counter descriptors', () => {
        expect(buildRunSummaryMessages({
            sourceRecords: 1,
            processed: '2' as never,
            succeeded: 1,
            skipped: undefined,
            failed: 0,
        })).toEqual([
            { kind: 'SOURCE', count: 1 },
            { kind: 'PROCESSED', count: 2 },
            { kind: 'SUCCEEDED', count: 1 },
            { kind: 'SKIPPED', count: 0 },
            { kind: 'FAILED', count: 0 },
        ]);
    });

    it('finds only a paused gate step', () => {
        expect(findPausedGateStep({
            details: [
                { stepKey: 'extract', type: 'EXTRACT', paused: true },
                { stepKey: 'approval', type: 'GATE', paused: true },
            ],
        })).toBe('approval');
        expect(findPausedGateStep({
            details: [{ stepKey: 'approval', type: 'GATE', paused: false }],
        })).toBeUndefined();
        expect(findPausedGateStep({})).toBeUndefined();
    });
});
