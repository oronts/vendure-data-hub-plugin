import { parseCSVLine } from '../../shared/utils/csv-parse';
import type { FileType } from '../utils/column-analysis';

export interface FileParseResult {
    headers: string[];
    rows: Record<string, unknown>[];
}

export interface FileParseOptions {
    delimiter?: string;
    hasHeaders?: boolean;
    maxRows?: number;
}

export interface FileFormatEntry {
    value: string;
    label: string;
    extensions: string[];
    mimeTypes: string[];
    supportsPreview: boolean;
    description?: string;
    parse: (file: File, options?: FileParseOptions) => Promise<FileParseResult>;
}

// ---------------------------------------------------------------------------
// Client-side parsers (ONLY formats that need browser preview)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ROWS = 100;

async function parseCsvFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }
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
    const data = json?.data;
    const raw = Array.isArray(json) ? json : Array.isArray(data) ? data : data && typeof data === 'object' && !Array.isArray(data) ? [data] : [json];
    const items: Record<string, unknown>[] = raw.filter((item: unknown) => item != null && typeof item === 'object' && !Array.isArray(item));
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

async function parseXmlFile(_file: File, _options?: FileParseOptions): Promise<FileParseResult> {
    return { headers: [], rows: [] };
}

async function parseNdjsonFile(file: File, options?: FileParseOptions): Promise<FileParseResult> {
    const text = await file.text();
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const lines = text.split('\n').filter(line => line.trim());
    const items: Record<string, unknown>[] = [];
    for (const line of lines) {
        if (items.length >= maxRows) break;
        try {
            items.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
            // Skip malformed lines in preview
        }
    }
    const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
    return { headers, rows: items };
}

export const FILE_FORMAT_REGISTRY = new Map<string, FileFormatEntry>([
    ['CSV', {
        value: 'CSV',
        label: 'CSV',
        extensions: ['.csv'],
        mimeTypes: ['text/csv'],
        supportsPreview: true,
        parse: parseCsvFile,
    }],
    ['TSV', {
        value: 'TSV',
        label: 'TSV',
        extensions: ['.tsv'],
        mimeTypes: ['text/tab-separated-values'],
        supportsPreview: true,
        parse: (file, options) => parseCsvFile(file, { ...options, delimiter: '\t' }),
    }],
    ['JSON', {
        value: 'JSON',
        label: 'JSON',
        extensions: ['.json'],
        mimeTypes: ['application/json'],
        supportsPreview: true,
        parse: parseJsonFile,
    }],
    ['XML', {
        value: 'XML',
        label: 'XML',
        extensions: ['.xml'],
        mimeTypes: ['text/xml', 'application/xml'],
        supportsPreview: false,
        parse: parseXmlFile,
    }],
    ['XLSX', {
        value: 'XLSX',
        label: 'Excel',
        extensions: ['.xlsx', '.xls'],
        mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        supportsPreview: true,
        parse: parseXlsxFile,
    }],
    ['NDJSON', {
        value: 'NDJSON',
        label: 'NDJSON',
        extensions: ['.ndjson', '.jsonl'],
        mimeTypes: ['application/x-ndjson'],
        supportsPreview: true,
        parse: parseNdjsonFile,
    }],
]);

export function buildAcceptString(
    allowedTypes?: string[],
    registry: Map<string, FileFormatEntry> = FILE_FORMAT_REGISTRY
): string {
    if (!allowedTypes || allowedTypes.length === 0) return '*';
    const extensions: string[] = [];
    for (const type of allowedTypes) {
        const entry = registry.get(type);
        if (entry) {
            extensions.push(...entry.extensions);
        }
    }
    return extensions.length > 0 ? extensions.join(',') : '*';
}

export function detectFileFormat(
    fileName: string,
    registry: Map<string, FileFormatEntry> = FILE_FORMAT_REGISTRY
): FileType {
    const ext = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '');
    for (const [format, entry] of registry) {
        if (entry.extensions.includes(ext)) {
            return format as NonNullable<FileType>;
        }
    }
    return null;
}
