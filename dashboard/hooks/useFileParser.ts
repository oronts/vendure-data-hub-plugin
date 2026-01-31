import * as React from 'react';
import { toast } from 'sonner';
import { parseCSV, analyzeColumns, getFileType } from '../utils';
import type { ParsedColumn, FileType } from '../utils';
import { UI_LIMITS, DATAHUB_API_UPLOAD, DATAHUB_API_FILE_PREVIEW, FILE_FORMAT } from '../constants';
import type { JsonValue, JsonObject } from '../../shared/types';

export type { FileType, ParsedColumn };

export interface ParsedFile {
    fileName: string;
    fileType: FileType;
    rowCount: number;
    columns: ParsedColumn[];
    preview: JsonObject[];
    rawData: JsonObject[];
    fileId?: string;
}

export interface UseFileParserOptions {
    delimiter?: string;
    previewRows?: number;
    useBackendParsing?: boolean;
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

interface BackendUploadResponse {
    success: boolean;
    file?: {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        previewUrl: string;
    };
    error?: string;
}

interface BackendPreviewResponse {
    success: boolean;
    fileId: string;
    originalName: string;
    format: string;
    fields: Array<{
        name: string;
        type: string;
        sampleValues: JsonValue[];
        nullCount: number;
        uniqueCount: number;
    }>;
    sampleData: JsonObject[];
    totalRows: number;
    warnings?: string[];
    error?: string;
}

async function parseFileWithBackend(
    file: File,
    previewRows: number,
): Promise<ParsedFile> {
    const formData = new FormData();
    formData.append('file', file);

    const uploadResponse = await fetch(DATAHUB_API_UPLOAD, {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });

    if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${uploadResponse.status}`);
    }

    const uploadResult: BackendUploadResponse = await uploadResponse.json();

    if (!uploadResult.success || !uploadResult.file) {
        throw new Error(uploadResult.error || 'Upload failed');
    }

    const fileId = uploadResult.file.id;

    const previewResponse = await fetch(
        DATAHUB_API_FILE_PREVIEW(fileId, previewRows),
        {
            method: 'GET',
            credentials: 'include',
        },
    );

    if (!previewResponse.ok) {
        const errorData = await previewResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Preview failed: ${previewResponse.status}`);
    }

    const previewResult: BackendPreviewResponse = await previewResponse.json();

    if (!previewResult.success) {
        throw new Error(previewResult.error || 'Failed to parse file');
    }

    if (previewResult.warnings?.length) {
        previewResult.warnings.forEach(warning => {
            toast.warning(warning);
        });
    }

    const fileType = getFileType(file.name);
    const columns: ParsedColumn[] = previewResult.fields.map(field => ({
        name: field.name,
        type: (field.type as ParsedColumn['type']) || 'unknown',
        sampleValues: field.sampleValues || [],
        nullCount: field.nullCount || 0,
        uniqueCount: field.uniqueCount || 0,
    }));

    return {
        fileName: file.name,
        fileType,
        rowCount: previewResult.totalRows,
        columns,
        preview: previewResult.sampleData,
        rawData: previewResult.sampleData,
        fileId,
    };
}

export function useFileParser(options: UseFileParserOptions = {}): UseFileParserResult {
    const {
        delimiter = ',',
        previewRows = UI_LIMITS.MAX_PREVIEW_ROWS,
        useBackendParsing = true,
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
                throw new Error('Unsupported file type. Supported: CSV, JSON, Excel, XML');
            }

            let result: ParsedFile;

            const needsBackend = fileType === FILE_FORMAT.XLSX || fileType === FILE_FORMAT.XML || useBackendParsing;

            if (needsBackend) {
                result = await parseFileWithBackend(file, previewRows);
            } else {
                let data: JsonObject[] = [];

                if (fileType === FILE_FORMAT.CSV) {
                    const content = await file.text();
                    data = parseCSV(content, { delimiter });
                } else if (fileType === FILE_FORMAT.JSON) {
                    const content = await file.text();
                    const parsed = JSON.parse(content);
                    data = Array.isArray(parsed) ? parsed : [parsed];
                }

                if (data.length === 0) {
                    throw new Error('No data found in file');
                }

                const columns = analyzeColumns(data);

                result = {
                    fileName: file.name,
                    fileType,
                    rowCount: data.length,
                    columns,
                    preview: data.slice(0, previewRows),
                    rawData: data,
                };
            }

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
    }, [delimiter, previewRows, useBackendParsing, onSuccess, onError]);

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
