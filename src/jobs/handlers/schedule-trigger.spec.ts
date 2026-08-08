import { describe, expect, it } from 'vitest';
import { TIMER_TYPE } from '../../constants';
import {
    getScheduleOccurrence,
    parseScheduleTriggerConfig,
} from './schedule-trigger';

describe('schedule trigger contracts', () => {
    it('normalizes only schedule trigger configuration', () => {
        expect(parseScheduleTriggerConfig({
            type: 'SCHEDULE',
            cron: '0 * * * *',
            intervalSec: 30,
            timezone: 'Europe/Berlin',
        })).toEqual({
            type: 'SCHEDULE',
            cron: '0 * * * *',
            intervalSec: 30,
            timezone: 'Europe/Berlin',
        });
        expect(parseScheduleTriggerConfig({ type: 'EVENT' })).toBeNull();
    });

    it('claims interval occurrences until their exact bucket boundary', () => {
        expect(getScheduleOccurrence(TIMER_TYPE.INTERVAL, 2_250, 1_000)).toEqual({
            key: 'interval:2',
            leaseTtlMs: 750,
        });
    });

    it('rejects invalid interval occurrence durations', () => {
        expect(() => getScheduleOccurrence(TIMER_TYPE.INTERVAL, 1_000, 0))
            .toThrow('A finite positive interval is required');
        expect(() => getScheduleOccurrence(TIMER_TYPE.INTERVAL, 1_000, Infinity))
            .toThrow('A finite positive interval is required');
    });
});
