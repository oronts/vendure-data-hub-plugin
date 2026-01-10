/**
 * Boolean Field Transforms
 *
 * Boolean manipulation transform operations.
 */

import { TransformConfig } from '../../types/index';
import { JsonValue } from '../../types/index';

/**
 * Apply parse boolean transform
 */
export function applyParseBoolean(value: JsonValue, config: TransformConfig): JsonValue {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        const trueValues = config.trueValues ?? ['true', 'yes', '1', 'on', 'y'];
        const falseValues = config.falseValues ?? ['false', 'no', '0', 'off', 'n'];
        if (trueValues.includes(lower)) return true;
        if (falseValues.includes(lower)) return false;
    }
    return null;
}

/**
 * Apply negate transform
 */
export function applyNegate(value: JsonValue): JsonValue {
    if (typeof value === 'boolean') return !value;
    return value;
}
