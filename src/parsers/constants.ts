/**
 * Parser constants for file parsing operations
 */

/** Default encoding for file operations */
export const DEFAULT_ENCODING = 'utf-8';

/** CSV parsing defaults */
export const CSV_DEFAULTS = {
    DELIMITER: ',',
    QUOTE_CHAR: '"',
    ESCAPE_CHAR: '"',
} as const;

/** Common CSV delimiters for auto-detection */
export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;

/** Values considered as null during parsing */
export const NULL_VALUES = ['null', 'na', 'n/a', '-', '', 'nil'] as const;

/** Boolean true value representations */
export const BOOLEAN_TRUE_VALUES = ['true', 'yes', '1', 'on', 'y'] as const;

/** Boolean false value representations */
export const BOOLEAN_FALSE_VALUES = ['false', 'no', '0', 'off', 'n'] as const;

/** XML defaults */
export const XML_DEFAULTS = {
    ROOT_ELEMENT: 'root',
    RECORD_ELEMENT: 'item',
    ATTRIBUTE_PREFIX: '@',
    DECLARATION: '<?xml version="1.0" encoding="UTF-8"?>',
} as const;

/** JSON defaults */
export const JSON_DEFAULTS = {
    FLATTEN_DELIMITER: '.',
    INDENT: 2,
} as const;

/** File signature magic numbers */
export const FILE_SIGNATURES = {
    ZIP: [0x50, 0x4b, 0x03, 0x04] as const,
    BIFF: [0xd0, 0xcf, 0x11, 0xe0] as const,
} as const;
