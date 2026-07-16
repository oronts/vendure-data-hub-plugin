import { describe, expect, it } from 'vitest';
import { ConfigService } from '@vendure/core';
import {
    majorToMinorUnits,
    minorToMajorUnits,
    resolveMoneyPrecision,
} from './money.utils';

function configWithPrecision(precision: number | undefined): ConfigService {
    return {
        entityOptions: {
            moneyStrategy: { precision },
        },
    } as ConfigService;
}

describe('money utilities', () => {
    it('converts major units exactly once using the configured precision', () => {
        expect(majorToMinorUnits(12.34, 2)).toBe(1234);
        expect(majorToMinorUnits('12.34', 3)).toBe(12340);
        expect(minorToMajorUnits(12340, 3)).toBe(12.34);
    });

    it('reads Vendure MoneyStrategy precision and defaults to two decimals', () => {
        expect(resolveMoneyPrecision(configWithPrecision(3))).toBe(3);
        expect(resolveMoneyPrecision(configWithPrecision(undefined))).toBe(2);
    });

    it.each([
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1,
        '',
        true,
        null,
    ])('rejects invalid major-unit input %s', value => {
        expect(() => majorToMinorUnits(value, 2)).toThrow();
    });

    it('rejects amounts that cannot be represented as safe Vendure integers', () => {
        expect(() => majorToMinorUnits(Number.MAX_SAFE_INTEGER, 2)).toThrow(
            'Price exceeds the supported safe integer range',
        );
    });

    it.each([-1, 1.5, 13])('rejects unsupported precision %s', precision => {
        expect(() => majorToMinorUnits(1, precision)).toThrow(
            'Money precision must be an integer between 0 and 12',
        );
    });
});
