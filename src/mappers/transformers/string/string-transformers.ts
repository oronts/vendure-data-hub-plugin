/**
 * String Transform Functions
 */

import { JsonValue, JsonObject } from '../../../types/index';
import { TransformConfig } from '../../types/transform-config.types';

// Import canonical implementations
import {
    applyTrim as applyTrimCanonical,
    applyLowercase as applyLowercaseCanonical,
    applyUppercase as applyUppercaseCanonical,
    applyReplace as applyReplaceCanonical,
    applySplit as applySplitCanonical,
    applyJoin as applyJoinCanonical,
    applyConcat as applyConcatCanonical,
    applyTemplate as applyTemplateCanonical,
    applyRegexExtract as applyRegexExtractCanonical,
} from '../../../transforms/field/string-transforms';

/**
 * Trim whitespace from string
 */
export const applyTrimTransform = applyTrimCanonical;

/**
 * Convert to lowercase
 */
export const applyLowercaseTransform = applyLowercaseCanonical;

/**
 * Convert to uppercase
 */
export const applyUppercaseTransform = applyUppercaseCanonical;

/**
 * Apply template transform with ${field} placeholders
 */
export function applyTemplateTransform(
    _value: JsonValue,
    template: string,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): string {
    // Use canonical template with adapter
    return applyTemplateCanonical(
        _value,
        { template },
        record,
        (template: string, rec: JsonObject, _currentValue: JsonValue) => {
            return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
                const val = getNestedValue(rec, path.trim());
                return val !== null && val !== undefined ? String(val) : '';
            });
        },
    ) as string;
}

/**
 * Apply split transform
 */
export function applySplitTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['split']>,
): JsonValue {
    return applySplitCanonical(value, {
        delimiter: config.delimiter,
        index: config.index,
    });
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
            const fieldValue = getNestedValue(record, field);
            if (fieldValue !== null && fieldValue !== undefined) {
                values.push(fieldValue);
            }
        }
    }

    return applyJoinCanonical(values, { separator: config.delimiter }) as string;
}

/**
 * Apply replace transform
 */
export function applyReplaceTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['replace']>,
): JsonValue {
    if (typeof value !== 'string') return value;

    return applyReplaceCanonical(value, {
        search: config.search,
        replacement: config.replacement,
        global: config.global !== false,
    });
}

/**
 * Apply extract transform with regex
 */
export function applyExtractTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['extract']>,
): JsonValue {
    return applyRegexExtractCanonical(value, {
        pattern: config.pattern,
        group: config.group,
    });
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
    return applyConcatCanonical(
        value,
        { fields: config.fields, separator: config.separator ?? ' ' },
        record,
        (obj, path) => getNestedValue(obj, path) ?? null,
    ) as string;
}
