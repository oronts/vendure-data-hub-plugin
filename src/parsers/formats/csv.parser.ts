/**
 * DataHub Parsers - CSV Parser
 *
 * Parses CSV and TSV files with header detection, delimiter inference,
 * and proper quote handling.
 */

import * as Papa from 'papaparse';
import {
    ParseResult,
    ParseError,
    CsvParseOptions,
    CsvDelimiter,
} from '../types';
import { removeBom, detectLineEnding } from '../helpers/encoding';
import { FileFormat } from '../../constants/enums';
import {
    CSV_DEFAULTS as PARSER_CSV_DEFAULTS,
    NULL_VALUES,
    BOOLEAN_TRUE_VALUES,
    BOOLEAN_FALSE_VALUES,
} from '../constants';

/**
 * Default CSV options
 */
const CSV_DEFAULTS: Required<Omit<CsvParseOptions, 'preview' | 'headers' | 'lineEnding'>> = {
    delimiter: PARSER_CSV_DEFAULTS.DELIMITER as CsvDelimiter,
    header: true,
    skipEmptyLines: true,
    encoding: 'utf-8',
    quoteChar: PARSER_CSV_DEFAULTS.QUOTE_CHAR,
    escapeChar: PARSER_CSV_DEFAULTS.ESCAPE_CHAR,
};

/**
 * Supported delimiters for auto-detection
 */
const DELIMITERS: CsvDelimiter[] = [',', ';', '\t', '|'];

/**
 * Detect CSV delimiter from content
 *
 * @param content - CSV content to analyze
 * @param sampleLines - Number of lines to sample (default: 5)
 * @returns Most likely delimiter
 */
export function detectDelimiter(content: string, sampleLines: number = 5): CsvDelimiter {
    const lines = content.split('\n').slice(0, sampleLines);

    if (lines.length === 0) {
        return ',';
    }

    const counts: Record<string, number[]> = {};
    for (const delimiter of DELIMITERS) {
        counts[delimiter] = lines.map(line => line.split(delimiter).length);
    }

    // Find delimiter with most consistent count > 1
    let bestDelimiter: CsvDelimiter = ',';
    let bestScore = 0;

    for (const [delimiter, lineCounts] of Object.entries(counts)) {
        const minCount = Math.min(...lineCounts);
        const maxCount = Math.max(...lineCounts);

        // Consistent and more than 1 column
        if (minCount > 1 && minCount === maxCount) {
            if (minCount > bestScore) {
                bestScore = minCount;
                bestDelimiter = delimiter as CsvDelimiter;
            }
        }
    }

    return bestDelimiter;
}

/**
 * Parse a single CSV line respecting quotes
 *
 * @param line - Line to parse
 * @param delimiter - Column delimiter
 * @param quoteChar - Quote character
 * @param escapeChar - Escape character
 * @returns Array of field values
 */
export function parseCsvLine(
    line: string,
    delimiter: string = ',',
    quoteChar: string = '"',
    escapeChar: string = '"',
): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
            if (char === escapeChar && nextChar === quoteChar) {
                current += quoteChar;
                i += 2;
            } else if (char === quoteChar) {
                inQuotes = false;
                i++;
            } else {
                current += char;
                i++;
            }
        } else {
            if (char === quoteChar) {
                inQuotes = true;
                i++;
            } else if (char === delimiter) {
                values.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
    }

    values.push(current.trim());
    return values;
}

/**
 * Parse CSV content using PapaParse
 *
 * @param content - CSV content as string
 * @param options - CSV parse options
 * @returns Parse result with records
 */
export function parseCsv(
    content: string,
    options: CsvParseOptions = {},
): ParseResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
        // Clean content
        const cleanContent = removeBom(content);

        // Auto-detect delimiter if not specified
        const delimiter = options.delimiter || detectDelimiter(cleanContent);

        // Use PapaParse for robust parsing
        const result = Papa.parse(cleanContent, {
            delimiter: delimiter || '',
            header: options.header !== false,
            skipEmptyLines: options.skipEmptyLines !== false,
            preview: options.preview,
            transformHeader: (header: string) => header.trim(),
            transform: (value: string) => value.trim(),
        });

        // Convert PapaParse errors
        if (result.errors?.length) {
            for (const err of result.errors) {
                errors.push({
                    row: err.row,
                    message: err.message,
                    code: err.code,
                });
            }
        }

        const records = result.data as Record<string, unknown>[];
        const fields = result.meta?.fields ?? Object.keys(records[0] ?? {});

        // Check for duplicate headers
        const headerCounts = new Map<string, number>();
        for (const field of fields) {
            const count = (headerCounts.get(field) ?? 0) + 1;
            headerCounts.set(field, count);
            if (count > 1) {
                warnings.push(`Duplicate column header: "${field}"`);
            }
        }

        // Check for empty headers
        if (fields.some(f => f === '' || f === undefined)) {
            warnings.push('One or more columns have empty headers');
        }

        return {
            success: errors.filter(e => e.code !== 'TooFewFields' && e.code !== 'TooManyFields').length === 0,
            format: FileFormat.CSV,
            records,
            fields,
            totalRows: records.length,
            errors,
            warnings,
            meta: {
                delimiter: result.meta?.delimiter,
            },
        };
    } catch (err) {
        return {
            success: false,
            format: FileFormat.CSV,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [{ message: err instanceof Error ? err.message : 'Failed to parse CSV' }],
            warnings: [],
        };
    }
}

/**
 * Parse CSV content without using PapaParse (custom implementation)
 * Useful for more control or when PapaParse is not available.
 *
 * @param content - CSV content as string
 * @param options - CSV parse options
 * @returns Parse result with records
 */
export function parseCsvManual(
    content: string,
    options: CsvParseOptions = {},
): ParseResult {
    const delimiter = options.delimiter ?? detectDelimiter(content);
    const lineEnding = options.lineEnding ?? detectLineEnding(content);
    const quoteChar = options.quoteChar ?? CSV_DEFAULTS.quoteChar;
    const escapeChar = options.escapeChar ?? CSV_DEFAULTS.escapeChar;
    const hasHeaders = options.header ?? CSV_DEFAULTS.header;

    const cleanContent = removeBom(content);
    const lines = cleanContent.split(lineEnding).filter(line => line.trim().length > 0);
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: Record<string, unknown>[] = [];

    if (lines.length === 0) {
        return {
            success: true,
            format: FileFormat.CSV,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [],
            warnings: ['File is empty'],
        };
    }

    // Get headers
    let headers: string[];
    let startRow = 0;

    if (hasHeaders) {
        headers = parseCsvLine(lines[0], delimiter, quoteChar, escapeChar);
        startRow = 1;
    } else if (options.headers) {
        headers = options.headers;
    } else {
        // Generate column names
        const firstLine = parseCsvLine(lines[0], delimiter, quoteChar, escapeChar);
        headers = firstLine.map((_, i) => `column_${i + 1}`);
    }

    // Parse data rows
    const limit = options.preview ?? Infinity;
    let parsedCount = 0;

    for (let i = startRow; i < lines.length && parsedCount < limit; i++) {
        try {
            const values = parseCsvLine(lines[i], delimiter, quoteChar, escapeChar);
            const record: Record<string, unknown> = {};

            for (let j = 0; j < headers.length; j++) {
                const value = values[j] ?? '';
                record[headers[j]] = parseValue(value);
            }

            // Warn about row length mismatch
            if (values.length !== headers.length) {
                warnings.push(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}`);
            }

            records.push(record);
            parsedCount++;
        } catch (error) {
            errors.push({
                row: i + 1,
                message: error instanceof Error ? error.message : 'Parse error',
            });
        }
    }

    return {
        success: errors.length === 0,
        format: FileFormat.CSV,
        records,
        fields: headers,
        totalRows: lines.length - startRow,
        errors,
        warnings,
        meta: {
            delimiter,
        },
    };
}

/**
 * Parse a string value to appropriate type
 *
 * @param value - String value to parse
 * @returns Typed value
 */
function parseValue(value: string): string | number | boolean | null {
    const trimmed = value.trim();

    // Empty string
    if (trimmed === '') return '';

    // Null values - use centralized constants
    const lowerValue = trimmed.toLowerCase();
    if ((NULL_VALUES as readonly string[]).includes(lowerValue)) {
        return null;
    }

    // Boolean values - use centralized constants
    if ((BOOLEAN_TRUE_VALUES as readonly string[]).includes(lowerValue)) return true;
    if ((BOOLEAN_FALSE_VALUES as readonly string[]).includes(lowerValue)) return false;

    // Number values
    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== '') {
        return num;
    }

    return trimmed;
}

/**
 * Generate CSV content from records
 *
 * @param records - Records to convert
 * @param options - CSV options
 * @returns CSV string
 */
export function generateCsv(
    records: Record<string, unknown>[],
    options: { delimiter?: string; includeHeader?: boolean } = {},
): string {
    if (records.length === 0) {
        return '';
    }

    const delimiter = options.delimiter ?? ',';
    const includeHeader = options.includeHeader ?? true;

    const headers = Object.keys(records[0]);
    const lines: string[] = [];

    if (includeHeader) {
        lines.push(headers.map(h => escapeValue(String(h), delimiter)).join(delimiter));
    }

    for (const record of records) {
        const values = headers.map(h => {
            const value = record[h];
            return escapeValue(value == null ? '' : String(value), delimiter);
        });
        lines.push(values.join(delimiter));
    }

    return lines.join('\n');
}

/**
 * Escape a value for CSV output
 *
 * @param value - Value to escape
 * @param delimiter - Current delimiter
 * @returns Escaped value
 */
function escapeValue(value: string, delimiter: string): string {
    const needsQuotes =
        value.includes(delimiter) ||
        value.includes('"') ||
        value.includes('\n') ||
        value.includes('\r');

    if (needsQuotes) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
