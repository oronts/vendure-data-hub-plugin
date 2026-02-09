/**
 * DataHub Parsers - Common Types
 */

import { ParseFormatType } from '../constants/enums';

export type FileFormat = ParseFormatType;

/**
 * CSV delimiter options
 */
export type CsvDelimiter = ',' | ';' | '\t' | '|';

/**
 * Line ending types
 */
export type LineEnding = '\n' | '\r\n' | '\r';

/**
 * Field data types detected during parsing
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'mixed';

/**
 * CSV-specific parse options
 */
export interface CsvParseOptions {
    /** Column delimiter */
    delimiter?: CsvDelimiter;
    /** Whether first row contains headers */
    header?: boolean;
    /** Skip empty lines */
    skipEmptyLines?: boolean;
    /** Character encoding */
    encoding?: BufferEncoding;
    /** Number of rows for preview mode */
    preview?: number;
    /** Quote character for values */
    quoteChar?: string;
    /** Escape character for quotes */
    escapeChar?: string;
    /** Line ending type */
    lineEnding?: LineEnding;
    /** Custom header names (if no header row) */
    headers?: string[];
}

/**
 * JSON-specific parse options
 */
export interface JsonParseOptions {
    /** JSONPath to data array (e.g., "data.items") */
    path?: string;
}

/**
 * XML-specific parse options
 */
export interface XmlParseOptions {
    /** XPath-like path to records (e.g., "//products/product") */
    recordPath?: string;
    /** Prefix for attributes (e.g., "@" for "@id") */
    attributePrefix?: string;
}

/**
 * Excel-specific parse options
 */
export interface XlsxParseOptions {
    /** Sheet name or index (0-based) */
    sheet?: string | number;
    /** Cell range (e.g., "A1:Z100") */
    range?: string;
    /** Whether first row contains headers */
    header?: boolean;
}

/**
 * Combined parse options for all formats
 */
export interface ParseOptions {
    /** File format (auto-detected if not specified) */
    format?: FileFormat;
    /** CSV-specific options */
    csv?: CsvParseOptions;
    /** JSON-specific options */
    json?: JsonParseOptions;
    /** XML-specific options */
    xml?: XmlParseOptions;
    /** Excel-specific options */
    xlsx?: XlsxParseOptions;
    /** Maximum records to parse (for preview) */
    limit?: number;
    /** Skip first N records */
    skip?: number;
}

/**
 * Error encountered during parsing
 */
export interface ParseError {
    /** Row number where error occurred (1-based) */
    row?: number;
    /** Field/column name where error occurred */
    field?: string;
    /** Error message */
    message: string;
    /** Error code for categorization */
    code?: string;
}

/**
 * Result of parsing a file
 */
export interface ParseResult<T = Record<string, unknown>> {
    /** Whether parsing completed successfully */
    success: boolean;
    /** Detected or specified format */
    format: FileFormat;
    /** Parsed records */
    records: T[];
    /** Field/column names */
    fields: string[];
    /** Total number of rows in source */
    totalRows: number;
    /** Errors encountered during parsing */
    errors: ParseError[];
    /** Non-fatal warnings */
    warnings: string[];
    /** Preview data (first N rows) */
    preview?: T[];
    /** Format-specific metadata */
    meta?: ParseMetadata;
}

/**
 * Metadata from parsing
 */
export interface ParseMetadata {
    /** Detected delimiter (CSV) */
    delimiter?: string;
    /** Detected encoding */
    encoding?: string;
    /** Sheet name (Excel) */
    sheetName?: string;
    /** Available sheet names (Excel) */
    availableSheets?: string[];
}

/**
 * Information about a detected field
 */
export interface FieldInfo {
    /** Field key/column name */
    key: string;
    /** Human-readable label */
    label: string;
    /** Detected data type */
    type: FieldType;
    /** Sample values from data */
    sampleValues: unknown[];
    /** Count of null/empty values */
    nullCount: number;
    /** Approximate unique value count */
    uniqueCount?: number;
}

/**
 * File preview result for UI display
 */
export interface FilePreview<T = Record<string, unknown>> {
    /** File format */
    format: FileFormat;
    /** Field information with type detection */
    fields: FieldInfo[];
    /** Sample data rows */
    sampleData: T[];
    /** Total rows in file */
    totalRows: number;
    /** Warnings from parsing */
    warnings: string[];
}

/**
 * Parser interface for format-specific implementations
 */
export interface FormatParser<T = Record<string, unknown>> {
    /**
     * Parse content in this format
     */
    parse(content: string | Buffer, options?: ParseOptions): Promise<ParseResult<T>> | ParseResult<T>;

    /**
     * Check if this parser can handle the given content
     */
    canParse?(content: string | Buffer, filename?: string): boolean;
}

/**
 * Content type mappings for file formats
 */
export const FORMAT_CONTENT_TYPES: Record<FileFormat, string[]> = {
    CSV: ['text/csv', 'text/plain', 'application/csv'],
    JSON: ['application/json', 'text/json'],
    XML: ['application/xml', 'text/xml'],
    XLSX: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
    ],
};

/**
 * File extension mappings for file formats
 */
export const FORMAT_EXTENSIONS: Record<FileFormat, string[]> = {
    CSV: ['csv', 'tsv'],
    JSON: ['json'],
    XML: ['xml'],
    XLSX: ['xlsx', 'xls'],
};
