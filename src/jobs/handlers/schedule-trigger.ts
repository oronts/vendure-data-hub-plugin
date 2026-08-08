import { TriggerType, TIMER_TYPE, TimerType } from '../../constants/enums';
import type { JsonObject } from '../../types';

export interface ScheduleTriggerConfig {
    readonly type: typeof TriggerType.SCHEDULE;
    readonly cron: string | null;
    readonly intervalSec: number | null;
    readonly timezone: string | null;
}

export interface ScheduleOccurrence {
    readonly key: string;
    readonly leaseTtlMs: number;
}

const CRON_OCCURRENCE_MS = 60_000;

export function parseScheduleTriggerConfig(
    config: JsonObject,
): ScheduleTriggerConfig | null {
    if (!config || typeof config !== 'object') return null;
    if (config.type !== TriggerType.SCHEDULE) return null;

    return {
        type: TriggerType.SCHEDULE,
        cron: typeof config.cron === 'string' ? config.cron : null,
        intervalSec: typeof config.intervalSec === 'number'
            ? config.intervalSec
            : null,
        timezone: typeof config.timezone === 'string' ? config.timezone : null,
    };
}

export function getScheduleOccurrence(
    triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
    occurredAtMs: number,
    intervalMs?: number,
): ScheduleOccurrence {
    const durationMs = triggerType === TIMER_TYPE.CRON
        ? CRON_OCCURRENCE_MS
        : intervalMs;
    if (!durationMs || durationMs < 1 || !Number.isFinite(durationMs)) {
        throw new Error(
            'A finite positive interval is required for interval schedule occurrences',
        );
    }

    const bucket = Math.floor(occurredAtMs / durationMs);
    const occurrenceEndsAt = (bucket + 1) * durationMs;
    return {
        key: `${triggerType.toLowerCase()}:${bucket}`,
        leaseTtlMs: Math.max(1, occurrenceEndsAt - occurredAtMs),
    };
}
