import { TRANSFORM_LIMITS } from '../constants/defaults/core-defaults';

const DATE_FORMAT_TOKEN_PATTERN = /YYYY|MM|DD|HH|mm|ss/g;
const DATE_FORMAT_TOKEN_GROUPS = {
    YYYY: '(\\d{4})',
    MM: '(\\d{2})',
    DD: '(\\d{2})',
    HH: '(\\d{2})',
    mm: '(\\d{2})',
    ss: '(\\d{2})',
} as const;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;

type DateFormatToken = keyof typeof DATE_FORMAT_TOKEN_GROUPS;

interface DateParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileDateFormat(
    format: string,
): { regex: RegExp; tokens: DateFormatToken[] } | null {
    if (format.length === 0 || format.length > TRANSFORM_LIMITS.MAX_DATE_FORMAT_LENGTH) {
        return null;
    }
    const tokens: DateFormatToken[] = [];
    const segments: string[] = [];
    let lastIndex = 0;

    for (const match of format.matchAll(DATE_FORMAT_TOKEN_PATTERN)) {
        const token = match[0] as DateFormatToken;
        const index = match.index;
        segments.push(escapeRegExp(format.slice(lastIndex, index)));
        segments.push(DATE_FORMAT_TOKEN_GROUPS[token]);
        tokens.push(token);
        lastIndex = index + token.length;
    }

    if (tokens.length === 0 || new Set(tokens).size !== tokens.length) {
        return null;
    }
    segments.push(escapeRegExp(format.slice(lastIndex)));
    return { regex: new RegExp(`^${segments.join('')}$`), tokens };
}

function extractDateParts(match: RegExpMatchArray, tokens: DateFormatToken[]): DateParts {
    const parts: DateParts = {
        year: 1970,
        month: 0,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
    };
    tokens.forEach((token, index) => {
        const value = Number.parseInt(match[index + 1], 10);
        if (token === 'YYYY') parts.year = value;
        else if (token === 'MM') parts.month = value - 1;
        else if (token === 'DD') parts.day = value;
        else if (token === 'HH') parts.hour = value;
        else if (token === 'mm') parts.minute = value;
        else parts.second = value;
    });
    return parts;
}

function createValidatedUtcDate(parts: DateParts): Date | null {
    const date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month, parts.day);
    date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
    const matches = date.getUTCFullYear() === parts.year
        && date.getUTCMonth() === parts.month
        && date.getUTCDate() === parts.day
        && date.getUTCHours() === parts.hour
        && date.getUTCMinutes() === parts.minute
        && date.getUTCSeconds() === parts.second;
    return matches ? date : null;
}

export function parseDateWithFormat(value: string, format: string): Date | null {
    if (value.length > TRANSFORM_LIMITS.MAX_DATE_VALUE_LENGTH) return null;
    const compiled = compileDateFormat(format);
    if (!compiled) return null;
    const match = value.match(compiled.regex);
    if (!match) return null;
    return createValidatedUtcDate(extractDateParts(match, compiled.tokens));
}

export function isValidIsoDateString(value: string): boolean {
    if (value.length > TRANSFORM_LIMITS.MAX_DATE_VALUE_LENGTH) return false;
    const match = value.match(ISO_DATE_PREFIX_PATTERN);
    if (!match || !parseDateWithFormat(match[1], 'YYYY-MM-DD')) return false;
    return !Number.isNaN(new Date(value).getTime());
}

export function formatDate(date: Date, format: string): string {
    if (Number.isNaN(date.getTime())) {
        throw new Error('Cannot format an invalid date');
    }
    if (format.length === 0 || format.length > TRANSFORM_LIMITS.MAX_DATE_FORMAT_LENGTH) {
        throw new Error(
            `Date format must contain 1-${TRANSFORM_LIMITS.MAX_DATE_FORMAT_LENGTH} characters`,
        );
    }
    const fullYear = date.getUTCFullYear();
    if (fullYear < 0 || fullYear > 9999) {
        throw new Error('Date year must be between 0000 and 9999');
    }
    const year = String(fullYear).padStart(4, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return format
        .replace(/YYYY/g, year)
        .replace(/MM/g, month)
        .replace(/DD/g, day)
        .replace(/HH/g, hours)
        .replace(/mm/g, minutes)
        .replace(/ss/g, seconds);
}
