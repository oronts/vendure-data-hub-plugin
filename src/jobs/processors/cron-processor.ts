import { Cron } from 'croner';
import { CRON } from '../../constants/index';
import { validateCronExpression } from '../../../shared/utils/validation';

export function isValidTimezone(timezone: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch {
        return false;
    }
}

function withCron<T>(
    expr: string,
    timezone: string | undefined,
    action: (cron: Cron) => T,
): T | null {
    const validation = validateCronExpression(expr);
    if (!validation.valid || (timezone !== undefined && !isValidTimezone(timezone))) {
        return null;
    }

    let cron: Cron | undefined;
    try {
        cron = new Cron(expr, { paused: true, timezone });
        return action(cron);
    } catch {
        return null;
    } finally {
        cron?.stop();
    }
}

/** Match a standard five-field cron expression at minute precision. */
export function cronMatches(date: Date, expr: string, timezone?: string): boolean {
    const minute = new Date(date);
    minute.setSeconds(0, 0);
    const previousInstant = new Date(minute.getTime() - 1);
    const next = getNextCronOccurrence(expr, previousInstant, CRON.MAX_ITERATIONS, timezone);
    return next?.getTime() === minute.getTime();
}

export function getNextCronOccurrence(
    expr: string,
    after: Date = new Date(),
    maxIterations: number = CRON.MAX_ITERATIONS,
    timezone?: string,
): Date | null {
    const next = withCron(expr, timezone, cron => cron.nextRun(after));
    if (!next) return null;

    const maxSearchWindowMs = maxIterations * 60_000;
    return next.getTime() - after.getTime() <= maxSearchWindowMs ? next : null;
}
