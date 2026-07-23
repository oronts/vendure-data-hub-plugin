import { describe, expect, it } from 'vitest';
import { getNestedValue, setNestedValue } from './object-path';

describe('object path utilities', () => {
    it('reads and immutably updates nested values', () => {
        const source = {
            pagination: { type: 'NONE', limit: 20 },
            untouched: { enabled: true },
        };

        const result = setNestedValue(source, 'pagination.type', 'OFFSET');

        expect(getNestedValue(result, 'pagination.type')).toBe('OFFSET');
        expect(source.pagination.type).toBe('NONE');
        expect(result).not.toBe(source);
        expect(result.pagination).not.toBe(source.pagination);
        expect(result.untouched).toBe(source.untouched);
    });

    it('creates missing object branches', () => {
        expect(setNestedValue({}, 'pagination.limit', 50)).toEqual({
            pagination: { limit: 50 },
        });
    });

    it.each([
        '__proto__.polluted',
        'constructor.prototype.polluted',
        'pagination..limit',
        '',
    ])('rejects unsafe path %s', path => {
        expect(() => setNestedValue({}, path, true)).toThrow('Invalid object path');
        expect(getNestedValue({}, path)).toBeUndefined();
    });
});
