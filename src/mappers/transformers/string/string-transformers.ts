/**
 * String Transform Functions
 */

import { JsonValue, JsonObject } from '../../../types/index';
import { TransformConfig } from '../../types/transform-config.types';

/**
 * Apply template transform with ${field} placeholders
 */
export function applyTemplateTransform(
    _value: JsonValue,
    template: string,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        const val = getNestedValue(record, path.trim());
        return val !== null && val !== undefined ? String(val) : '';
    });
}

/**
 * Apply split transform
 */
export function applySplitTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['split']>,
): JsonValue {
    if (typeof value !== 'string') return value;

    let parts = value.split(config.delimiter);
    if (config.trim !== false) {
        parts = parts.map(p => p.trim());
    }

    if (config.index !== undefined) {
        return parts[config.index] ?? null;
    }

    return parts;
}

/**
 * Apply join transform
 */
export function applyJoinTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['join']>,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): string {
    const values: JsonValue[] = Array.isArray(value) ? value : [value];

    if (config.fields?.length) {
        for (const field of config.fields) {
            const v = getNestedValue(record, field);
            if (v !== null && v !== undefined) {
                values.push(v);
            }
        }
    }

    return values
        .filter(v => v !== null && v !== undefined)
        .map(v => String(v))
        .join(config.delimiter);
}

/**
 * Apply replace transform
 */
export function applyReplaceTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['replace']>,
): JsonValue {
    if (typeof value !== 'string') return value;

    if (config.regex) {
        const flags = config.global !== false ? 'g' : '';
        const regex = new RegExp(config.search, flags);
        return value.replace(regex, config.replacement);
    }

    if (config.global !== false) {
        return value.split(config.search).join(config.replacement);
    }

    return value.replace(config.search, config.replacement);
}

/**
 * Apply extract transform with regex
 */
export function applyExtractTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['extract']>,
): JsonValue {
    if (typeof value !== 'string') return value;

    const regex = new RegExp(config.pattern);
    const match = value.match(regex);

    if (!match) return null;

    if (config.group !== undefined && config.group > 0) {
        return match[config.group] ?? null;
    }

    return match[0];
}

/**
 * Apply concat transform
 */
export function applyConcatTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['concat']>,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): string {
    const values: (JsonValue | undefined)[] = [value];

    for (const field of config.fields) {
        const v = getNestedValue(record, field);
        values.push(v);
    }

    return values
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(v => String(v))
        .join(config.separator ?? ' ');
}

/**
 * Trim whitespace from string
 */
export function applyTrimTransform(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.trim() : value;
}

/**
 * Convert to lowercase
 */
export function applyLowercaseTransform(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.toLowerCase() : value;
}

/**
 * Convert to uppercase
 */
export function applyUppercaseTransform(value: JsonValue): JsonValue {
    return typeof value === 'string' ? value.toUpperCase() : value;
}
