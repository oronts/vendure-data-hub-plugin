/**
 * Conditional Transform Functions
 *
 * SECURITY NOTE: These functions use `new Function()` for dynamic expression evaluation.
 * This is intentional and necessary for user-defined transform expressions in pipelines.
 *
 * Security measures in place:
 * 1. Block dangerous patterns: semicolons, braces, eval, Function, require, import
 * 2. Limit condition length to prevent DoS
 * 3. Only allow alphanumeric paths in $record.field references
 * 4. Fail closed - invalid expressions return original value
 */

import { JsonValue, JsonObject } from '../../../types/index';
import { TransformConfig } from '../../types/transform-config.types';

/** Maximum allowed expression length to prevent DoS */
const MAX_EXPRESSION_LENGTH = 1000;

/** Pattern for dangerous JavaScript constructs */
const DANGEROUS_PATTERN = /[;{}]|`|\$\{|\/\/|\/\*|\*\/|\\x|\\u/;

/** Pattern for disallowed keywords */
const DISALLOWED_KEYWORDS = /\b(eval|Function|require|import|export|class|async|await|new|this|window|document|global|process|constructor|prototype|__proto__)\b/;

/**
 * Apply conditional transform
 */
export function applyConditionalTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['conditional']>,
    record: JsonObject,
    getNestedValue: (obj: JsonObject, path: string) => JsonValue | undefined,
): JsonValue {
    try {
        // Length check to prevent DoS
        if (config.condition.length > MAX_EXPRESSION_LENGTH) {
            throw new Error('Condition too long');
        }

        // Build condition with safe substitutions
        const condition = config.condition
            .replace(/\$value/g, JSON.stringify(value))
            .replace(/\$record\.([a-zA-Z0-9_.]+)/g, (_, path) => {
                const v = getNestedValue(record, path);
                return JSON.stringify(v);
            });

        // Security validation
        if (DANGEROUS_PATTERN.test(condition) || DISALLOWED_KEYWORDS.test(condition)) {
            throw new Error('Invalid condition - contains disallowed patterns');
        }

        // eslint-disable-next-line no-new-func -- Required for dynamic expression evaluation (security validated above)
        const result = new Function(`return ${condition}`)();
        return result ? config.then : (config.else ?? null);
    } catch {
        // Fail closed - return else value or original
        return config.else ?? value;
    }
}

/**
 * Apply custom transform with expression
 */
export function applyCustomTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['custom']>,
    record: JsonObject,
): JsonValue {
    try {
        const expr = config.expression;

        // Length check to prevent DoS
        if (expr.length > MAX_EXPRESSION_LENGTH) {
            throw new Error('Expression too long');
        }

        // Security validation
        if (DANGEROUS_PATTERN.test(expr) || DISALLOWED_KEYWORDS.test(expr)) {
            throw new Error('Invalid expression - contains disallowed patterns');
        }

        // eslint-disable-next-line no-new-func -- Required for dynamic expression evaluation (security validated above)
        const fn = new Function('value', 'record', `return ${expr}`);
        return fn(value, record);
    } catch {
        // Fail closed - return original value
        return value;
    }
}

/**
 * Coalesce - return first non-null value
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

/**
 * Empty check (null, undefined, empty string, empty array)
 */
export function isEmpty(value: JsonValue | undefined): boolean {
    return (
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
    );
}

/**
 * Default value if empty
 */
export function defaultIfEmpty<T extends JsonValue>(value: T | null | undefined, defaultValue: T): T {
    return isEmpty(value as JsonValue | undefined) ? defaultValue : value as T;
}
