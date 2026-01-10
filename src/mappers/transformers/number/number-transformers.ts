/**
 * Number Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { TransformConfig } from '../../services/field-mapper.service';

/**
 * Apply math transform
 */
export function applyMathTransform(
    value: JsonValue,
    config: NonNullable<TransformConfig['math']>,
): number {
    let num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num)) num = 0;

    const operand = config.operand ?? 0;

    switch (config.operation) {
        case 'add':
            num = num + operand;
            break;
        case 'subtract':
            num = num - operand;
            break;
        case 'multiply':
            num = num * operand;
            break;
        case 'divide':
            num = operand !== 0 ? num / operand : 0;
            break;
        case 'round':
            num = Math.round(num);
            break;
        case 'floor':
            num = Math.floor(num);
            break;
        case 'ceil':
            num = Math.ceil(num);
            break;
        case 'abs':
            num = Math.abs(num);
            break;
    }

    if (config.precision !== undefined) {
        num = parseFloat(num.toFixed(config.precision));
    }

    return num;
}

/**
 * Parse a string to number, handling currency formats
 */
export function parseNumber(value: JsonValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        // Handle currency strings by removing non-numeric chars except . and -
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    return Number(value);
}

/**
 * Convert currency amount to minor units (cents)
 */
export function toMinorUnits(amount: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals);
    return Math.round(amount * multiplier);
}

/**
 * Convert minor units (cents) to major units
 */
export function fromMinorUnits(amount: number, decimals: number = 2): number {
    const divisor = Math.pow(10, decimals);
    return amount / divisor;
}
