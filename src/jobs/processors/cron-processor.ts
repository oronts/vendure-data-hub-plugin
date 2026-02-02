/**
 * Cron Expression Processor
 *
 * Provides cron expression parsing and matching functionality.
 * Supports:
 * - Standard 5-field cron format (minute hour day-of-month month day-of-week)
 * - Wildcards, step values, ranges, lists
 * - Named days (SUN-SAT) and months (JAN-DEC)
 * - Timezone-aware scheduling with DST handling
 */

import { CRON } from '../../constants/index';

/**
 * Named weekday mapping (case-insensitive)
 * Supports both 3-letter abbreviations and full names
 */
const WEEKDAY_NAMES: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
};

/**
 * Named month mapping (case-insensitive)
 * Supports both 3-letter abbreviations and full names
 */
const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};

/**
 * Normalize a cron field value, converting named values to numbers
 * @param value - The field value (may be a number or name)
 * @param fieldType - 'weekday' or 'month' for named value lookup
 * @returns Normalized numeric value or original string if not a named value
 */
function normalizeFieldValue(value: string, fieldType: 'weekday' | 'month'): string {
    const lower = value.toLowerCase().trim();
    const mapping = fieldType === 'weekday' ? WEEKDAY_NAMES : MONTH_NAMES;

    if (mapping[lower] !== undefined) {
        return String(mapping[lower]);
    }
    return value;
}

/**
 * Normalize an entire cron field, handling ranges and lists with named values
 * @param field - The cron field expression
 * @param fieldType - 'weekday' or 'month' for named value lookup
 * @returns Normalized field with all named values converted to numbers
 */
function normalizeCronField(field: string, fieldType: 'weekday' | 'month'): string {
    // Handle comma-separated lists
    if (field.includes(',')) {
        return field.split(',').map(part => normalizeCronField(part.trim(), fieldType)).join(',');
    }

    // Handle ranges (e.g., MON-FRI, JAN-MAR)
    if (field.includes('-') && !field.startsWith('*/')) {
        const [rangeAndStep] = field.split('/');
        const parts = rangeAndStep.split('-');
        if (parts.length === 2) {
            const normalizedStart = normalizeFieldValue(parts[0], fieldType);
            const normalizedEnd = normalizeFieldValue(parts[1], fieldType);
            const step = field.includes('/') ? '/' + field.split('/')[1] : '';
            return `${normalizedStart}-${normalizedEnd}${step}`;
        }
    }

    // Handle single values
    return normalizeFieldValue(field, fieldType);
}

/**
 * Validates if a timezone string is valid using Intl.DateTimeFormat
 *
 * @param timezone - The timezone string to validate (e.g., 'America/New_York', 'UTC')
 * @returns True if the timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch {
        // Invalid timezone - return false
        return false;
    }
}

/**
 * Converts a Date to the equivalent date/time components in the specified timezone
 *
 * @param date - The date to convert
 * @param timezone - The target timezone (e.g., 'America/New_York', 'UTC')
 * @returns Object with date/time components in the target timezone
 */
export function getDatePartsInTimezone(
    date: Date,
    timezone: string,
): {
    minute: number;
    hour: number;
    day: number;
    month: number;
    weekday: number;
} {
    // Use Intl.DateTimeFormat to get components in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};

    for (const part of parts) {
        partMap[part.type] = part.value;
    }

    // Map weekday abbreviation to number (0-6, Sun-Sat)
    const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return {
        minute: parseInt(partMap.minute, 10),
        hour: parseInt(partMap.hour, 10),
        day: parseInt(partMap.day, 10),
        month: parseInt(partMap.month, 10),
        weekday: weekdayMap[partMap.weekday] ?? date.getDay(),
    };
}

/**
 * Check if a date matches a cron expression
 *
 * Supports 5-field cron format: minute hour day-of-month month day-of-week
 * - `*` (any value)
 * - `*\/n` (step values, e.g., `*\/5` for every 5)
 * - comma-separated lists
 * - numeric values
 * - named days (SUN-SAT) and months (JAN-DEC)
 *
 * @param date - The date to check
 * @param expr - Cron expression (5 fields: m h dom mon dow)
 * @param timezone - Optional timezone for schedule evaluation (e.g., 'America/New_York', 'UTC')
 * @returns True if the date matches the cron expression
 */
export function cronMatches(date: Date, expr: string, timezone?: string): boolean {
    const fields = expr.trim().split(/\s+/);
    if (fields.length < 5) return false;

    const [m, h, dom, mon, dow] = fields;

    // Normalize month and weekday fields to handle named values
    const normalizedMon = normalizeCronField(mon, 'month');
    const normalizedDow = normalizeCronField(dow, 'weekday');

    let minute: number;
    let hour: number;
    let day: number;
    let month: number;
    let weekday: number;

    // If timezone is provided and valid, convert the date to that timezone
    if (timezone && isValidTimezone(timezone)) {
        const parts = getDatePartsInTimezone(date, timezone);
        minute = parts.minute;
        hour = parts.hour;
        day = parts.day;
        month = parts.month;
        weekday = parts.weekday;
    } else {
        // Use server local time
        minute = date.getMinutes();
        hour = date.getHours();
        day = date.getDate();
        month = date.getMonth() + 1;
        weekday = date.getDay(); // 0-6 Sun-Sat
    }

    return (
        cronFieldMatch(minute, m, 0, 59) &&
        cronFieldMatch(hour, h, 0, 23) &&
        cronFieldMatch(day, dom, 1, 31) &&
        cronFieldMatch(month, normalizedMon, 1, 12) &&
        cronFieldMatch(weekday, normalizedDow, 0, 6)
    );
}

/**
 * Check if a value matches a cron field expression
 *
 * @param value - The numeric value to check
 * @param field - The cron field expression
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns True if the value matches the field expression
 */
export function cronFieldMatch(
    value: number,
    field: string,
    min: number,
    max: number,
): boolean {
    field = field.trim();

    // Wildcard - matches any value
    if (field === '*') {
        return true;
    }

    // Step values (e.g., */5 for every 5 minutes)
    if (field.startsWith('*/')) {
        const step = Number(field.slice(2));
        return step > 0 && (value - min) % step === 0;
    }

    // Range with step (e.g., 1-30/5)
    if (field.includes('-') && field.includes('/')) {
        const [range, stepStr] = field.split('/');
        const [startStr, endStr] = range.split('-');
        const start = Number(startStr);
        const end = Number(endStr);
        const step = Number(stepStr);

        if (isNaN(start) || isNaN(end) || isNaN(step) || step <= 0) {
            return false;
        }

        if (value < start || value > end) {
            return false;
        }

        return (value - start) % step === 0;
    }

    // Range (e.g., 1-5)
    if (field.includes('-') && !field.includes(',')) {
        const [startStr, endStr] = field.split('-');
        const start = Number(startStr);
        const end = Number(endStr);

        if (isNaN(start) || isNaN(end)) {
            return false;
        }

        return value >= start && value <= end;
    }

    // Comma-separated list (e.g., 1,3,5)
    if (field.includes(',')) {
        return field.split(',').some(part => cronFieldMatch(value, part.trim(), min, max));
    }

    // Single numeric value
    const num = Number(field);
    return !Number.isNaN(num) && num >= min && num <= max && num === value;
}

/**
 * Validate a cron expression
 * Supports named days (SUN-SAT) and months (JAN-DEC)
 *
 * @param expr - Cron expression to validate
 * @returns Validation result with error message if invalid
 */
export function validateCronExpression(expr: string): {
    valid: boolean;
    error?: string;
} {
    if (!expr || typeof expr !== 'string') {
        return { valid: false, error: 'Cron expression is required' };
    }

    const fields = expr.trim().split(/\s+/);
    if (fields.length < 5) {
        return {
            valid: false,
            error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}`,
        };
    }

    const fieldNames = ['minute', 'hour', 'day', 'month', 'weekday'];
    const ranges: [number, number][] = [
        [0, 59],
        [0, 23],
        [1, 31],
        [1, 12],
        [0, 6],
    ];

    for (let i = 0; i < 5; i++) {
        let field = fields[i];
        const [min, max] = ranges[i];

        // Normalize month and weekday fields to handle named values
        if (i === 3) { // month
            field = normalizeCronField(field, 'month');
        } else if (i === 4) { // weekday
            field = normalizeCronField(field, 'weekday');
        }

        const validationError = validateCronField(field, min, max);

        if (validationError) {
            return {
                valid: false,
                error: `Invalid ${fieldNames[i]} field "${fields[i]}": ${validationError}`,
            };
        }
    }

    return { valid: true };
}

/**
 * Validate a single cron field
 *
 * @param field - Cron field to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Error message if invalid, undefined if valid
 */
function validateCronField(
    field: string,
    min: number,
    max: number,
): string | undefined {
    field = field.trim();

    if (field === '*') {
        return undefined;
    }

    // Step values
    if (field.startsWith('*/')) {
        const step = Number(field.slice(2));
        if (isNaN(step) || step <= 0) {
            return 'Step value must be a positive number';
        }
        return undefined;
    }

    // Range with step
    if (field.includes('-') && field.includes('/')) {
        const [range, stepStr] = field.split('/');
        const [startStr, endStr] = range.split('-');
        const start = Number(startStr);
        const end = Number(endStr);
        const step = Number(stepStr);

        if (isNaN(start) || isNaN(end)) {
            return 'Range values must be numbers';
        }
        if (start < min || start > max || end < min || end > max) {
            return `Range values must be between ${min} and ${max}`;
        }
        if (start > end) {
            return 'Start of range must be less than or equal to end';
        }
        if (isNaN(step) || step <= 0) {
            return 'Step value must be a positive number';
        }
        return undefined;
    }

    // Range
    if (field.includes('-')) {
        const [startStr, endStr] = field.split('-');
        const start = Number(startStr);
        const end = Number(endStr);

        if (isNaN(start) || isNaN(end)) {
            return 'Range values must be numbers';
        }
        if (start < min || start > max || end < min || end > max) {
            return `Range values must be between ${min} and ${max}`;
        }
        if (start > end) {
            return 'Start of range must be less than or equal to end';
        }
        return undefined;
    }

    // Comma-separated list
    if (field.includes(',')) {
        const parts = field.split(',');
        for (const part of parts) {
            const error = validateCronField(part.trim(), min, max);
            if (error) {
                return error;
            }
        }
        return undefined;
    }

    // Single value
    const num = Number(field);
    if (isNaN(num)) {
        return 'Value must be a number';
    }
    if (num < min || num > max) {
        return `Value must be between ${min} and ${max}`;
    }

    return undefined;
}

/**
 * Get next occurrence of a cron expression
 *
 * @param expr - Cron expression
 * @param after - Start searching after this date (defaults to now)
 * @param maxIterations - Maximum iterations to prevent infinite loops
 * @param timezone - Optional timezone for schedule evaluation (e.g., 'America/New_York', 'UTC')
 * @returns Next matching date or null if not found
 */
export function getNextCronOccurrence(
    expr: string,
    after: Date = new Date(),
    maxIterations: number = CRON.MAX_ITERATIONS,
    timezone?: string,
): Date | null {
    const validation = validateCronExpression(expr);
    if (!validation.valid) {
        return null;
    }

    // Start from the next minute
    const current = new Date(after);
    current.setSeconds(0, 0);
    current.setMinutes(current.getMinutes() + 1);

    for (let i = 0; i < maxIterations; i++) {
        if (cronMatches(current, expr, timezone)) {
            return current;
        }
        current.setMinutes(current.getMinutes() + 1);
    }

    return null;
}
