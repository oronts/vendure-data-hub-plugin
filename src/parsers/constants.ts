/**
 * Parser constants for file parsing operations
 */

/** CSV parsing defaults */
export const CSV_DEFAULTS = {
    DELIMITER: ',',
    QUOTE_CHAR: '"',
    ESCAPE_CHAR: '"',
} as const;

/** Values considered as null during parsing */
export const NULL_VALUES = ['null', 'na', 'n/a', '-', '', 'nil'] as const;

/** Boolean true value representations */
export const BOOLEAN_TRUE_VALUES = ['true', 'yes', '1', 'on', 'y'] as const;

/** Boolean false value representations */
export const BOOLEAN_FALSE_VALUES = ['false', 'no', '0', 'off', 'n'] as const;
