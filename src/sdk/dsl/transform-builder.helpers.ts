import type { OperatorConfig } from './step-configs';
import { validateRegexSafety } from '../../utils/safe-regex.utils';
import {
    validateNonEmptyArray,
    validateNonEmptyString,
} from './validation-helpers';

export function createOperator(
    op: string,
    args: Record<string, unknown>,
): OperatorConfig {
    return { op, args: structuredClone(args) };
}

export function validateStringArray(values: string[], fieldName: string): void {
    validateNonEmptyArray(values, fieldName);
    values.forEach((value, index) => {
        validateNonEmptyString(value, `${fieldName}[${index}]`);
    });
}

export function validateOptionalString(value: string | undefined, fieldName: string): void {
    if (value !== undefined) {
        validateNonEmptyString(value, fieldName);
    }
}

export function validateRegex(pattern: string, flags = ''): void {
    const result = validateRegexSafety(pattern);
    if (!result.safe) {
        throw new Error(`Pattern is unsafe: ${result.reason}`);
    }
    try {
        new RegExp(pattern, flags);
    } catch {
        throw new Error('Pattern or flags are invalid');
    }
}

export function validateNonNegativeInteger(value: number, fieldName: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative integer`);
    }
}
