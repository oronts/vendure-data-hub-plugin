/**
 * DataHub File Upload Utilities
 */

import { StoredFile } from '../../services';
import { ParseFormatType, FileFormat } from '../../constants/enums';
import { extractFileExtension } from '../../extractors/shared/file-format.utils';

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
 * Detect MIME type from filename extension
 */
export function detectMimeType(filename: string): string {
    const ext = extractFileExtension(filename);
    return MIME_TYPE_MAP[ext || ''] || DEFAULT_MIME_TYPE;
}

/**
 * Detect file format from MIME type and filename
 */
export function detectFormat(mimeType: string, filename: string): FileFormatAlias {
    const ext = extractFileExtension(filename).toUpperCase();

    if (ext === 'CSV' || mimeType === 'text/csv') return 'CSV';
    if (ext === 'JSON' || mimeType === 'application/json') return 'JSON';
    if (ext === 'XML' || mimeType.includes('xml')) return 'XML';
    if (ext === 'XLSX' || ext === 'XLS' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'XLSX';

    return 'CSV'; // Default
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
