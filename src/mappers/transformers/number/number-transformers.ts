/**
 * Number Transform Functions
 */

import { JsonValue } from '../../../types/index';
import { TransformConfig } from '../../services/field-mapper.service';

// Import canonical implementations for individual operations
import {
    applyParseNumber as applyParseNumberCanonical,
    applyRound as applyRoundCanonical,
    applyFloor as applyFloorCanonical,
    applyCeil as applyCeilCanonical,
    applyAbs as applyAbsCanonical,
    applyToCents as applyToCentsCanonical,
    applyFromCents as applyFromCentsCanonical,
} from '../../../transforms/field/number-transforms';

export const parseNumberCanonical = applyParseNumberCanonical;
export const toMinorUnitsCanonical = applyToCentsCanonical;
export const fromMinorUnitsCanonical = applyFromCentsCanonical;

/**
 * Apply math transform.
 * Accepts lowercase operations from mapper's TransformConfig
 * and uses canonical functions where applicable.
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
            num = applyRoundCanonical(num, { precision: 0 }) as number;
            break;
        case 'floor':
            num = applyFloorCanonical(num) as number;
            break;
        case 'ceil':
            num = applyCeilCanonical(num) as number;
            break;
        case 'abs':
            num = applyAbsCanonical(num) as number;
            break;
    }

    if (config.precision !== undefined) {
        num = applyRoundCanonical(num, { precision: config.precision }) as number;
    }

    return num;
}

/**
 * Parse a string to number, handling currency formats
 */
export function parseNumber(value: JsonValue): number {
    const result = applyParseNumberCanonical(value);
    return typeof result === 'number' ? result : 0;
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
