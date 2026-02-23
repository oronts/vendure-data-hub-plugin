/**
 * Unified file format registry.
 *
 * Adding a new import file format (e.g. PARQUET) requires a single entry
 * here instead of touching 5 separate files. Every consumer -- ImportWizard,
 * FileDropzone and column-analysis -- reads from this map.
 */

import { FILE_FORMAT } from '../../shared/constants';
import { parseCSVLine } from '../../shared/utils/csv-parse';
import type { FileType } from '../utils/column-analysis';

/** Result returned by a format parser. */
export interface FileParseResult {
    /** Extracted column/header names */
    headers: string[];
    /** Parsed data rows (up to preview limit) */
    rows: Record<string, unknown>[];
}

/** Options forwarded to format parsers that need them. */
export interface FileParseOptions {
    /** CSV delimiter character (default: ',') */
    delimiter?: string;
    /** Whether CSV has a header row (default: true) */
    hasHeaders?: boolean;
    /** Maximum rows to return for preview */
    maxRows?: number;
}

/** Metadata and parser for a single file format. */
export interface FileFormatEntry {
    /** File extensions accepted (with leading dot), e.g. ['.csv', '.tsv'] */
    extensions: string[];
    /** MIME types for the HTML accept attribute */
    mimeTypes: string[];
    /** Parse a File into headers + rows. Options only used by formats that need them. */
    parse: (file: File, options?: FileParseOptions) => Promise<FileParseResult>;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ROWS = 100;

async function parseCsvFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const delimiter = options?.delimiter ?? ',';
    const hasHeaders = options?.hasHeaders ?? true;
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;

    const headers = hasHeaders
        ? parseCSVLine(lines[0], delimiter).map(h => h.replace(/^["']|["']$/g, ''))
        : parseCSVLine(lines[0], delimiter).map((_, i) => `column_${i + 1}`);

    const dataLines = hasHeaders ? lines.slice(1) : lines;
    const rows = dataLines.slice(0, maxRows).map(line => {
        const values = parseCSVLine(line, delimiter).map(v => v.replace(/^["']|["']$/g, ''));
        const row: Record<string, unknown> = {};
        headers.forEach((header, i) => {
            row[header] = values[i] ?? '';
        });
        return row;
    });

    return { headers, rows };
}

async function parseJsonFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const text = await file.text();
    const json = JSON.parse(text);
    const items: Record<string, unknown>[] = Array.isArray(json) ? json : json.data ?? [json];
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const sampleItems = items.slice(0, maxRows);
    const headers = [...new Set(sampleItems.flatMap(item => Object.keys(item)))];
    return { headers, rows: sampleItems };
}

async function parseXlsxFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const { read, utils } = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel file has no sheets');
    const sheet = workbook.Sheets[sheetName];
    const jsonRows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const sampleItems = jsonRows.slice(0, maxRows);
    const headers = [...new Set(sampleItems.flatMap(item => Object.keys(item)))];
    return { headers, rows: sampleItems };
}

async function parseXmlFile(file: File, _options?: FileParseOptions): Promise<FileParseResult> {
    // XML files are not client-side parsed for preview -- return empty result.
    // The backend extractor handles real XML parsing at runtime.
    void file;
    return { headers: [], rows: [] };
}

async function parseNdjsonFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const text = await file.text();
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const lines = text.split('\n').filter(line => line.trim());
    const items: Record<string, unknown>[] = [];
    for (const line of lines) {
        if (items.length >= maxRows) break;
        items.push(JSON.parse(line) as Record<string, unknown>);
    }
    const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
    return { headers, rows: items };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FILE_FORMAT_REGISTRY = new Map<string, FileFormatEntry>([
    [FILE_FORMAT.CSV, {
        extensions: ['.csv', '.tsv'],
        mimeTypes: ['text/csv', 'text/tab-separated-values'],
        parse: parseCsvFile,
    }],
    [FILE_FORMAT.JSON, {
        extensions: ['.json'],
        mimeTypes: ['application/json'],
        parse: parseJsonFile,
    }],
    [FILE_FORMAT.XML, {
        extensions: ['.xml'],
        mimeTypes: ['text/xml', 'application/xml'],
        parse: parseXmlFile,
    }],
    [FILE_FORMAT.XLSX, {
        extensions: ['.xlsx', '.xls'],
        mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        parse: parseXlsxFile,
    }],
    [FILE_FORMAT.NDJSON, {
        extensions: ['.ndjson', '.jsonl'],
        mimeTypes: ['application/x-ndjson'],
        parse: parseNdjsonFile,
    }],
]);

// ---------------------------------------------------------------------------
// Derived helpers (used by consumer files)
// ---------------------------------------------------------------------------

/**
 * Build an HTML `accept` attribute string from an array of allowed format keys.
 * If no types are specified, returns '*' (accept all).
 */
export function buildAcceptString(allowedTypes?: string[]): string {
    if (!allowedTypes || allowedTypes.length === 0) return '*';
    const extensions: string[] = [];
    for (const type of allowedTypes) {
        const entry = FILE_FORMAT_REGISTRY.get(type);
        if (entry) {
            extensions.push(...entry.extensions);
        }
    }
    return extensions.length > 0 ? extensions.join(',') : '*';
}

/**
 * Detect file format from a filename extension.
 * Returns the FILE_FORMAT constant string, or null if unrecognized.
 */
export function detectFileFormat(fileName: string): FileType {
    const ext = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '');
    for (const [format, entry] of FILE_FORMAT_REGISTRY) {
        if (entry.extensions.includes(ext)) {
            return format as NonNullable<FileType>;
        }
    }
    return null;
}
