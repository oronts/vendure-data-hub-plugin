/**
 * Template Engine
 *
 * Template string interpolation for transforms.
 * Supports ${field} placeholder syntax with nested field access.
 */

import { JsonValue, JsonObject } from '../../types/index';
import { getNestedValue } from './expression-eval';

// TEMPLATE INTERPOLATION

/**
 * Interpolate template string with record values
 * Replaces ${fieldPath} placeholders with actual values
 *
 * @param template - Template string with ${} placeholders
 * @param record - Record object to get values from
 * @param currentValue - Current field value (accessible via ${value})
 * @returns Interpolated string
 *
 * @example
 * interpolateTemplate('${firstName} ${lastName}', { firstName: 'John', lastName: 'Doe' }, null)
 * // Returns: 'John Doe'
 *
 * @example
 * interpolateTemplate('Price: ${value} ${currency}', { currency: 'USD' }, 99.99)
 * // Returns: 'Price: 99.99 USD'
 */
export function interpolateTemplate(template: string, record: JsonObject, currentValue: JsonValue): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        if (path === 'value') return String(currentValue ?? '');
        const value = getNestedValue(record, path);
        return String(value ?? '');
    });
}
