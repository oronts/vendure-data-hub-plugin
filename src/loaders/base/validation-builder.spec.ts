import { describe, expect, it } from 'vitest';
import { ValidationBuilder } from './validation-builder';

describe('ValidationBuilder numeric fields', () => {
    it.each([0, 1.5, '0', ' 1.5 '])('accepts finite non-negative value %s', value => {
        expect(new ValidationBuilder()
            .requirePositiveNumber('quantity', value)
            .build().valid).toBe(true);
    });

    it.each([
        '',
        ' ',
        'not-a-number',
        'Infinity',
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        -1,
    ])('rejects invalid numeric value %s', value => {
        const result = new ValidationBuilder()
            .requirePositiveNumber('quantity', value)
            .build();

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({ field: 'quantity', code: 'INVALID_VALUE' }),
        ]);
    });
});
