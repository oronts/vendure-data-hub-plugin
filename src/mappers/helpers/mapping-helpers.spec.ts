import { describe, expect, it } from 'vitest';
import { detectValueType } from './mapping-helpers';

describe('mapping value type detection', () => {
    it('detects valid ISO dates without accepting calendar rollover', () => {
        expect(detectValueType('2024-02-29')).toBe('date');
        expect(detectValueType('2024-02-29T12:00:00Z')).toBe('date');
        expect(detectValueType('2024-02-31')).toBe('string');
        expect(detectValueType('2024-01-01not-a-date')).toBe('string');
    });
});
