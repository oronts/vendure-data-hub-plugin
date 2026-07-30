import { describe, expect, it } from 'vitest';
import { parseOrderPlacedAt } from './order-record.validation';

describe('order record validation', () => {
    it('parses a valid placement date', () => {
        expect(parseOrderPlacedAt('2026-07-28T12:30:00Z')?.toISOString()).toBe(
            '2026-07-28T12:30:00.000Z',
        );
    });

    it('rejects an invalid placement date', () => {
        expect(() => parseOrderPlacedAt('not-a-date')).toThrow(
            'Order placement date must be a valid ISO 8601 date',
        );
    });
});
