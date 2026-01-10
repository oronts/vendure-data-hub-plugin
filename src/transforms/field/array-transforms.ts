/**
 * Array Field Transforms
 *
 * Array manipulation transform operations.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue } from '../../types/index';

/**
 * Apply first transform (get first element)
 */
export function applyFirst(value: JsonValue): JsonValue {
    return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

/**
 * Apply last transform (get last element)
 */
export function applyLast(value: JsonValue): JsonValue {
    return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : null;
}

/**
 * Apply nth transform (get element at position)
 */
export function applyNth(value: JsonValue, config: TransformConfig): JsonValue {
    if (Array.isArray(value) && config.position !== undefined) {
        return value[config.position] ?? null;
    }
    return null;
}

/**
 * Apply flatten transform (flatten nested arrays)
 */
export function applyFlatten(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.flat();
    }
    return value;
}
