import { describe, expect, it } from 'vitest';
import { validateCronExpression } from '../../../shared/utils/validation';
import { cronMatches, getNextCronOccurrence } from './cron-processor';

describe('cron processor', () => {
    it('uses Sunday 0 and 7 equivalently', () => {
        const sunday = new Date('2026-07-05T12:00:00.000Z');

        expect(validateCronExpression('0 12 * * 7').valid).toBe(true);
        expect(cronMatches(sunday, '0 12 * * 0', 'UTC')).toBe(true);
        expect(cronMatches(sunday, '0 12 * * 7', 'UTC')).toBe(true);
    });

    it('uses standard OR semantics for restricted day fields', () => {
        const sunday = new Date('2026-07-05T12:00:00.000Z');
        const twentieth = new Date('2026-07-20T12:00:00.000Z');

        expect(cronMatches(sunday, '0 12 20 * 0', 'UTC')).toBe(true);
        expect(cronMatches(twentieth, '0 12 20 * 0', 'UTC')).toBe(true);
    });

    it('matches in the configured IANA timezone', () => {
        const noonInBerlin = new Date('2026-07-15T10:00:00.000Z');

        expect(cronMatches(noonInBerlin, '0 12 * * *', 'Europe/Berlin')).toBe(true);
        expect(cronMatches(noonInBerlin, '0 12 * * *', 'UTC')).toBe(false);
    });

    it('returns the standards-compliant next occurrence', () => {
        const next = getNextCronOccurrence(
            '0 12 20 * 0',
            new Date('2026-07-01T00:00:00.000Z'),
            undefined,
            'UTC',
        );

        expect(next?.toISOString()).toBe('2026-07-05T12:00:00.000Z');
    });

    it('rejects non-five-field and invalid expressions', () => {
        expect(validateCronExpression('0 0 * * * *').valid).toBe(false);
        expect(validateCronExpression('70 * * * *').valid).toBe(false);
        expect(cronMatches(new Date(), '70 * * * *', 'UTC')).toBe(false);
    });
});
