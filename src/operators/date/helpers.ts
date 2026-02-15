import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, deepClone } from '../helpers';
import { DateUnit } from './types';
import { TIME_UNITS } from '../../constants/index';

function parseDate(value: JsonValue | undefined, format?: string): Date | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'number') {
        // Assume milliseconds timestamp
        return new Date(value);
    }

    if (typeof value === 'string') {
        // Try ISO format first
        const isoDate = new Date(value);
        if (!isNaN(isoDate.getTime())) {
            return isoDate;
        }

        // If format is provided, try to parse with format
        if (format) {
            return parseDateWithFormat(value, format);
        }

        return null;
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

        return new Date(
            parts.year,
            parts.month,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
        );
    } catch {
        // Date parsing failed - return null as fallback
        return null;
    }
}

function formatDate(date: Date, format: string): string {
    const pad = (n: number): string => n.toString().padStart(2, '0');

    return format
        .replace('YYYY', date.getFullYear().toString())
        .replace('MM', pad(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()));
}

export function applyDateFormat(
    record: JsonObject,
    source: string,
    target: string,
    format: string,
    inputFormat?: string,
    _timezone?: string,
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
    _timezone?: string,
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
            newDate.setSeconds(newDate.getSeconds() + amount);
            break;
        case 'minutes':
            newDate.setMinutes(newDate.getMinutes() + amount);
            break;
        case 'hours':
            newDate.setHours(newDate.getHours() + amount);
            break;
        case 'days':
            newDate.setDate(newDate.getDate() + amount);
            break;
        case 'weeks':
            newDate.setDate(newDate.getDate() + (amount * 7));
            break;
        case 'months':
            newDate.setMonth(newDate.getMonth() + amount);
            break;
        case 'years':
            newDate.setFullYear(newDate.getFullYear() + amount);
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
    _timezone?: string,
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
