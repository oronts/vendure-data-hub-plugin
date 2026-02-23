/**
 * DataHub File Upload Utilities
 */

import { StoredFile } from '../../services';
import { ParseFormatType } from '../../constants/enums';
import { CONTENT_TYPES, EXTENSION_MIME_MAP } from '../../constants/index';
import { extractFileExtension } from '../../extractors/shared/file-format.utils';

type FileFormatAlias = ParseFormatType;

/**
 * Base path for DataHub file endpoints - used to construct download/preview URLs
 */
const DATAHUB_FILES_PATH = '/data-hub/files';

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
    return EXTENSION_MIME_MAP[`.${ext}`] ?? CONTENT_TYPES.OCTET_STREAM;
}

/**
 * Detect file format from MIME type and filename
 */
export function detectFormat(mimeType: string, filename: string): FileFormatAlias {
    const ext = extractFileExtension(filename).toUpperCase();

    if (ext === 'CSV' || mimeType === CONTENT_TYPES.CSV) return 'CSV';
    if (ext === 'JSON' || mimeType === CONTENT_TYPES.JSON) return 'JSON';
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
