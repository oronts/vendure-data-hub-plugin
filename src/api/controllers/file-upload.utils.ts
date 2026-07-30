/**
 * DataHub File Upload Utilities
 */

import { isStoredFileId, StoredFile } from '../../services';
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

/** Validate the exact ID format generated for stored files. */
export function isValidFileId(fileId: string): boolean {
    return isStoredFileId(fileId);
}

/** Calculate decoded bytes without allocating the decoded upload buffer. */
export function getBase64DecodedSize(value: string): number {
    const dataUriSeparator = value.startsWith('data:') ? value.indexOf(',') : -1;
    const payload = (dataUriSeparator >= 0 ? value.slice(dataUriSeparator + 1) : value)
        .replace(/\s/g, '');
    if (payload.length === 0) {
        return 0;
    }

    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(payload.length / 4) * 3 - padding);
}
