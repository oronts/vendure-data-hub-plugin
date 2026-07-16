import { describe, expect, it } from 'vitest';
import { applyDateAdd, applyDateParse } from './helpers';

describe('date operator helpers', () => {
    it('honors an explicit input format instead of falling back to native parsing', () => {
        const record = { value: '2024-01-02' };

        expect(applyDateParse(record, 'value', 'parsed', 'DD/MM/YYYY')).toEqual(record);
    });

    it('rejects impossible calendar dates', () => {
        const record = { value: '31/02/2024' };

        expect(applyDateParse(record, 'value', 'parsed', 'DD/MM/YYYY')).toEqual(record);
    });

    it('accepts valid leap-day input', () => {
        expect(applyDateParse(
            { value: '29/02/2024' },
            'value',
            'parsed',
            'DD/MM/YYYY',
        )).toEqual({
            value: '29/02/2024',
            parsed: '2024-02-29T00:00:00.000Z',
        });
    });

    it('adds dates in UTC across a daylight-saving boundary', () => {
        const originalTimezone = process.env.TZ;
        process.env.TZ = 'Europe/Berlin';
        try {
            expect(applyDateAdd(
                { value: '2024-03-31T00:30:00.000Z' },
                'value',
                'result',
                1,
                'days',
            )).toEqual({
                value: '2024-03-31T00:30:00.000Z',
                result: '2024-04-01T00:30:00.000Z',
            });
        } finally {
            process.env.TZ = originalTimezone;
        }
    });
});
