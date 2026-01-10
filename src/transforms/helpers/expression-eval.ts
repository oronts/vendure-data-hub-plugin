/**
 * Expression Evaluator
 *
 * Safe expression evaluation for conditional transforms.
 * Uses pattern matching instead of eval for security.
 */

import { JsonValue, JsonObject } from '../../types/index';

// UTILITY FUNCTIONS

/**
 * Get nested value from object using dot notation path
 * Handles null/undefined gracefully at any level
 */
export function getNestedValue(obj: JsonObject, path: string): JsonValue {
    const parts = path.split('.');
    let current: any = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = current[part];
    }
    return current ?? null;
}

/**
 * Parse a condition value from string
 * Converts string representations to typed values
 */
export function parseConditionValue(str: string): JsonValue {
    if (str === 'null' || str === 'undefined') return null;
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
    if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
        return str.slice(1, -1);
    }
    return str;
}

// CONDITION EVALUATION

/**
 * Evaluate a condition expression
 * Uses pattern matching for safe evaluation
 */
export function evaluateCondition(condition: string, value: JsonValue, record?: JsonObject): boolean {
    try {
        condition = condition.trim();

        // Handle null/undefined checks
        if (condition === 'value != null' || condition === 'value !== null') {
            return value !== null && value !== undefined;
        }
        if (condition === 'value == null' || condition === 'value === null') {
            return value === null || value === undefined;
        }

        // Handle comparison operators
        const comparisonMatch = condition.match(/^value\s*(===?|!==?|>=?|<=?)\s*(.+)$/);
        if (comparisonMatch) {
            const [, operator, compareValue] = comparisonMatch;
            const parsedCompare = parseConditionValue(compareValue.trim());

            switch (operator) {
                case '==':
                case '===':
                    return value === parsedCompare;
                case '!=':
                case '!==':
                    return value !== parsedCompare;
                case '>':
                    return typeof value === 'number' && typeof parsedCompare === 'number' && value > parsedCompare;
                case '>=':
                    return typeof value === 'number' && typeof parsedCompare === 'number' && value >= parsedCompare;
                case '<':
                    return typeof value === 'number' && typeof parsedCompare === 'number' && value < parsedCompare;
                case '<=':
                    return typeof value === 'number' && typeof parsedCompare === 'number' && value <= parsedCompare;
            }
        }

        // Handle includes check
        if (condition.startsWith('value.includes(')) {
            const searchMatch = condition.match(/^value\.includes\(['"](.+)['"]\)$/);
            if (searchMatch && typeof value === 'string') {
                return value.includes(searchMatch[1]);
            }
        }

        // Handle startsWith/endsWith
        if (condition.startsWith('value.startsWith(')) {
            const searchMatch = condition.match(/^value\.startsWith\(['"](.+)['"]\)$/);
            if (searchMatch && typeof value === 'string') {
                return value.startsWith(searchMatch[1]);
            }
        }
        if (condition.startsWith('value.endsWith(')) {
            const searchMatch = condition.match(/^value\.endsWith\(['"](.+)['"]\)$/);
            if (searchMatch && typeof value === 'string') {
                return value.endsWith(searchMatch[1]);
            }
        }

        // Handle length check
        if (condition.match(/^value\.length\s*(>|>=|<|<=|===?|!==?)\s*\d+$/)) {
            if (typeof value === 'string' || Array.isArray(value)) {
                const match = condition.match(/^value\.length\s*(>|>=|<|<=|===?|!==?)\s*(\d+)$/);
                if (match) {
                    const [, op, numStr] = match;
                    const num = parseInt(numStr, 10);
                    const len = value.length;
                    switch (op) {
                        case '>': return len > num;
                        case '>=': return len >= num;
                        case '<': return len < num;
                        case '<=': return len <= num;
                        case '==':
                        case '===': return len === num;
                        case '!=':
                        case '!==': return len !== num;
                    }
                }
            }
        }

        // Handle record field access
        if (condition.startsWith('record.')) {
            const fieldMatch = condition.match(/^record\.([a-zA-Z0-9_.]+)\s*(===?|!==?|>=?|<=?)\s*(.+)$/);
            if (fieldMatch && record) {
                const [, fieldPath, operator, compareValue] = fieldMatch;
                const fieldValue = getNestedValue(record, fieldPath);
                const parsedCompare = parseConditionValue(compareValue.trim());

                switch (operator) {
                    case '==':
                    case '===':
                        return fieldValue === parsedCompare;
                    case '!=':
                    case '!==':
                        return fieldValue !== parsedCompare;
                    case '>':
                        return typeof fieldValue === 'number' && typeof parsedCompare === 'number' && fieldValue > parsedCompare;
                    case '>=':
                        return typeof fieldValue === 'number' && typeof parsedCompare === 'number' && fieldValue >= parsedCompare;
                    case '<':
                        return typeof fieldValue === 'number' && typeof parsedCompare === 'number' && fieldValue < parsedCompare;
                    case '<=':
                        return typeof fieldValue === 'number' && typeof parsedCompare === 'number' && fieldValue <= parsedCompare;
                }
            }
        }

        // Default: treat as truthy check
        return Boolean(value);
    } catch {
        return false;
    }
}

// EXPRESSION EVALUATION

/**
 * Evaluate an expression
 * Supports common data transformation patterns safely
 */
export function evaluateExpression(expression: string, value: JsonValue, record?: JsonObject): JsonValue {
    try {
        expression = expression.trim();

        // Handle value reference
        if (expression === 'value') return value;

        // Handle record field access
        if (expression.startsWith('record.') && record) {
            const fieldPath = expression.substring(7);
            return getNestedValue(record, fieldPath);
        }

        // Handle string methods
        if (expression.startsWith('value.') && typeof value === 'string') {
            if (expression === 'value.toUpperCase()') return value.toUpperCase();
            if (expression === 'value.toLowerCase()') return value.toLowerCase();
            if (expression === 'value.trim()') return value.trim();
            if (expression === 'value.length') return value.length;

            // Handle substring
            const substrMatch = expression.match(/^value\.substring\((\d+)(?:,\s*(\d+))?\)$/);
            if (substrMatch) {
                const start = parseInt(substrMatch[1], 10);
                const end = substrMatch[2] ? parseInt(substrMatch[2], 10) : undefined;
                return value.substring(start, end);
            }

            // Handle split
            const splitMatch = expression.match(/^value\.split\(['"](.+)['"]\)$/);
            if (splitMatch) {
                return value.split(splitMatch[1]);
            }
        }

        // Handle array methods
        if (expression.startsWith('value.') && Array.isArray(value)) {
            if (expression === 'value.length') return value.length;
            if (expression === 'value[0]') return value[0] ?? null;
            if (expression === 'value.join(",")' || expression === "value.join(',')") return value.join(',');

            const indexMatch = expression.match(/^value\[(\d+)\]$/);
            if (indexMatch) {
                const index = parseInt(indexMatch[1], 10);
                return value[index] ?? null;
            }
        }

        // Handle math operations
        if (typeof value === 'number') {
            const mathMatch = expression.match(/^value\s*([+\-*/])\s*(\d+(?:\.\d+)?)$/);
            if (mathMatch) {
                const [, op, numStr] = mathMatch;
                const num = parseFloat(numStr);
                switch (op) {
                    case '+': return value + num;
                    case '-': return value - num;
                    case '*': return value * num;
                    case '/': return num !== 0 ? value / num : null;
                }
            }
        }

        // Handle ternary expressions: condition ? thenValue : elseValue
        const ternaryMatch = expression.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
        if (ternaryMatch) {
            const [, condition, thenExpr, elseExpr] = ternaryMatch;
            const condResult = evaluateCondition(condition.trim(), value, record);
            return condResult
                ? parseConditionValue(thenExpr.trim())
                : parseConditionValue(elseExpr.trim());
        }

        // Handle template strings with ${} placeholders
        if (expression.includes('${') && record) {
            return interpolateTemplateExpression(expression, record, value);
        }

        // Return value unchanged if expression not recognized
        return value;
    } catch {
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
        const value = getNestedValue(record, path);
        return String(value ?? '');
    });
}
