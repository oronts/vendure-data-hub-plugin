/**
 * Date Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { MapperTransformConfig } from '../../types/transform-config.types';
import { formatDate as formatDateCanonical } from '../../../transforms/field/date-transforms';
import { ISO_DATE_PATTERN } from '../../constants';

export const formatDate = formatDateCanonical;

/**
 * Apply date transform
 */
export function applyDateTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['date']>,
): JsonValue {
    let date: Date;

    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        // Try parsing with input format or auto-detect
        date = new Date(value);
    } else if (typeof value === 'number') {
        date = new Date(value);
    } else {
        return value;
    }

    if (isNaN(date.getTime())) {
        return value;
    }

    if (config.outputFormat) {
        return formatDate(date, config.outputFormat);
    }

    return date.toISOString();
}

/**
 * Parse a date string to Date object
 */
export function parseDate(value: string | number): Date | null {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a value is a valid date string
 * Uses centralized ISO_DATE_PATTERN from constants
 */
export function isDateString(value: string): boolean {
    if (!ISO_DATE_PATTERN.test(value)) {
        return false;
    }
    const date = new Date(value);
    return !isNaN(date.getTime());
}

/**
 * Convert date to ISO string
 */
export function toISOString(date: Date): string {
    return date.toISOString();
}

/**
 * Get current timestamp
 */
export function now(): Date {
    return new Date();
}
