/**
 * Date Field Transforms
 *
 * Date/time manipulation transform operations.
 */

import { DATE_FORMAT } from '../../constants/enums';
import { TransformConfig } from '../../types/index';
import { JsonValue } from '../../types/index';

/**
 * Parse date with specific format
 */
export function parseDateWithFormat(value: string, format: string): Date {
    const formatMap: Record<string, RegExp> = {
        [DATE_FORMAT.ISO_DATE]: /^(\d{4})-(\d{2})-(\d{2})$/,
        [DATE_FORMAT.EU_SLASH]: /^(\d{2})\/(\d{2})\/(\d{4})$/,
        [DATE_FORMAT.US_DATE]: /^(\d{2})\/(\d{2})\/(\d{4})$/,
        [DATE_FORMAT.EU_DOT]: /^(\d{2})\.(\d{2})\.(\d{4})$/,
    };

    const regex = formatMap[format];
    if (regex) {
        const match = value.match(regex);
        if (match) {
            if (format === DATE_FORMAT.ISO_DATE) {
                return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
            }
            if (format === DATE_FORMAT.EU_SLASH || format === DATE_FORMAT.EU_DOT) {
                return new Date(Date.UTC(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10)));
            }
            if (format === DATE_FORMAT.US_DATE) {
                return new Date(Date.UTC(parseInt(match[3], 10), parseInt(match[1], 10) - 1, parseInt(match[2], 10)));
            }
        }
    }

    return new Date(value);
}

/**
 * Format date to string
 */
export function formatDate(date: Date, format: string): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return format
        .replace(/YYYY/g, String(year))
        .replace(/MM/g, month)
        .replace(/DD/g, day)
        .replace(/HH/g, hours)
        .replace(/mm/g, minutes)
        .replace(/ss/g, seconds);
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
