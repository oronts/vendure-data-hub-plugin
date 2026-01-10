/**
 * useFileParser Hook
 * Custom hook for parsing different file formats (CSV, JSON, Excel, XML)
 */

import * as React from 'react';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

export type FileType = 'csv' | 'json' | 'excel' | 'xml' | null;

export interface ParsedColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
    sampleValues: any[];
    nullCount: number;
    uniqueCount: number;
}

export interface ParsedFile {
    fileName: string;
    fileType: FileType;
    rowCount: number;
    columns: ParsedColumn[];
    preview: Record<string, any>[];
    rawData: Record<string, any>[];
}

export interface UseFileParserOptions {
    delimiter?: string;
    previewRows?: number;
    onSuccess?: (result: ParsedFile) => void;
    onError?: (error: Error) => void;
}

export interface UseFileParserResult {
    parse: (file: File) => Promise<ParsedFile | null>;
    parsedFile: ParsedFile | null;
    loading: boolean;
    error: Error | null;
    reset: () => void;
}

// =============================================================================
// CSV PARSER
// =============================================================================

function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(content: string, delimiter = ','): Record<string, any>[] {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter);
        const row: Record<string, any> = {};
        headers.forEach((header, idx) => {
            const value = values[idx]?.trim().replace(/^"|"$/g, '') ?? '';
            row[header] = value;
        });
        rows.push(row);
    }

    return rows;
}

// =============================================================================
// TYPE DETECTION
// =============================================================================

function detectColumnType(values: any[]): ParsedColumn['type'] {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNullValues.length === 0) return 'unknown';

    let numCount = 0;
    let boolCount = 0;
    let dateCount = 0;

    for (const val of nonNullValues) {
        const str = String(val).trim().toLowerCase();

        // Boolean check
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(str)) {
            boolCount++;
            continue;
        }

        // Number check
        if (!isNaN(Number(val)) && str !== '') {
            numCount++;
            continue;
        }

        // Date check
        const date = new Date(val);
        if (!isNaN(date.getTime()) && str.length > 4) {
            dateCount++;
        }
    }

    const total = nonNullValues.length;
    if (numCount / total > 0.8) return 'number';
    if (boolCount / total > 0.8) return 'boolean';
    if (dateCount / total > 0.8) return 'date';
    return 'string';
}

function analyzeColumns(data: Record<string, any>[]): ParsedColumn[] {
    if (data.length === 0) return [];

    const columns: ParsedColumn[] = [];
    const firstRow = data[0];

    for (const key of Object.keys(firstRow)) {
        const values = data.map(row => row[key]);
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
        const uniqueValues = new Set(nonNullValues);

        columns.push({
            name: key,
            type: detectColumnType(values),
            sampleValues: nonNullValues.slice(0, 5),
            nullCount: values.length - nonNullValues.length,
            uniqueCount: uniqueValues.size,
        });
    }

    return columns;
}

// =============================================================================
// FILE TYPE DETECTION
// =============================================================================

export function getFileType(fileName: string): FileType {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    if (ext === 'json') return 'json';
    if (ext === 'xml') return 'xml';
    return null;
}

// =============================================================================
// HOOK
// =============================================================================

export function useFileParser(options: UseFileParserOptions = {}): UseFileParserResult {
    const {
        delimiter = ',',
        previewRows = 10,
        onSuccess,
        onError,
    } = options;

    const [parsedFile, setParsedFile] = React.useState<ParsedFile | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);

    const parse = React.useCallback(async (file: File): Promise<ParsedFile | null> => {
        setLoading(true);
        setError(null);

        try {
            const fileType = getFileType(file.name);
            if (!fileType) {
                throw new Error('Unsupported file type');
            }

            let data: Record<string, any>[] = [];

            if (fileType === 'csv') {
                const content = await file.text();
                data = parseCSV(content, delimiter);
            } else if (fileType === 'json') {
                const content = await file.text();
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed : [parsed];
            } else if (fileType === 'excel') {
                // Excel parsing requires a library like xlsx
                throw new Error('Excel parsing requires xlsx library. Please use CSV or JSON format.');
            } else if (fileType === 'xml') {
                throw new Error('XML parsing is not yet supported. Please use CSV or JSON format.');
            }

            if (data.length === 0) {
                throw new Error('No data found in file');
            }

            const columns = analyzeColumns(data);

            const result: ParsedFile = {
                fileName: file.name,
                fileType,
                rowCount: data.length,
                columns,
                preview: data.slice(0, previewRows),
                rawData: data,
            };

            setParsedFile(result);
            onSuccess?.(result);
            return result;

        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to parse file');
            setError(error);
            onError?.(error);
            toast.error(error.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [delimiter, previewRows, onSuccess, onError]);

    const reset = React.useCallback(() => {
        setParsedFile(null);
        setLoading(false);
        setError(null);
    }, []);

    return {
        parse,
        parsedFile,
        loading,
        error,
        reset,
    };
}

export default useFileParser;
