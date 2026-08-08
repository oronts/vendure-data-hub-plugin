import { describe, expect, it } from 'vitest';
import {
    formatDate,
    isValidIsoDateString,
    parseDateWithFormat,
} from './date-format.utils';
import { TRANSFORM_LIMITS } from '../constants/defaults/core-defaults';

describe('date format utilities', () => {
    it('parses exact token formats in UTC', () => {
        expect(parseDateWithFormat(
            '31.12.2024 23:59:58',
            'DD.MM.YYYY HH:mm:ss',
        )?.toISOString()).toBe('2024-12-31T23:59:58.000Z');
    });

    it('rejects mismatches, repeated tokens, and impossible values', () => {
        expect(parseDateWithFormat('2024-02-31', 'YYYY-MM-DD')).toBeNull();
        expect(parseDateWithFormat('2024/02/29', 'YYYY-MM-DD')).toBeNull();
        expect(parseDateWithFormat('2024-2024', 'YYYY-YYYY')).toBeNull();
        expect(parseDateWithFormat('24:00:00', 'HH:mm:ss')).toBeNull();
        expect(parseDateWithFormat(
            '2024-01-01',
            'Y'.repeat(TRANSFORM_LIMITS.MAX_DATE_FORMAT_LENGTH + 1),
        )).toBeNull();
    });

    it('validates the calendar portion of ISO date strings', () => {
        expect(isValidIsoDateString('2024-02-29')).toBe(true);
        expect(isValidIsoDateString('2024-02-29T12:30:00+01:00')).toBe(true);
        expect(isValidIsoDateString('2024-02-31')).toBe(false);
        expect(isValidIsoDateString('2024-01-01not-a-date')).toBe(false);
    });

    it('formats dates with the canonical UTC tokens', () => {
        expect(formatDate(
            new Date('2024-06-01T05:04:03.000Z'),
            'DD/MM/YYYY HH:mm:ss',
        )).toBe('01/06/2024 05:04:03');
        const earlyYear = new Date(0);
        earlyYear.setUTCFullYear(1, 0, 2);
        expect(formatDate(earlyYear, 'YYYY-MM-DD')).toBe('0001-01-02');
    });

    it('rejects invalid dates and unsupported output formats', () => {
        const date = new Date('2024-01-01T00:00:00.000Z');
        expect(() => formatDate(new Date(Number.NaN), 'YYYY-MM-DD'))
            .toThrow('Cannot format an invalid date');
        expect(() => formatDate(date, '')).toThrow('Date format must contain');
        expect(() => formatDate(
            date,
            'Y'.repeat(TRANSFORM_LIMITS.MAX_DATE_FORMAT_LENGTH + 1),
        )).toThrow('Date format must contain');
    });
});
