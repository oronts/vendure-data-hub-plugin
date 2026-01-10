/**
 * Date Field Transforms
 *
 * Date/time manipulation transform operations.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue } from '../../types/index';

/**
 * Parse date with specific format
 */
export function parseDateWithFormat(value: string, format: string): Date {
    const formatMap: Record<string, RegExp> = {
        'YYYY-MM-DD': /^(\d{4})-(\d{2})-(\d{2})$/,
        'DD/MM/YYYY': /^(\d{2})\/(\d{2})\/(\d{4})$/,
        'MM/DD/YYYY': /^(\d{2})\/(\d{2})\/(\d{4})$/,
        'DD.MM.YYYY': /^(\d{2})\.(\d{2})\.(\d{4})$/,
    };

    const regex = formatMap[format];
    if (regex) {
        const match = value.match(regex);
        if (match) {
            if (format === 'YYYY-MM-DD') {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            if (format === 'DD/MM/YYYY' || format === 'DD.MM.YYYY') {
                return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            }
            if (format === 'MM/DD/YYYY') {
                return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
            }
        }
    }

    return new Date(value);
}

/**
 * Format date to string
 */
export function formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * Apply parse date transform
 */
export function applyParseDate(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string') {
        const date = config.inputFormat
            ? parseDateWithFormat(value, config.inputFormat)
            : new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }
    return value;
}

/**
 * Apply format date transform
 */
export function applyFormatDate(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' || value instanceof Date) {
        const date = typeof value === 'string' ? new Date(value) : value;
        if (!isNaN(date.getTime()) && config.outputFormat) {
            return formatDate(date, config.outputFormat);
        }
    }
    return value;
}

/**
 * Apply now transform (get current date/time)
 */
export function applyNow(): JsonValue {
    return new Date().toISOString();
}
