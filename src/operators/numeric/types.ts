import { BaseOperatorConfig } from '../types';
import type { UnitType } from '../../sdk/types/transform-types';

export type MathOperation =
    | 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo' | 'power'
    | 'round' | 'floor' | 'ceil' | 'abs';

export interface MathOperatorConfig extends BaseOperatorConfig {
    readonly operation: MathOperation;
    readonly source: string;
    readonly operand?: string;
    readonly target: string;
    readonly decimals?: number;
}

export type RoundingMode = 'round' | 'floor' | 'ceil';

export interface CurrencyOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly decimals: number;
    readonly round?: RoundingMode;
}

/**
 * Re-exported from SDK transform-types.ts (canonical, includes temperature units).
 * @see src/sdk/types/transform-types.ts UnitType
 */
export type { UnitType };

export interface UnitOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly from: UnitType;
    readonly to: UnitType;
}

export interface ToNumberOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
    readonly default?: number;
}

export interface ToStringOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
}

/**
 * Configuration for parsing numbers with locale support.
 */
export interface ParseNumberOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the string to parse */
    readonly source: string;
    /** Target field path for the parsed number */
    readonly target?: string;
    /** Locale for parsing (e.g., 'en-US', 'de-DE'). Affects decimal/thousand separators */
    readonly locale?: string;
    /** Default value if parsing fails */
    readonly default?: number;
}

/**
 * Configuration for formatting numbers with locale/currency support.
 */
export interface FormatNumberOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the number */
    readonly source: string;
    /** Target field path for the formatted string */
    readonly target: string;
    /** Locale for formatting (e.g., 'en-US', 'de-DE') */
    readonly locale?: string;
    /** Number of decimal places */
    readonly decimals?: number;
    /** Currency code (e.g., 'USD', 'EUR') for currency formatting */
    readonly currency?: string;
    /** Format style: 'decimal', 'currency', 'percent' */
    readonly style?: 'decimal' | 'currency' | 'percent';
    /** Whether to use grouping separators (thousands) */
    readonly useGrouping?: boolean;
}

export interface ToCentsOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the decimal amount (e.g., 19.99) */
    readonly source: string;
    /** Target field path for the cents amount (e.g., 1999) */
    readonly target: string;
    /** Rounding mode: 'round', 'floor', 'ceil'. Default: 'round' */
    readonly round?: RoundingMode;
}

export interface RoundOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the number to round */
    readonly source: string;
    /** Target field path for the rounded number. Defaults to source. */
    readonly target?: string;
    /** Number of decimal places. Default: 0 */
    readonly decimals?: number;
    /** Rounding mode: 'round', 'floor', 'ceil'. Default: 'round' */
    readonly mode?: RoundingMode;
}
