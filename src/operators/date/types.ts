import { BaseOperatorConfig } from '../types';

export interface DateFormatOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly format: string;
    readonly inputFormat?: string;
    readonly timezone?: string;
}

export interface DateParseOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly format: string;
    readonly timezone?: string;
}

export type DateUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export interface DateAddOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly amount: number;
    readonly unit: DateUnit;
}

/**
 * Configuration for calculating the difference between two dates.
 */
export interface DateDiffOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the start date */
    readonly startDate: string;
    /** Source field path containing the end date */
    readonly endDate: string;
    /** Target field path for the result */
    readonly target: string;
    /** Unit for the result (seconds, minutes, hours, days, weeks, months, years) */
    readonly unit: DateUnit;
    /** Whether to return absolute value (no negative numbers). Default: false */
    readonly absolute?: boolean;
}

export type NowFormat = 'ISO' | 'timestamp' | 'date' | 'datetime' | string;

export interface NowOperatorConfig extends BaseOperatorConfig {
    /** Target field path for the current timestamp */
    readonly target: string;
    /** Output format: 'ISO', 'timestamp', 'date', 'datetime', or custom format string */
    readonly format?: NowFormat;
    /** Timezone (e.g., 'UTC', 'America/New_York'). Default: UTC */
    readonly timezone?: string;
}
