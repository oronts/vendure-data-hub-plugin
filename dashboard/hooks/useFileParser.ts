/**
 * useFileParser Hook
 */

import * as React from 'react';
import { toast } from 'sonner';
import { parseCSV } from '../utils/parsers';
import {
    detectColumnType,
    analyzeColumns,
    getFileType as getFileTypeFromHelper,
} from '../components/common/file-upload-mapper/helpers';

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

// Re-export utilities
export { detectColumnType, analyzeColumns };

export function getFileType(fileName: string): FileType {
    const result = getFileTypeFromHelper(fileName);
    if (result === 'csv') return 'csv';
    if (result === 'excel') return 'excel';
    if (result === 'json') return 'json';
    const ext = fileName.toLowerCase().split('.').pop();
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
                data = parseCSV(content, { delimiter });
            } else if (fileType === 'json') {
                const content = await file.text();
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed : [parsed];
            } else if (fileType === 'excel') {
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
