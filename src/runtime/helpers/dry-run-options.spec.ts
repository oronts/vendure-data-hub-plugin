import { describe, expect, it } from 'vitest';
import { SANDBOX } from '../../constants';
import { normalizeDryRunRecordLimit } from './dry-run-options';

describe('normalizeDryRunRecordLimit', () => {
    it('uses the bounded default', () => {
        expect(normalizeDryRunRecordLimit()).toBe(SANDBOX.MAX_RECORDS);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101])(
        'rejects an unsafe record limit: %s',
        value => {
            expect(() => normalizeDryRunRecordLimit(value)).toThrow(
                'recordLimit must be an integer from 1 to 100',
            );
        },
    );
});
