import { describe, expect, it } from 'vitest';
import { recordsToCsv } from './utils';

describe('recordsToCsv formula handling', () => {
    it('quotes and neutralizes formula-like spreadsheet cells', () => {
        const result = recordsToCsv([
            {
                formula: '=HYPERLINK("https://example.com")',
                signed: '+1',
                command: '@SUM(A1:A2)',
                localized: '＝1+1',
                safe: 'SKU-1',
            },
        ], ',', true, 'SPREADSHEET_SAFE');

        expect(result).toContain('"\t=HYPERLINK(""https://example.com"")"');
        expect(result).toContain('"\t+1"');
        expect(result).toContain('"\t@SUM(A1:A2)"');
        expect(result).toContain('"\t＝1+1"');
        expect(result).toContain(',SKU-1');
    });

    it('preserves formula-like values for machine-to-machine exports', () => {
        expect(recordsToCsv([{ value: '=1+1' }], ',', false, 'PRESERVE'))
            .toBe('=1+1');
    });

    it('keeps existing callers lossless unless they opt into spreadsheet safety', () => {
        expect(recordsToCsv([{ value: '@identifier' }], ',', false))
            .toBe('@identifier');
    });
});
