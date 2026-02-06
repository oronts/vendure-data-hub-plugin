/**
 * Conditional Transform Functions
 *
 * SECURITY: Uses SafeEvaluator for secure expression evaluation with:
 * - Code validation (70+ blocked keywords)
 * - Prototype pollution protection
 * - Method whitelist validation
 * - Sandbox execution environment
 * - LRU-cached compiled functions
 */

import { JsonValue, JsonObject } from '../../../types/index';
import { MapperTransformConfig } from '../../types/transform-config.types';
import { getDefaultEvaluator } from '../../../runtime/sandbox/safe-evaluator';
import { CODE_SECURITY } from '../../../constants';
import { isEmpty } from '../../../utils/value-checks.utils';

// Import canonical implementations
import {
    applyIfElse as applyIfElseCanonical,
    applyCoalesce as applyCoalesceCanonical,
    applyDefault as applyDefaultCanonical,
} from '../../../transforms/record/record-transforms';

/** Maximum allowed expression length to prevent DoS */
const MAX_EXPRESSION_LENGTH = CODE_SECURITY.MAX_CONDITION_LENGTH;

/**
 * Apply conditional transform using SafeEvaluator
 */
export function applyConditionalTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['conditional']>,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): JsonValue {
    try {
        // Length check to prevent DoS
        if (config.condition.length > MAX_EXPRESSION_LENGTH) {
            throw new Error('Condition too long');
        }

        // Build condition with safe substitutions for variable references
        const condition = config.condition
            .replace(/\$value\b/g, 'value')
            .replace(/\$record\.([a-zA-Z0-9_.]+)/g, (_, path) => {
                // Validate path contains only safe characters
                if (!/^[a-zA-Z0-9_.]+$/.test(path)) {
                    throw new Error('Invalid path in $record reference');
                }
                return `record_${path.replace(/\./g, '_')}`;
            });

        // Build context with resolved values
        const context: Record<string, unknown> = { value };

        // Extract and resolve all $record references
        const recordRefPattern = /\$record\.([a-zA-Z0-9_.]+)/g;
        let match;
        while ((match = recordRefPattern.exec(config.condition)) !== null) {
            const path = match[1];
            const contextKey = `record_${path.replace(/\./g, '_')}`;
            context[contextKey] = getNestedValue(record, path);
        }

        // Use SafeEvaluator for secure execution
        const evaluator = getDefaultEvaluator();
        const result = evaluator.evaluate<boolean>(condition, context);

        if (!result.success) {
            throw new Error(result.error || 'Evaluation failed');
        }

        return result.value ? config.then : (config.else ?? null);
    } catch {
        // Fail closed - return else value or original
        return config.else ?? value;
    }
}

/**
 * Apply custom transform with expression using SafeEvaluator
 */
export function applyCustomTransform(
    value: JsonValue,
    config: NonNullable<MapperTransformConfig['custom']>,
    record: JsonObject,
): JsonValue {
    try {
        const expr = config.expression;

        // Length check to prevent DoS
        if (expr.length > MAX_EXPRESSION_LENGTH) {
            throw new Error('Expression too long');
        }

        // Use SafeEvaluator for secure execution
        const evaluator = getDefaultEvaluator();
        const result = evaluator.evaluate<JsonValue>(expr, { value, record });

        if (!result.success) {
            throw new Error(result.error || 'Evaluation failed');
        }

        return result.value ?? value;
    } catch {
        // Fail closed - return original value
        return value;
    }
}

/**
 * Coalesce - return first non-null value
 * Uses canonical implementation when fields and record are provided
 */
export function coalesce(...values: JsonValue[]): JsonValue {
    for (const value of values) {
        if (value !== null && value !== undefined) {
            return value;
        }
    }
    return null;
}

/**
 * If-then-else helper
 */
export function ifThenElse<T>(condition: boolean, thenValue: T, elseValue: T): T {
    return condition ? thenValue : elseValue;
}

/**
 * Null check
 */
export function isNull(value: JsonValue | undefined): boolean {
    return value === null || value === undefined;
}

// Re-export isEmpty from shared utils for consumers of this module
export { isEmpty };

/**
 * Default value if empty
 * Uses canonical implementation
 */
export function defaultIfEmpty<T extends JsonValue>(value: T | null | undefined, defaultValue: T): T {
    const result = applyDefaultCanonical(value as JsonValue, { defaultValue });
    return result as T;
}

export {
    applyIfElseCanonical as applyIfElse,
    applyCoalesceCanonical as applyCoalesce,
    applyDefaultCanonical as applyDefault,
};
