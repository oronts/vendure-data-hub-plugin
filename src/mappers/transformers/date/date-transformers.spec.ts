import { describe, expect, it } from 'vitest';
import { applyDateTransform } from './date-transformers';

describe('mapper date transforms', () => {
    it('uses the declared input format before formatting output', () => {
        expect(applyDateTransform('31/12/2024', {
            inputFormat: 'DD/MM/YYYY',
            outputFormat: 'YYYY-MM-DD',
        })).toBe('2024-12-31');
    });

    it('does not fall back to native parsing for explicit format mismatches', () => {
        expect(() => applyDateTransform('2024-12-31', {
            inputFormat: 'DD/MM/YYYY',
        })).toThrow('Date value does not match the configured input format');
    });

    it('rejects impossible custom-format values', () => {
        expect(() => applyDateTransform('31/02/2024', {
            inputFormat: 'DD/MM/YYYY',
        })).toThrow('Date value does not match the configured input format');
    });
});
