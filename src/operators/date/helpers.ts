import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone } from '../helpers';
import { DateUnit } from './types';
import { TIME_UNITS } from '../../constants/time';
import { formatDate, parseDateWithFormat } from '../../utils/date-format.utils';

function validDate(date: Date): Date | null {
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value: JsonValue | undefined, format?: string): Date | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return validDate(value);
    }

    if (typeof value === 'number') {
        return validDate(new Date(value));
    }

    if (typeof value === 'string') {
        if (format) {
            return parseDateWithFormat(value, format);
        }

        return validDate(new Date(value));
    }

    return null;
}

export function applyDateFormat(
    record: JsonObject,
    source: string,
    target: string,
    format: string,
    inputFormat?: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    const date = parseDate(value, inputFormat);
    if (date) {
        const formatted = formatDate(date, format);
        setNestedValue(result, target, formatted);
    }

    return result;
}

export function applyDateParse(
    record: JsonObject,
    source: string,
    target: string,
    format: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    if (typeof value === 'string') {
        const date = parseDateWithFormat(value, format);
        if (date) {
            setNestedValue(result, target, date.toISOString());
        }
    }

    return result;
}

export function applyDateAdd(
    record: JsonObject,
    source: string,
    target: string,
    amount: number,
    unit: DateUnit,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(record, source);

    const date = parseDate(value);
    if (!date) {
        return result;
    }

    const newDate = new Date(date.getTime());

    switch (unit) {
        case 'seconds':
            newDate.setUTCSeconds(newDate.getUTCSeconds() + amount);
            break;
        case 'minutes':
            newDate.setUTCMinutes(newDate.getUTCMinutes() + amount);
            break;
        case 'hours':
            newDate.setUTCHours(newDate.getUTCHours() + amount);
            break;
        case 'days':
            newDate.setUTCDate(newDate.getUTCDate() + amount);
            break;
        case 'weeks':
            newDate.setUTCDate(newDate.getUTCDate() + (amount * 7));
            break;
        case 'months':
            newDate.setUTCMonth(newDate.getUTCMonth() + amount);
            break;
        case 'years':
            newDate.setUTCFullYear(newDate.getUTCFullYear() + amount);
            break;
    }

    setNestedValue(result, target, newDate.toISOString());
    return result;
}

/**
 * Calculate the difference between two dates in the specified unit.
 */
export function applyDateDiff(
    record: JsonObject,
    startDatePath: string,
    endDatePath: string,
    target: string,
    unit: DateUnit,
    absolute = false,
): JsonObject {
    const result = deepClone(record);
    const startValue = getNestedValue(record, startDatePath);
    const endValue = getNestedValue(record, endDatePath);

    const startDate = parseDate(startValue);
    const endDate = parseDate(endValue);

    if (!startDate || !endDate) {
        setNestedValue(result, target, null);
        return result;
    }

    // Calculate difference in milliseconds
    let diffMs = endDate.getTime() - startDate.getTime();

    if (absolute) {
        diffMs = Math.abs(diffMs);
    }

    let diff: number;

    switch (unit) {
        case 'seconds':
            diff = diffMs / TIME_UNITS.SECOND;
            break;
        case 'minutes':
            diff = diffMs / TIME_UNITS.MINUTE;
            break;
        case 'hours':
            diff = diffMs / TIME_UNITS.HOUR;
            break;
        case 'days':
            diff = diffMs / TIME_UNITS.DAY;
            break;
        case 'weeks':
            diff = diffMs / (TIME_UNITS.DAY * 7);
            break;
        case 'months':
            // Approximate months (30.44 days average)
            diff = diffMs / (TIME_UNITS.DAY * 30.44);
            break;
        case 'years':
            // Approximate years (365.25 days)
            diff = diffMs / (TIME_UNITS.DAY * 365.25);
            break;
        default:
            diff = diffMs;
    }

    setNestedValue(result, target, diff);
    return result;
}

/**
 * Set the current timestamp on a record.
 */
export function applyNow(
    record: JsonObject,
    target: string,
    format: string = 'ISO',
): JsonObject {
    const result = deepClone(record);
    const now = new Date();

    let value: string | number;

    switch (format) {
        case 'ISO':
            value = now.toISOString();
            break;
        case 'timestamp':
            value = now.getTime();
            break;
        case 'date':
            value = formatDate(now, 'YYYY-MM-DD');
            break;
        case 'datetime':
            value = formatDate(now, 'YYYY-MM-DD HH:mm:ss');
            break;
        default:
            // Custom format string
            value = formatDate(now, format);
    }

    setNestedValue(result, target, value);
    return result;
}
