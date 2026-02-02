/**
 * DataHub File Upload Utilities
 */

import { StoredFile } from '../../services';
import { ParseFormatType, FileFormat } from '../../constants/enums';

export type FileFormatAlias = ParseFormatType;

/**
 * MIME type to file extension mapping
 */
export const MIME_TYPE_MAP: Record<string, string> = {
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    txt: 'text/plain',
} as const;

/**
 * Default MIME type for unknown file types
 */
export const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Base path for DataHub file endpoints - used to construct download/preview URLs
 */
export const DATAHUB_FILES_PATH = '/data-hub/files';

/**
 * Format a stored file for API response
 */
export function formatFileResponse(file: StoredFile): {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    hash: string;
    uploadedAt: string;
    expiresAt?: string;
    downloadUrl: string;
    previewUrl: string;
} {
    return {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        hash: file.hash,
        uploadedAt: file.uploadedAt.toISOString(),
        expiresAt: file.expiresAt?.toISOString(),
        downloadUrl: `${DATAHUB_FILES_PATH}/${file.id}/download`,
        previewUrl: `${DATAHUB_FILES_PATH}/${file.id}/preview`,
    };
}

/**
 * Extract boundary from Content-Type header
 */
export function extractBoundary(contentType: string): string | null {
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    return match ? (match[1] || match[2]) : null;
}

/**
 * Parse multipart form data
 */
export function parseMultipart(body: Buffer, boundary: string): {
    filename: string | null;
    mimeType: string | null;
    content: Buffer | null;
} {
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts = splitBuffer(body, boundaryBuffer);

    for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const headers = part.slice(0, headerEnd).toString('utf-8');
        const content = part.slice(headerEnd + 4);

        // Check if this is a file part
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

        if (filenameMatch) {
            // Remove trailing boundary markers
            let cleanContent = content;
            const endIndex = cleanContent.lastIndexOf('\r\n');
            if (endIndex > 0) {
                cleanContent = cleanContent.slice(0, endIndex);
            }

            return {
                filename: filenameMatch[1],
                mimeType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
                content: cleanContent,
            };
        }
    }

    return { filename: null, mimeType: null, content: null };
}

/**
 * Split a buffer by a delimiter
 */
export function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
    const parts: Buffer[] = [];
    let start = 0;
    let index: number;

    while ((index = buffer.indexOf(delimiter, start)) !== -1) {
        if (index > start) {
            parts.push(buffer.slice(start, index));
        }
        start = index + delimiter.length;
    }

    if (start < buffer.length) {
        parts.push(buffer.slice(start));
    }

    return parts;
}

/**
 * Detect MIME type from filename extension
 */
export function detectMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    return MIME_TYPE_MAP[ext || ''] || DEFAULT_MIME_TYPE;
}

/**
 * Detect file format from MIME type and filename
 */
export function detectFormat(mimeType: string, filename: string): FileFormatAlias {
    const ext = filename.toLowerCase().split('.').pop();

    if (ext === FileFormat.CSV || mimeType === 'text/csv') return FileFormat.CSV;
    if (ext === FileFormat.JSON || mimeType === 'application/json') return FileFormat.JSON;
    if (ext === FileFormat.XML || mimeType.includes('xml')) return FileFormat.XML;
    if (ext === FileFormat.XLSX || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileFormat.XLSX;

    return FileFormat.CSV; // Default
}

/**
 * Validate file ID format
 * File IDs are UUIDs (v4) or similar alphanumeric strings with hyphens
 */
export function isValidFileId(fileId: string): boolean {
    if (!fileId || typeof fileId !== 'string') {
        return false;
    }
    // Allow UUIDs and alphanumeric IDs with hyphens/underscores (common ID formats)
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // Also allow simpler alphanumeric IDs
    const validIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
    return validIdPattern.test(fileId);
}
