/**
 * DataHub File Upload Utilities
 *
 * Helper functions for parsing multipart form data, detecting MIME types,
 * and file format detection. Used by DataHubFileUploadController.
 */

import { StoredFile } from '../../services';

/**
 * Supported file format types
 */
export type FileFormat = 'csv' | 'json' | 'xml' | 'xlsx';

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
        downloadUrl: `/data-hub/files/${file.id}/download`,
        previewUrl: `/data-hub/files/${file.id}/preview`,
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
export function detectFormat(mimeType: string, filename: string): FileFormat {
    const ext = filename.toLowerCase().split('.').pop();

    if (ext === 'csv' || mimeType === 'text/csv') return 'csv';
    if (ext === 'json' || mimeType === 'application/json') return 'json';
    if (ext === 'xml' || mimeType.includes('xml')) return 'xml';
    if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xlsx';

    return 'csv'; // Default
}
