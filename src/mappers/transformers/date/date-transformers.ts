/**
 * Date Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { TransformConfig } from '../../services/field-mapper.service';

/**
 * Apply date transform
 */
export function applyDateTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['date']>,
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
 * Format a date using a simple format string
 * Supports: YYYY, MM, DD, HH, mm, ss
 */
export function formatDate(date: Date, format: string): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    return format
        .replace('YYYY', date.getFullYear().toString())
        .replace('MM', pad(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()));
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
 */
export function isDateString(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
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
