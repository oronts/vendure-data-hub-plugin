/**
 * Date Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { MapperTransformConfig } from '../../types/transform-config.types';
import {
    formatDate,
    parseDateWithFormat,
} from '../../../utils/date-format.utils';

/**
 * Apply date transform
 */
export function applyDateTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['date']>,
): JsonValue {
    let date: Date | null;

    if (value instanceof Date) {
        date = Number.isNaN(value.getTime()) ? null : value;
    } else if (typeof value === 'string') {
        date = config.inputFormat
            ? parseDateWithFormat(value, config.inputFormat)
            : parseDate(value);
    } else if (typeof value === 'number') {
        date = parseDate(value);
    } else {
        return value;
    }

    if (!date) {
        if (config.inputFormat) {
            throw new Error('Date value does not match the configured input format');
        }
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
function parseDate(value: string | number): Date | null {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}
