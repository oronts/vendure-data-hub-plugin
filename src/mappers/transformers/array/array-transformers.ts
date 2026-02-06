/**
 * Array Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { MapperTransformConfig } from '../../types/transform-config.types';

/**
 * Apply map transform using value dictionary.
 * Returns default for null/undefined inputs.
 */
export function applyMapTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['map']>,
): JsonValue {
    // Input validation - return default for null/undefined
    if (value === null || value === undefined) {
        return config.default ?? null;
    }

    const stringValue = String(value);
    const key = config.caseSensitive === false ? stringValue.toLowerCase() : stringValue;

    // Check for direct match
    if (key in config.values) {
        return config.values[key];
    }

    // Check for case-insensitive match
    if (config.caseSensitive === false) {
        for (const [k, v] of Object.entries(config.values)) {
            if (k.toLowerCase() === key) {
                return v;
            }
        }
    }

    return config.default ?? value;
}

/**
 * Apply default value transform
 */
export function applyDefaultTransform(
    value: JsonValue | undefined,
    config: NonNullable<MapperTransformConfig['default']>,
    isEmpty: (value: JsonValue | undefined) => boolean,
): JsonValue {
    if (config.onlyIfEmpty !== false && isEmpty(value)) {
        return config.value;
    }
    return value ?? null;
}
