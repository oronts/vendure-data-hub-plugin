import { describe, expect, it } from 'vitest';
import { resolveBoundedLimit } from './pagination.utils';

describe('extractor pagination utilities', () => {
    it.each([
        [Number.NaN, 10],
        [Number.POSITIVE_INFINITY, 10],
        [-5, 1],
        [4.9, 4],
        [2_000, 1_000],
    ])('normalizes limit %s to %s', (value, expected) => {
        expect(resolveBoundedLimit(value, 10, 1_000)).toBe(expected);
    });
});
