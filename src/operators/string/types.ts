import { BaseOperatorConfig } from '../types';

export interface SplitOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly delimiter: string;
    readonly trim?: boolean;
}

export interface JoinOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly delimiter: string;
}

export interface TrimOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
    readonly mode?: 'both' | 'start' | 'end';
}

export interface CaseOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
}

export interface SlugifyOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
    readonly separator?: string;
}

export interface ConcatOperatorConfig extends BaseOperatorConfig {
    readonly sources: string[];
    readonly target: string;
    readonly separator?: string;
}

export interface ReplaceOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
    readonly search: string;
    readonly replacement: string;
    readonly all?: boolean;
}

/**
 * Configuration for extracting values using regex patterns.
 */
export interface ExtractRegexOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the string to match */
    readonly source: string;
    /** Target field path for the extracted value */
    readonly target: string;
    /** Regular expression pattern (without delimiters) */
    readonly pattern: string;
    /** Capture group index to extract (0 = full match, 1+ = groups). Default: 1 */
    readonly group?: number;
    /** Regex flags (e.g., 'i' for case-insensitive). Default: '' */
    readonly flags?: string;
}

/**
 * Configuration for replacing values using regex patterns.
 */
export interface ReplaceRegexOperatorConfig extends BaseOperatorConfig {
    /** Field path containing the string to modify */
    readonly path: string;
    /** Regular expression pattern (without delimiters) */
    readonly pattern: string;
    /** Replacement string (supports $1, $2, etc. for capture groups) */
    readonly replacement: string;
    /** Regex flags (e.g., 'gi' for global case-insensitive). Default: 'g' */
    readonly flags?: string;
}

export interface StripHtmlOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing HTML string */
    readonly source: string;
    /** Target field path for the stripped text. Defaults to source. */
    readonly target?: string;
}

export interface TruncateOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the string to truncate */
    readonly source: string;
    /** Target field path for the truncated string. Defaults to source. */
    readonly target?: string;
    /** Maximum length of the resulting string */
    readonly length: number;
    /** Suffix to append when truncated (e.g., '...'). Default: '' */
    readonly suffix?: string;
}
