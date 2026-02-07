/**
 * String Field Transforms
 *
 * String manipulation transform operations.
 */

import { createSafeRegex } from '../../utils/safe-regex.utils';

import { TransformConfig } from '../../types/index';
import { JsonValue, JsonObject } from '../../types/index';
import { slugify } from '../../operators/helpers';
import { PadPosition } from '../../constants/enums';

export { slugify };

// Regex patterns as constants for performance and maintainability
const HTML_TAG_PATTERN = /<[^>]*>/g;
const WORD_BOUNDARY_PATTERN = /\b\w/g;
const SENTENCE_START_PATTERN = /(^\w|[.!?]\s+\w)/g;

// HTML escape mapping for single-pass replacement
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
const HTML_ESCAPE_PATTERN = /[&<>"']/g;

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
        if (config.padPosition === PadPosition.LEFT) {
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
        const regex = createSafeRegex(config.pattern, flags);
        return value.replace(regex, config.replacement ?? '');
    }
    return value;
}

/**
 * Apply regex extract transform
 */
export function applyRegexExtract(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'string' && config.pattern) {
        const regex = createSafeRegex(config.pattern);
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
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
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
        return value.replace(HTML_TAG_PATTERN, '');
    }
    return value;
}

/**
 * Apply escape HTML transform
 * Uses single-pass replacement for better performance
 */
export function applyEscapeHtml(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.replace(HTML_ESCAPE_PATTERN, char => HTML_ESCAPE_MAP[char]);
    }
    return value;
}

/**
 * Apply title case transform
 */
export function applyTitleCase(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.toLowerCase().replace(WORD_BOUNDARY_PATTERN, c => c.toUpperCase());
    }
    return value;
}

/**
 * Apply sentence case transform
 */
export function applySentenceCase(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
        return value.toLowerCase().replace(SENTENCE_START_PATTERN, c => c.toUpperCase());
    }
    return value;
}
