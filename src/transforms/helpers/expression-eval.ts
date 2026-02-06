/**
 * Expression Evaluator
 *
 * Safe expression evaluation for conditional transforms.
 * Uses pattern matching instead of eval for security.
 */

import { JsonValue, JsonObject } from '../../types/index';
import { getNestedValue as getNestedValueUtil } from '../../utils/object-path.utils';

// Re-export for backward compatibility (other modules import getNestedValue from here)
export { getNestedValue } from '../../utils/object-path.utils';

// EXPRESSION PATTERNS - extracted for reusability and testability
const EXPRESSION_PATTERNS = {
    /** Pattern for comparison operators: value === 'test', value != 5, etc. */
    COMPARISON: /^value\s*(===?|!==?|>=?|<=?)\s*(.+)$/,
    /** Pattern for includes: value.includes('text') */
    INCLUDES: /^value\.includes\(['"](.+)['"]\)$/,
    /** Pattern for startsWith: value.startsWith('prefix') */
    STARTS_WITH: /^value\.startsWith\(['"](.+)['"]\)$/,
    /** Pattern for endsWith: value.endsWith('suffix') */
    ENDS_WITH: /^value\.endsWith\(['"](.+)['"]\)$/,
    /** Pattern for length comparison: value.length > 5 */
    LENGTH: /^value\.length\s*(>|>=|<|<=|===?|!==?)\s*(\d+)$/,
    /** Pattern for record field access with comparison */
    RECORD_FIELD: /^record\.([a-zA-Z0-9_.]+)\s*(===?|!==?|>=?|<=?)\s*(.+)$/,
    /** Pattern for substring extraction: value.substring(0, 5) */
    SUBSTRING: /^value\.substring\((\d+)(?:,\s*(\d+))?\)$/,
    /** Pattern for split: value.split(',') */
    SPLIT: /^value\.split\(['"](.+)['"]\)$/,
    /** Pattern for array index access: value[0] */
    ARRAY_INDEX: /^value\[(\d+)\]$/,
    /** Pattern for math operations: value + 5 */
    MATH: /^value\s*([+\-*/])\s*(\d+(?:\.\d+)?)$/,
    /** Pattern for ternary expressions */
    TERNARY: /^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/,
    /** Pattern for numeric values */
    NUMERIC: /^-?\d+(\.\d+)?$/,
} as const;

// UTILITY FUNCTIONS
// Note: getNestedValue is imported from utils/object-path.utils.ts (canonical implementation)

/**
 * Parse a condition value from string
 * Converts string representations to typed values
 *
 * @param str - The string to parse
 * @returns Parsed value as JsonValue
 */
export function parseConditionValue(str: string): JsonValue {
    // Handle null/undefined keywords
    if (str === 'null' || str === 'undefined') return null;

    // Handle boolean keywords
    if (str === 'true') return true;
    if (str === 'false') return false;

    // Handle numeric values
    if (EXPRESSION_PATTERNS.NUMERIC.test(str)) return parseFloat(str);

    // Handle quoted strings (single or double quotes)
    if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
        return str.slice(1, -1);
    }

    return str;
}

// CONDITION EVALUATION

/**
 * Evaluate comparison between two values
 *
 * @param leftValue - The left operand
 * @param operator - The comparison operator
 * @param rightValue - The right operand (parsed)
 * @returns Comparison result
 */
function evaluateComparison(leftValue: JsonValue, operator: string, rightValue: JsonValue): boolean {
    switch (operator) {
        case '==':
        case '===':
            return leftValue === rightValue;
        case '!=':
        case '!==':
            return leftValue !== rightValue;
        case '>':
            return typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue > rightValue;
        case '>=':
            return typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue >= rightValue;
        case '<':
            return typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue < rightValue;
        case '<=':
            return typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue <= rightValue;
        default:
            return false;
    }
}

/**
 * Evaluate length-based comparison
 *
 * @param len - The length to compare
 * @param operator - The comparison operator
 * @param num - The number to compare against
 * @returns Comparison result
 */
function evaluateLengthComparison(len: number, operator: string, num: number): boolean {
    switch (operator) {
        case '>': return len > num;
        case '>=': return len >= num;
        case '<': return len < num;
        case '<=': return len <= num;
        case '==':
        case '===': return len === num;
        case '!=':
        case '!==': return len !== num;
        default: return false;
    }
}

/**
 * Evaluate a condition expression
 * Uses pattern matching for safe evaluation
 *
 * @param condition - The condition string to evaluate
 * @param value - The current value being evaluated
 * @param record - Optional record context for field access
 * @returns True if condition is met, false otherwise
 */
export function evaluateCondition(condition: string, value: JsonValue, record?: JsonObject): boolean {
    try {
        const trimmedCondition = condition.trim();

        // Handle null/undefined checks
        if (trimmedCondition === 'value != null' || trimmedCondition === 'value !== null') {
            return value !== null && value !== undefined;
        }
        if (trimmedCondition === 'value == null' || trimmedCondition === 'value === null') {
            return value === null || value === undefined;
        }

        // Handle comparison operators
        const comparisonMatch = trimmedCondition.match(EXPRESSION_PATTERNS.COMPARISON);
        if (comparisonMatch) {
            const [, operator, compareValue] = comparisonMatch;
            const parsedCompare = parseConditionValue(compareValue.trim());
            return evaluateComparison(value, operator, parsedCompare);
        }

        // Handle includes check
        if (trimmedCondition.startsWith('value.includes(')) {
            const searchMatch = trimmedCondition.match(EXPRESSION_PATTERNS.INCLUDES);
            if (searchMatch && typeof value === 'string') {
                return value.includes(searchMatch[1]);
            }
            return false;
        }

        // Handle startsWith
        if (trimmedCondition.startsWith('value.startsWith(')) {
            const searchMatch = trimmedCondition.match(EXPRESSION_PATTERNS.STARTS_WITH);
            if (searchMatch && typeof value === 'string') {
                return value.startsWith(searchMatch[1]);
            }
            return false;
        }

        // Handle endsWith
        if (trimmedCondition.startsWith('value.endsWith(')) {
            const searchMatch = trimmedCondition.match(EXPRESSION_PATTERNS.ENDS_WITH);
            if (searchMatch && typeof value === 'string') {
                return value.endsWith(searchMatch[1]);
            }
            return false;
        }

        // Handle length check
        const lengthMatch = trimmedCondition.match(EXPRESSION_PATTERNS.LENGTH);
        if (lengthMatch && (typeof value === 'string' || Array.isArray(value))) {
            const [, op, numberString] = lengthMatch;
            const num = parseInt(numberString, 10);
            return evaluateLengthComparison(value.length, op, num);
        }

        // Handle record field access
        if (trimmedCondition.startsWith('record.') && record != null) {
            const fieldMatch = trimmedCondition.match(EXPRESSION_PATTERNS.RECORD_FIELD);
            if (fieldMatch) {
                const [, fieldPath, operator, compareValue] = fieldMatch;
                const fieldValue = getNestedValueUtil(record, fieldPath) ?? null;
                const parsedCompare = parseConditionValue(compareValue.trim());
                return evaluateComparison(fieldValue, operator, parsedCompare);
            }
        }

        // Default: treat as truthy check
        return Boolean(value);
    } catch (error) {
        // Condition evaluation failed - return false as fallback
        // Debug log for troubleshooting invalid condition expressions
        console.debug('[ExpressionEval] Condition evaluation failed', {
            error: error instanceof Error ? error.message : String(error),
            condition,
            valueType: typeof value,
        });
        return false;
    }
}

// EXPRESSION EVALUATION

/**
 * Evaluate string methods on a value
 *
 * @param expression - The expression to evaluate
 * @param value - The string value
 * @returns String operation result
 */
function evaluateStringMethod(expression: string, value: string): JsonValue | undefined {
    if (expression === 'value.toUpperCase()') return value.toUpperCase();
    if (expression === 'value.toLowerCase()') return value.toLowerCase();
    if (expression === 'value.trim()') return value.trim();
    if (expression === 'value.length') return value.length;

    // Handle substring
    const substrMatch = expression.match(EXPRESSION_PATTERNS.SUBSTRING);
    if (substrMatch) {
        const start = parseInt(substrMatch[1], 10);
        const end = substrMatch[2] ? parseInt(substrMatch[2], 10) : undefined;
        return value.substring(start, end);
    }

    // Handle split
    const splitMatch = expression.match(EXPRESSION_PATTERNS.SPLIT);
    if (splitMatch) {
        return value.split(splitMatch[1]);
    }

    return undefined;
}

/**
 * Evaluate array methods on a value
 *
 * @param expression - The expression to evaluate
 * @param value - The array value
 * @returns Array operation result
 */
function evaluateArrayMethod(expression: string, value: JsonValue[]): JsonValue | undefined {
    if (expression === 'value.length') return value.length;
    if (expression === 'value[0]') return value[0] ?? null;
    if (expression === 'value.join(",")' || expression === "value.join(',')") return value.join(',');

    const indexMatch = expression.match(EXPRESSION_PATTERNS.ARRAY_INDEX);
    if (indexMatch) {
        const index = parseInt(indexMatch[1], 10);
        return value[index] ?? null;
    }

    return undefined;
}

/**
 * Evaluate math operations on a value
 *
 * @param expression - The expression to evaluate
 * @param value - The numeric value
 * @returns Math operation result
 */
function evaluateMathOperation(expression: string, value: number): JsonValue | undefined {
    const mathMatch = expression.match(EXPRESSION_PATTERNS.MATH);
    if (mathMatch) {
        const [, op, numberString] = mathMatch;
        const num = parseFloat(numberString);
        switch (op) {
            case '+': return value + num;
            case '-': return value - num;
            case '*': return value * num;
            case '/': return num !== 0 ? value / num : null;
        }
    }
    return undefined;
}

/**
 * Evaluate an expression
 * Supports common data transformation patterns safely
 *
 * @param expression - The expression string to evaluate
 * @param value - The current value being transformed
 * @param record - Optional record context for field access
 * @returns Expression evaluation result
 */
export function evaluateExpression(expression: string, value: JsonValue, record?: JsonObject): JsonValue {
    try {
        const trimmedExpr = expression.trim();

        // Handle value reference
        if (trimmedExpr === 'value') return value;

        // Handle record field access
        if (trimmedExpr.startsWith('record.') && record != null) {
            const fieldPath = trimmedExpr.substring(7);
            return getNestedValueUtil(record, fieldPath) ?? null;
        }

        // Handle string methods
        if (trimmedExpr.startsWith('value.') && typeof value === 'string') {
            const result = evaluateStringMethod(trimmedExpr, value);
            if (result !== undefined) return result;
        }

        // Handle array methods
        if (trimmedExpr.startsWith('value.') && Array.isArray(value)) {
            const result = evaluateArrayMethod(trimmedExpr, value);
            if (result !== undefined) return result;
        }

        // Handle array index access (value[n])
        if (Array.isArray(value)) {
            const indexMatch = trimmedExpr.match(EXPRESSION_PATTERNS.ARRAY_INDEX);
            if (indexMatch) {
                const index = parseInt(indexMatch[1], 10);
                return value[index] ?? null;
            }
        }

        // Handle math operations
        if (typeof value === 'number') {
            const result = evaluateMathOperation(trimmedExpr, value);
            if (result !== undefined) return result;
        }

        // Handle ternary expressions: condition ? thenValue : elseValue
        const ternaryMatch = trimmedExpr.match(EXPRESSION_PATTERNS.TERNARY);
        if (ternaryMatch) {
            const [, condition, thenExpr, elseExpr] = ternaryMatch;
            const condResult = evaluateCondition(condition.trim(), value, record);
            return condResult
                ? parseConditionValue(thenExpr.trim())
                : parseConditionValue(elseExpr.trim());
        }

        // Handle template strings with ${} placeholders
        if (trimmedExpr.includes('${') && record != null) {
            return interpolateTemplateExpression(trimmedExpr, record, value);
        }

        // Return value unchanged if expression not recognized
        return value;
    } catch (error) {
        // Expression evaluation failed - return original value
        // Debug log for troubleshooting invalid expressions
        console.debug('[ExpressionEval] Expression evaluation failed', {
            error: error instanceof Error ? error.message : String(error),
            expression,
            valueType: typeof value,
        });
        return value;
    }
}

/**
 * Interpolate template expression with record values
 * Internal helper for expression evaluation
 */
function interpolateTemplateExpression(template: string, record: JsonObject, currentValue: JsonValue): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        if (path === 'value') return String(currentValue ?? '');
        const value = getNestedValueUtil(record, path);
        return String(value ?? '');
    });
}
