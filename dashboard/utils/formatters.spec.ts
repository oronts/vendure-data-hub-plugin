import { describe, expect, it } from 'vitest';
import { formatSmartDateTime } from './formatters';

describe('formatSmartDateTime', () => {
    it('uses the requested locale for non-today dates', () => {
        const value = new Date('2025-01-02T15:04:00.000Z');
        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        };

        expect(formatSmartDateTime(value, 'de-DE')).toBe(
            value.toLocaleString('de-DE', options),
        );
        expect(formatSmartDateTime(value, 'en-US')).toBe(
            value.toLocaleString('en-US', options),
        );
    });
});
