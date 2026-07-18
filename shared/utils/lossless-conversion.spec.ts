import { describe, expect, it } from 'vitest';
import { mergeEditedValue, valuesEqual } from './lossless-conversion';

describe('lossless conversion helpers', () => {
    it('preserves omitted fields but deletes fields explicitly set to undefined', () => {
        const source = { visible: 1, preserved: 2, removed: 3 };
        const baseline = { visible: 1, removed: 3 };

        expect(
            mergeEditedValue(source, baseline, {
                visible: 4,
                removed: undefined,
            }),
        ).toEqual({ visible: 4, preserved: 2 });
    });

    it('does not collide with ordinary objects that resemble identity markers', () => {
        expect(valuesEqual(undefined, { type: 'undefined' })).toBe(false);
        expect(valuesEqual(Number.NaN, { type: 'number', value: 'NaN' })).toBe(false);
    });
});
