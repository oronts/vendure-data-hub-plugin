/**
 * String Field Transforms
 *
 * String manipulation transform operations.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue, JsonObject } from '../../types/index';
import { TRANSFORM_LIMITS } from '../../constants/defaults';

/**
 * Slugify a string value - converts to URL-friendly format
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

/**
 * Apply trim transform
 */
export function applyTrim(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.trim() : value;
}

/**
 * Apply lowercase transform
 */
export function applyLowercase(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.toLowerCase() : value;
}

/**
 * Apply uppercase transform
 */
export function applyUppercase(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.toUpperCase() : value;
}

/**
 * Apply slugify transform
 */
export function applySlugify(value: JsonValue): JsonValue {
    return typeof value === 'string' ? slugify(value) : value;
}

/**
 * Apply truncate transform
 */
export function applyTruncate(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.length) {
        return value.substring(0, config.length);
    }
    return value;
}

/**
 * Apply pad transform
 */
export function applyPad(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.length) {
        const char = config.padChar ?? ' ';
        if (config.padPosition === 'LEFT') {
            return value.padStart(config.length, char);
        }
        return value.padEnd(config.length, char);
    }
    return value;
}

/**
 * Apply replace transform
 */
export function applyReplace(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.search) {
        if (config.global) {
            return value.split(config.search).join(config.replacement ?? '');
        }
        return value.replace(config.search, config.replacement ?? '');
    }
    return value;
}

/**
 * Apply regex replace transform
 */
export function applyRegexReplace(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.pattern) {
        const flags = config.global ? 'g' : '';
        const regex = new RegExp(config.pattern, flags);
        return value.replace(regex, config.replacement ?? '');
    }
    return value;
}

/**
 * Apply regex extract transform
 */
export function applyRegexExtract(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.pattern) {
        const regex = new RegExp(config.pattern);
        const match = value.match(regex);
        if (match) {
            const group = config.group ?? 0;
            return match[group] ?? null;
        }
    }
    return null;
}

/**
 * Apply split transform
 */
export function applySplit(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.delimiter) {
        const parts = value.split(config.delimiter);
        if (config.index !== undefined) {
            return parts[config.index] ?? null;
        }
        return parts;
    }
    return value;
}

/**
 * Apply join transform
 */
export function applyJoin(value: JsonValue, config: TransformConfig): JsonValue {
    if (Array.isArray(value)) {
        return value.join(config.separator ?? ',');
    }
    return value;
}

/**
 * Apply concat transform
 */
export function applyConcat(
    value: JsonValue,
    config: TransformConfig,
    record: JsonObject | undefined,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue,
): JsonValue {
    if (config.fields && record) {
        const values = [value, ...config.fields.map(f => getNestedValue(record, f))];
        return values.filter(v => v != null).join(config.separator ?? '');
    }
    return value;
}

/**
 * Apply template transform
 */
export function applyTemplate(
    value: JsonValue,
    config: TransformConfig,
    record: JsonObject | undefined,
    interpolateTemplate: (template: string, record: JsonObject, currentValue: JsonValue) => string,
): JsonValue {
    if (config.template && record) {
        return interpolateTemplate(config.template, record, value);
    }
    return value;
}

/**
 * Apply strip HTML transform
 */
export function applyStripHtml(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.replace(/<[^>]*>/g, '');
    }
    return value;
}

/**
 * Apply escape HTML transform
 */
export function applyEscapeHtml(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    return value;
}

/**
 * Apply title case transform
 */
export function applyTitleCase(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    return value;
}

/**
 * Apply sentence case transform
 */
export function applySentenceCase(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.toLowerCase().replace(/(^\w|[.!?]\s+\w)/g, c => c.toUpperCase());
    }
    return value;
}
