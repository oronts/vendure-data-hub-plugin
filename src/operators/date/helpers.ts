import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone } from '../helpers';
import { DateUnit } from './types';
import { TIME_UNITS } from '../../constants/time';
import { formatDate } from '../../transforms/field/date-transforms';

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

function parseDateWithFormat(value: string, format: string): Date | null {
    try {
        // Replace known tokens with capture groups, then escape remaining chars
        // to prevent regex injection from format strings with special characters.
        const TOKENS: Record<string, string> = {
            'YYYY': '(\\d{4})',
            'MM': '(\\d{2})',
            'DD': '(\\d{2})',
            'HH': '(\\d{2})',
            'mm': '(\\d{2})',
            'ss': '(\\d{2})',
        };
        const TOKEN_RE = /YYYY|MM|DD|HH|mm|ss/g;
        const segments: string[] = [];
        let lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = TOKEN_RE.exec(format)) !== null) {
            if (m.index > lastIndex) {
                // Escape literal characters between tokens
                segments.push(format.slice(lastIndex, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            }
            segments.push(TOKENS[m[0]]);
            lastIndex = m.index + m[0].length;
        }
        if (lastIndex < format.length) {
            segments.push(format.slice(lastIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
        const pattern = segments.join('');

        const regex = new RegExp(`^${pattern}$`);
        const match = value.match(regex);

        if (!match) {
            return null;
        }

        // Extract parts based on format
        const parts: Record<string, number> = {
            year: 1970,
            month: 0,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
        };

        const formatParts = format.match(/(YYYY|MM|DD|HH|mm|ss)/g) || [];
        let matchIndex = 1;

        for (const part of formatParts) {
            const val = parseInt(match[matchIndex++], 10);
            switch (part) {
                case 'YYYY':
                    parts.year = val;
                    break;
                case 'MM':
                    parts.month = val - 1;
                    break;
                case 'DD':
                    parts.day = val;
                    break;
                case 'HH':
                    parts.hour = val;
                    break;
                case 'mm':
                    parts.minute = val;
                    break;
                case 'ss':
                    parts.second = val;
                    break;
            }
        }

        const date = new Date(0);
        date.setUTCFullYear(parts.year, parts.month, parts.day);
        date.setUTCHours(parts.hour, parts.minute, parts.second, 0);

        if (
            date.getUTCFullYear() !== parts.year ||
            date.getUTCMonth() !== parts.month ||
            date.getUTCDate() !== parts.day ||
            date.getUTCHours() !== parts.hour ||
            date.getUTCMinutes() !== parts.minute ||
            date.getUTCSeconds() !== parts.second
        ) {
            return null;
        }

        return date;
    } catch {
        // Date parsing failed - return null as fallback
        return null;
    }
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
